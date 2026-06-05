/**
 * SBI IPO Monitor Worker
 *
 * Monitors the SBI Securities foreign stock IPO page for the
 * 「購入申込する」(Apply for Purchase) button availability.
 *
 * Endpoints:
 *   GET  /              - Landing page
 *   POST /api/subscribe  - Register email for notifications
 *   GET  /api/unsubscribe - Unsubscribe from notifications
 *   GET  /api/status     - Get current IPO button status
 *   GET  /api/stats      - Get subscriber count (public)
 *
 * Cron: Every 5 minutes - Check IPO page
 */

import { Database } from "./db";
import { checkIPOButton } from "./checker";
import {
  sendWelcomeEmail,
  sendIPOAvailableEmail,
  sendTestEmail,
  type EmailConfig,
} from "./email";

// =============================================================================
// Environment bindings
// =============================================================================

export interface Env {
  DB: D1Database;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  // Environment variables
  SBI_IPO_URL: string;
  SITE_TITLE: string;
  SENDER_EMAIL: string;
  SENDER_NAME: string;
  SITE_URL: string;
  // Optional: Email binding for sending via Cloudflare
  EMAIL?: { send: (message: unknown) => Promise<void> };
}

// =============================================================================
// Fetch handler (HTTP)
// =============================================================================

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    // CORS headers for API responses
    const corsHeaders: Record<string, string> = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // API Routes
    try {
      // POST /api/subscribe
      if (method === "POST" && pathname === "/api/subscribe") {
        return handleSubscribe(request, env, corsHeaders);
      }

      // GET /api/unsubscribe
      if (method === "GET" && pathname === "/api/unsubscribe") {
        return handleUnsubscribe(url, env, corsHeaders);
      }

      // GET /api/status
      if (method === "GET" && pathname === "/api/status") {
        return handleStatus(env, corsHeaders);
      }

      // GET /api/stats
      if (method === "GET" && pathname === "/api/stats") {
        return handleStats(env, corsHeaders);
      }

      // POST /api/test-email — Send a test email (for E2E testing)
      if (method === "POST" && pathname === "/api/test-email") {
        return handleTestEmail(request, env, corsHeaders);
      }
    } catch (error) {
      return jsonResponse(
        { error: "Internal server error" },
        500,
        corsHeaders
      );
    }

    // Serve static assets (landing page)
    return env.ASSETS.fetch(request);
  },

  // ===========================================================================
  // Scheduled handler (Cron)
  // ===========================================================================

  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    console.log(`[Cron] Starting IPO check: ${controller.cron}`);

    const db = new Database(env.DB);

    ctx.waitUntil(
      (async () => {
        try {
          // 1. Check the IPO page
          console.log(`[Cron] Fetching: ${env.SBI_IPO_URL}`);
          const result = await checkIPOButton(env.SBI_IPO_URL);

          // 2. Log the check
          const checkId = await db.addCheckLog({
            checked_at: new Date().toISOString(),
            button_found: result.buttonFound,
            button_enabled: result.buttonEnabled,
            button_text: result.buttonText,
            page_title: result.pageTitle,
            response_time_ms: result.responseTimeMs,
            notified: false,
            error_message: result.error,
          });

          console.log(
            `[Cron] Check complete: found=${result.buttonFound}, enabled=${result.buttonEnabled}, ` +
            `status=${result.statusInfo}, time=${result.responseTimeMs}ms`
          );

          // 3. If button is available AND we haven't notified yet → send emails
          if (result.buttonFound && result.buttonEnabled) {
            const alreadyNotified = await db.hasNotifiedForLatest();

            if (alreadyNotified) {
              console.log("[Cron] Button is available but already notified. Skipping.");
              return;
            }

            console.log("[Cron] 🚀 Button is available! Sending notifications...");

            const subscribers = await db.getActiveSubscribers();
            console.log(`[Cron] Sending to ${subscribers.length} subscribers`);

            const emailConfig: EmailConfig = {
              senderEmail: env.SENDER_EMAIL,
              senderName: env.SENDER_NAME,
              siteUrl: env.SITE_URL,
              siteTitle: env.SITE_TITLE,
            };

            let successCount = 0;
            let failCount = 0;

            // Send emails in batches of 5 to avoid rate limiting
            const BATCH_SIZE = 5;
            for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
              const batch = subscribers.slice(i, i + BATCH_SIZE);
              const results = await Promise.allSettled(
                batch.map(async (sub) => {
                  const emailResult = await sendIPOAvailableEmail(
                    sub.email,
                    sub.token,
                    emailConfig
                  );
                  await db.recordNotification(
                    checkId,
                    sub.email,
                    emailResult.success ? "sent" : "failed"
                  );
                  return emailResult;
                })
              );

              for (const r of results) {
                if (r.status === "fulfilled" && r.value.success) successCount++;
                else failCount++;
              }

              // Small delay between batches
              if (i + BATCH_SIZE < subscribers.length) {
                await sleep(500);
              }
            }

            // Log notification event
            await db.addNotificationLog(subscribers.length, successCount, failCount);
            await db.markNotified(checkId);

            console.log(
              `[Cron] Notifications sent: ${successCount} success, ${failCount} failed`
            );
          }
        } catch (error) {
          console.error("[Cron] Error during scheduled check:", error);
          controller.noRetry(); // Don't retry on unexpected errors
        }
      })()
    );
  },
};

