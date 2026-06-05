/**
 * E2E Tests for SBI IPO Monitor Worker
 *
 * Tests the Worker's HTTP API endpoints using wrangler's unstable_dev.
 * For email sending tests, use test/e2e-deployed.sh against the deployed Worker.
 *
 * Run: npx vitest run
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { unstable_dev } from "wrangler";

let worker: Awaited<ReturnType<typeof unstable_dev>>;

beforeAll(async () => {
  worker = await unstable_dev("src/index.ts", {
    experimental: { disableExperimentalWarning: true },
    vars: {
      SBI_IPO_URL: "https://www.sbisec.co.jp/ETGate/?_ControlID=WPLETmgR001Control&_PageID=WPLETmgR001Mdtl30&_ActionID=DefaultAID&_DataStoreID=DSWPLETmgR001Control&OutSide=on&getFlg=on&burl=search_foreign&cat1=foreign&cat2=ipo&dir=ipo&file=foreign_ipo_260527.html",
      SITE_TITLE: "SBI IPO Monitor (Test)",
      SENDER_EMAIL: "shibata@neoanaloglab.com",
      SENDER_NAME: "SBI IPO Monitor",
      SITE_URL: "http://localhost:8787",
    },
  });
}, 30000);

afterAll(async () => {
  await worker.stop();
});

describe("Landing Page", () => {
  it("GET / returns the landing page HTML", async () => {
    const resp = await worker.fetch("/");
    expect(resp.status).toBe(200);
    const text = await resp.text();
    expect(text).toContain("<!DOCTYPE html>");
    expect(text).toContain("SBI IPO Monitor");
    expect(text).toContain("購入申込する");
  });

  it("GET / has Japanese content", async () => {
    const resp = await worker.fetch("/");
    const text = await resp.text();
    expect(text).toContain("監視ステータス");
    expect(text).toContain("メールアドレス");
    expect(text).toContain("登録");
  });
});

describe("API: /api/stats", () => {
  it("returns monitoring status", async () => {
    const resp = await worker.fetch("/api/stats");
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data).toHaveProperty("activeSubscribers");
    expect(data).toHaveProperty("monitoring");
    expect(data.monitoring).toBe(true);
    expect(data.checkInterval).toBe("5 minutes");
  });
});

describe("API: /api/status", () => {
  it("returns IPO check status", async () => {
    const resp = await worker.fetch("/api/status");
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data).toHaveProperty("latestCheck");
    expect(data).toHaveProperty("recentChecks");
    expect(data).toHaveProperty("activeSubscribers");
    expect(data).toHaveProperty("lastCheckedAt");
  });
});

describe("API: /api/subscribe", () => {
  const testEmail = `test-${Date.now()}@example.com`;

  it("POST /api/subscribe with valid email creates subscriber", async () => {
    const resp = await worker.fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail }),
    });
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data.success).toBe(true);
    expect(data).toHaveProperty("token");
  });

  it("POST /api/subscribe with duplicate email returns error", async () => {
    const resp = await worker.fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail }),
    });
    const data = await resp.json();
    expect(data.success).toBe(false);
  });

  it("POST /api/subscribe with invalid email returns error", async () => {
    const resp = await worker.fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    });
    expect(resp.status).toBe(400);
  });

  it("POST /api/subscribe without email returns error", async () => {
    const resp = await worker.fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(resp.status).toBe(400);
  });
});

describe("API: /api/unsubscribe", () => {
  it("GET /api/unsubscribe without params returns error", async () => {
    const resp = await worker.fetch("/api/unsubscribe");
    expect(resp.status).toBe(400);
  });

  it("GET /api/unsubscribe with invalid token redirects", async () => {
    const resp = await worker.fetch(
      "/api/unsubscribe?email=test@example.com&token=invalid-token",
      { redirect: "manual" }
    );
    // Should redirect to landing page (302)
    expect([301, 302]).toContain(resp.status);
  });
});

describe("API: /api/test-email", () => {
  it("POST /api/test-email sends test email", async () => {
    const resp = await worker.fetch("/api/test-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "lexluthor0304@gmail.com" }),
    });
    // Note: MailChannels may fail in local dev (not on Cloudflare network)
    // In deployed environment this should return 200
    const data = await resp.json();
    console.log("Test email result:", JSON.stringify(data, null, 2));
    // We accept both success (200) and failure (500) in local dev
    expect([200, 500]).toContain(resp.status);
    expect(data).toHaveProperty("success");
  });
});

describe("CORS Headers", () => {
  it("OPTIONS requests return CORS headers", async () => {
    const resp = await worker.fetch("/api/subscribe", {
      method: "OPTIONS",
    });
    expect(resp.status).toBe(200);
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(resp.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });
});
