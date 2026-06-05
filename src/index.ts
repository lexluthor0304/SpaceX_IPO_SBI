/**
 * SBI IPO Monitor Worker
 */
import { Database } from "./db";
import { checkIPOButton } from "./checker";
import { sendWelcomeEmail, sendIPOAvailableEmail, sendTestEmail, type EmailConfig } from "./email";

export interface Env {
  DB: D1Database;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  SBI_IPO_URL: string;
  SITE_TITLE: string;
  SENDER_EMAIL: string;
  SENDER_NAME: string;
  SITE_URL: string;
  EMAIL: SendEmail;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    console.log(`[fetch] ${method} ${pathname}`);

    const corsHeaders: Record<string, string> = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // API: health check (no deps)
    if (pathname === "/api/health") {
      return new Response(JSON.stringify({ status: "ok", time: Date.now() }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // API: stats (needs D1)
    if (pathname === "/api/stats") {
      try {
        const db = new Database(env.DB);
        const [count, totalChecks] = await Promise.all([
          db.getActiveSubscriberCount(),
          db.getTotalCheckCount(),
        ]);
        return new Response(JSON.stringify({ activeSubscribers: count, totalChecks, monitoring: true }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[stats error]", msg);
        return new Response(JSON.stringify({ error: msg }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    // API: status (needs D1)
    if (pathname === "/api/status") {
      try {
        const db = new Database(env.DB);
        const [latest, logs, count, totalChecks] = await Promise.all([
          db.getLatestCheckLog(),
          db.getCheckLogs(5),
          db.getActiveSubscriberCount(),
          db.getTotalCheckCount(),
        ]);
        return new Response(JSON.stringify({
          latestCheck: latest ? { checkedAt: latest.checked_at, buttonFound: latest.button_found, buttonEnabled: latest.button_enabled } : null,
          recentChecks: logs.map(l => ({ checkedAt: l.checked_at, buttonFound: l.button_found })),
          activeSubscribers: count,
          totalChecks,
        }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[status error]", msg);
        return new Response(JSON.stringify({ error: msg }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    // API: subscribe (needs D1)
    if (pathname === "/api/subscribe" && method === "POST") {
      try {
        const body = await request.json().catch(() => null) as { email?: string } | null;
        if (!body?.email) {
          return new Response(JSON.stringify({ success: false, message: "メールアドレスを入力してください。" }), {
            status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
        const email = String(body.email).trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return new Response(JSON.stringify({ success: false, message: "有効なメールアドレスを入力してください。" }), {
            status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
        const db = new Database(env.DB);
        const result = await db.addSubscriber(email);
        if (result.success && result.token) {
          const cfg: EmailConfig = { senderEmail: env.SENDER_EMAIL, senderName: env.SENDER_NAME, siteUrl: env.SITE_URL, siteTitle: env.SITE_TITLE, emailBinding: env.EMAIL };
          void sendWelcomeEmail(email, result.token, cfg).catch(e => console.error("welcome email failed:", e));
        }
        return new Response(JSON.stringify(result), {
          status: result.success ? 200 : 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[subscribe error]", msg);
        return new Response(JSON.stringify({ error: msg }), {
          status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    // API: unsubscribe
    if (pathname === "/api/unsubscribe") {
      try {
        const email = url.searchParams.get("email");
        const token = url.searchParams.get("token");
        if (!email || !token) {
          return new Response(JSON.stringify({ success: false, message: "無効なURLです。" }), {
            status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
        const db = new Database(env.DB);
        const result = await db.unsubscribe(email, token);
        if (url.searchParams.get("format") === "json") {
          return new Response(JSON.stringify(result), {
            status: result.success ? 200 : 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
        const msg = encodeURIComponent(result.message);
        return Response.redirect(`${env.SITE_URL}?message=${msg}&type=${result.success ? "success" : "error"}`, 302);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[unsubscribe error]", msg);
        return new Response(JSON.stringify({ error: msg }), {
          status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    // API: test-email
    if (pathname === "/api/test-email" && method === "POST") {
      try {
        const body = await request.json().catch(() => null) as { email?: string } | null;
        const testEmail = body?.email || "lexluthor0304@gmail.com";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
          return new Response(JSON.stringify({ success: false, message: "無効なメールアドレスです。" }), {
            status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
        const cfg: EmailConfig = { senderEmail: env.SENDER_EMAIL, senderName: env.SENDER_NAME, siteUrl: env.SITE_URL, siteTitle: env.SITE_TITLE, emailBinding: env.EMAIL };
        const result = await sendTestEmail(testEmail, cfg);
        return new Response(JSON.stringify({ success: result.success, message: result.success ? `テストメールを${testEmail}に送信しました` : result.error }), {
          status: result.success ? 200 : 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[test-email error]", msg);
        return new Response(JSON.stringify({ error: msg }), {
          status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    // Fallback: Static Assets (landing page)
    try {
      return await env.ASSETS.fetch(request);
    } catch (err) {
      console.error("[assets error]", err);
      return new Response("Asset fetch failed", { status: 500 });
    }
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const db = new Database(env.DB);
    ctx.waitUntil((async () => {
      try {
        // Get last ETag for conditional request (minimizes server load)
        const lastEtag = await db.getState("last_etag");

        const result = await checkIPOButton(env.SBI_IPO_URL, lastEtag);

        // Save new ETag for next check
        if (result.etag) {
          await db.setState("last_etag", result.etag);
        }

        // Log every check (even 304s, for monitoring)
        const checkId = await db.addCheckLog({
          checked_at: new Date().toISOString(),
          button_found: result.buttonFound,
          button_enabled: result.buttonEnabled,
          button_text: result.buttonText,
          page_title: result.pageTitle,
          response_time_ms: result.responseTimeMs,
          notified: false,
          error_message: result.error,
          httpStatus: result.httpStatus,
          pageChanged: result.modified,
          etag: result.etag,
        });

        // 304: page unchanged, skip analysis
        if (!result.modified) {
          // Only log every 10 minutes to reduce noise
          const min = new Date().getUTCMinutes();
          if (min % 10 === 0) {
            console.log(`[Cron] 304 unchanged (${result.responseTimeMs}ms) etag=${result.etag?.substring(0, 12)}...`);
          }
          return;
        }

        console.log(`[Cron] 200 found=${result.buttonFound} enabled=${result.buttonEnabled} (${result.responseTimeMs}ms)`);

        // Button available → notify all subscribers
        if (result.buttonFound && result.buttonEnabled && !(await db.hasNotifiedForLatest())) {
          const subs = await db.getActiveSubscribers();
          console.log(`[Cron] 🚀 Notifying ${subs.length} subscribers`);
          const cfg: EmailConfig = { senderEmail: env.SENDER_EMAIL, senderName: env.SENDER_NAME, siteUrl: env.SITE_URL, siteTitle: env.SITE_TITLE, emailBinding: env.EMAIL };
          let ok = 0, fail = 0;
          for (let i = 0; i < subs.length; i += 5) {
            const batch = subs.slice(i, i + 5);
            const results = await Promise.allSettled(batch.map(async s => {
              const r = await sendIPOAvailableEmail(s.email, s.token, cfg);
              await db.recordNotification(checkId, s.email, r.success ? "sent" : "failed");
              return r;
            }));
            for (const r of results) {
              if (r.status === "fulfilled" && r.value.success) ok++; else fail++;
            }
            if (i + 5 < subs.length) await new Promise(r => setTimeout(r, 500));
          }
          await db.addNotificationLog(subs.length, ok, fail);
          await db.markNotified(checkId);
          console.log(`[Cron] ${ok} ok, ${fail} failed`);
        }
      } catch (err) {
        console.error("[Cron] Error:", err);
      }
    })());
  },
};