// =============================================================================
// API Handlers
// =============================================================================

/** POST /api/subscribe - Register an email address */
async function handleSubscribe(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const body = await request.json().catch(() => null) as { email?: string } | null;

  if (!body || !body.email) {
    return jsonResponse(
      { success: false, message: "メールアドレスを入力してください。" },
      400,
      corsHeaders
    );
  }

  const email = String(body.email).trim();

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return jsonResponse(
      { success: false, message: "有効なメールアドレスを入力してください。" },
      400,
      corsHeaders
    );
  }

  const db = new Database(env.DB);
  const result = await db.addSubscriber(email);

  if (result.success && result.token) {
    // Send welcome email in the background
    const emailConfig: EmailConfig = {
      senderEmail: env.SENDER_EMAIL,
      senderName: env.SENDER_NAME,
      siteUrl: env.SITE_URL,
      siteTitle: env.SITE_TITLE,
    };

    // Don't await - send in background
    // Using void to explicitly ignore the promise
    void sendWelcomeEmail(email, result.token, emailConfig).catch((err) => {
      console.error("Failed to send welcome email:", err);
    });
  }

  return jsonResponse(result, result.success ? 200 : 400, corsHeaders);
}

/** GET /api/unsubscribe?email=...&token=... - Unsubscribe */
async function handleUnsubscribe(
  url: URL,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const email = url.searchParams.get("email");
  const token = url.searchParams.get("token");

  if (!email || !token) {
    return jsonResponse(
      { success: false, message: "無効なURLです。" },
      400,
      corsHeaders
    );
  }

  const db = new Database(env.DB);
  const result = await db.unsubscribe(email, token);

  // If it's a browser request, redirect to the landing page with a message
  const isApiRequest = url.searchParams.get("format") === "json";
  if (!isApiRequest) {
    const message = encodeURIComponent(result.message);
    return Response.redirect(
      `${env.SITE_URL}?message=${message}&type=${result.success ? "success" : "error"}`,
      302
    );
  }

  return jsonResponse(result, result.success ? 200 : 400, corsHeaders);
}

/** GET /api/status - Get current IPO button status */
async function handleStatus(
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const db = new Database(env.DB);

  // Get latest check and stats
  const [latestCheck, checkLogs, activeCount] = await Promise.all([
    db.getLatestCheckLog(),
    db.getCheckLogs(5),
    db.getActiveSubscriberCount(),
  ]);

  return jsonResponse(
    {
      latestCheck: latestCheck
        ? {
            checkedAt: latestCheck.checked_at,
            buttonFound: latestCheck.button_found,
            buttonEnabled: latestCheck.button_enabled,
            buttonText: latestCheck.button_text,
            statusInfo: latestCheck.error_message || "Check completed",
            notified: latestCheck.notified,
            responseTimeMs: latestCheck.response_time_ms,
          }
        : null,
      recentChecks: checkLogs.map((log) => ({
        checkedAt: log.checked_at,
        buttonFound: log.button_found,
        buttonEnabled: log.button_enabled,
        notified: log.notified,
      })),
      activeSubscribers: activeCount,
      lastCheckedAt: latestCheck?.checked_at ?? null,
    },
    200,
    corsHeaders
  );
}

/** GET /api/stats - Public stats */
async function handleStats(
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const db = new Database(env.DB);
  const count = await db.getActiveSubscriberCount();

  return jsonResponse(
    {
      activeSubscribers: count,
      monitoring: true,
      checkInterval: "5 minutes",
    },
    200,
    corsHeaders
  );
}

/** POST /api/test-email - Send a test email (for E2E verification) */
async function handleTestEmail(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const body = await request.json().catch(() => null) as { email?: string } | null;

  const testEmail = body?.email || "lexluthor0304@gmail.com";

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(testEmail)) {
    return jsonResponse(
      { success: false, message: "有効なメールアドレスを入力してください。" },
      400,
      corsHeaders
    );
  }

  const emailConfig: EmailConfig = {
    senderEmail: env.SENDER_EMAIL,
    senderName: env.SENDER_NAME,
    siteUrl: env.SITE_URL,
    siteTitle: env.SITE_TITLE,
  };

  const result = await sendTestEmail(testEmail, emailConfig);

  return jsonResponse(
    {
      success: result.success,
      message: result.success
        ? `テストメールを ${testEmail} に送信しました。`
        : `送信失敗: ${result.error}`,
      error: result.error,
    },
    result.success ? 200 : 500,
    corsHeaders
  );
}

// =============================================================================
// Utilities
// =============================================================================

/** Send a JSON response */
function jsonResponse(
  data: unknown,
  status: number,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

/** Sleep for a given duration in milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
