/**
 * Email Notification System
 *
 * Uses Cloudflare's native Email Sending via the `send_email` Worker binding.
 * Requires: "send_email": [{ "name": "EMAIL" }] in wrangler.jsonc
 */

import { EmailMessage } from "cloudflare:email";

export interface EmailConfig {
  senderEmail: string;
  senderName: string;
  siteUrl: string;
  siteTitle: string;
  /** Cloudflare send_email binding */
  emailBinding: SendEmail;
}

export interface EmailResult {
  success: boolean;
  error?: string;
}

interface EmailPayload {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
}

// =============================================================================
// Public API
// =============================================================================

/** Send a welcome email to a new subscriber */
export async function sendWelcomeEmail(
  recipient: string,
  token: string,
  config: EmailConfig
): Promise<EmailResult> {
  const unsubscribeUrl = `${config.siteUrl}/api/unsubscribe?email=${encodeURIComponent(recipient)}&token=${encodeURIComponent(token)}`;
  const subject = `【${config.siteTitle}】ご登録ありがとうございます`;

  const textBody =
    `${recipient} 様\n\n` +
    `この度は「${config.siteTitle}」にご登録いただき、誠にありがとうございます。\n\n` +
    `本サービスは、SBI証券の外国株式IPOページにおいて、\n` +
    `「購入申込する」ボタンが押せるようになった際に、\n` +
    `ご登録のメールアドレスへ自動的にお知らせするサービスです。\n\n` +
    `■ 監視対象\nSBI証券 外国株式IPOページ\n\n` +
    `■ 監視頻度\n5分毎に自動チェック\n\n` +
    `■ 登録解除\n${unsubscribeUrl}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━\n${config.siteTitle}\n${config.siteUrl}`;

  const htmlBody =
    `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"></head>` +
    `<body style="font-family:'Hiragino Kaku Gothic Pro','Meiryo',sans-serif;color:#333;max-width:600px;margin:0 auto;">` +
    `<div style="background:linear-gradient(135deg,#1a1a4e,#0d0d2b);color:#e8e8f0;padding:30px;border-radius:8px 8px 0 0;text-align:center;">` +
    `<h1 style="margin:0;font-size:24px;">🚀 ${config.siteTitle}</h1>` +
    `<p style="margin:10px 0 0;opacity:.8;">ご登録ありがとうございます</p></div>` +
    `<div style="background:#fff;padding:30px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px;">` +
    `<p>${recipient} 様</p>` +
    `<p>この度は「<strong>${config.siteTitle}</strong>」にご登録いただき、誠にありがとうございます。</p>` +
    `<p><strong>「購入申込する」ボタンが押せるようになった際</strong>に、ご登録のメールアドレスへ自動的にお知らせします。</p>` +
    `<table style="width:100%;border-collapse:collapse;margin:20px 0;background:#f8f8ff;border-radius:8px;">` +
    `<tr><td style="padding:10px 15px;font-weight:bold;width:120px;">🔍 監視対象</td><td style="padding:10px 15px;">SBI証券 外国株式IPOページ</td></tr>` +
    `<tr><td style="padding:10px 15px;font-weight:bold;">⏱ 監視頻度</td><td style="padding:10px 15px;">5分毎に自動チェック</td></tr></table>` +
    `<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:15px;margin:20px 0;">` +
    `<p style="margin:0;font-size:14px;">📌 登録解除：<a href="${unsubscribeUrl}">${unsubscribeUrl}</a></p></div>` +
    `</div><div style="text-align:center;padding:20px;color:#999;font-size:12px;">` +
    `<p>※ 本メールは自動送信されています。</p><p>${config.siteTitle} | ${config.siteUrl}</p></div></body></html>`;

  return sendEmail({ to: recipient, subject, htmlBody, textBody }, config);
}

/** Send notification email when IPO button becomes available */
export async function sendIPOAvailableEmail(
  recipient: string,
  token: string,
  config: EmailConfig
): Promise<EmailResult> {
  const unsubscribeUrl = `${config.siteUrl}/api/unsubscribe?email=${encodeURIComponent(recipient)}&token=${encodeURIComponent(token)}`;
  const sbiUrl = "https://www.sbisec.co.jp/ETGate/?_ControlID=WPLETmgR001Control&_PageID=WPLETmgR001Mdtl30&_ActionID=DefaultAID&_DataStoreID=DSWPLETmgR001Control&OutSide=on&getFlg=on&burl=search_foreign&cat1=foreign&cat2=ipo&dir=ipo&file=foreign_ipo_260527.html";
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const timeStr = nowJST.toISOString().replace("T", " ").substring(0, 19);
  const subject = `【要確認】SBI証券 IPO「購入申込する」ボタンが利用可能です [${timeStr} JST]`;

  const textBody =
    `${recipient} 様\n\n` +
    `SBI証券の外国株式IPOページにおいて、\n` +
    `「購入申込する」ボタンが利用可能になったことを確認しました！\n\n` +
    `■ 確認日時\n${timeStr} (日本時間)\n\n` +
    `■ IPO申込ページ\n${sbiUrl}\n\n` +
    `■ ご注意\n・本通知は自動チェックによるものです。実際の申込可否はSBI証券のページでご確認ください。\n` +
    `・申込期間は限られています。お早めにご確認ください。\n\n` +
    `■ 登録解除\n${unsubscribeUrl}`;

  const htmlBody =
    `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"></head>` +
    `<body style="font-family:'Hiragino Kaku Gothic Pro','Meiryo',sans-serif;color:#333;max-width:600px;margin:0 auto;">` +
    `<div style="background:linear-gradient(135deg,#c94b1a,#e85d30);color:#fff;padding:30px;border-radius:8px 8px 0 0;text-align:center;">` +
    `<h1 style="margin:0;font-size:24px;">🔔 IPO申込可能のお知らせ</h1>` +
    `<p style="margin:10px 0 0;opacity:.9;">SBI証券「購入申込する」ボタンが利用可能になりました</p></div>` +
    `<div style="background:#fff;padding:30px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px;">` +
    `<p>${recipient} 様</p>` +
    `<p>SBI証券の外国株式IPOページにおいて、<strong style="color:#c94b1a;">「購入申込する」ボタンが利用可能</strong>になったことを確認しました！</p>` +
    `<div style="background:#fff5f0;border-left:4px solid #e85d30;padding:15px;margin:20px 0;border-radius:4px;">` +
    `<p style="margin:0;"><strong>📅 確認日時：</strong>${timeStr} (日本時間)</p></div>` +
    `<div style="text-align:center;margin:30px 0;">` +
    `<a href="${sbiUrl}" style="display:inline-block;background:linear-gradient(135deg,#1a73e8,#1557b0);color:#fff;text-decoration:none;padding:15px 40px;border-radius:8px;font-size:18px;font-weight:bold;">` +
    `SBI証券IPOページを開く →</a></div>` +
    `<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:15px;margin:20px 0;">` +
    `<p style="margin:0 0 8px;font-weight:bold;">⚠️ ご注意</p>` +
    `<ul style="margin:0;padding-left:20px;font-size:14px;">` +
    `<li>本通知は自動チェックによるものです。</li><li>申込期間は限られています。</li></ul></div>` +
    `<p style="font-size:13px;color:#999;margin-top:30px;">登録解除：<a href="${unsubscribeUrl}" style="color:#999;">${unsubscribeUrl}</a></p>` +
    `</div><div style="text-align:center;padding:20px;color:#999;font-size:12px;"><p>${config.siteTitle}</p></div></body></html>`;

  return sendEmail({ to: recipient, subject, htmlBody, textBody }, config);
}

/** Send a test email */
export async function sendTestEmail(
  recipient: string,
  config: EmailConfig
): Promise<EmailResult> {
  const subject = `【${config.siteTitle}】テストメール`;
  const textBody =
    `${recipient} 様\n\n` +
    `これは${config.siteTitle}からのテストメールです。\n` +
    `メール送信システムが正常に動作しています。\n\n` +
    `送信日時: ${new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace("T", " ").substring(0, 19)} JST\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━\n${config.siteTitle}`;

  const htmlBody =
    `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"></head>` +
    `<body style="font-family:'Hiragino Kaku Gothic Pro','Meiryo',sans-serif;color:#333;max-width:600px;margin:0 auto;">` +
    `<div style="background:linear-gradient(135deg,#6c5ce7,#3d5af1);color:#fff;padding:30px;border-radius:8px;text-align:center;">` +
    `<h1 style="margin:0;font-size:24px;">📧 テストメール</h1></div>` +
    `<div style="background:#fff;padding:30px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px;">` +
    `<p>${recipient} 様</p>` +
    `<p>これは<strong>${config.siteTitle}</strong>からのテストメールです。</p>` +
    `<p style="color:#6c5ce7;">✅ メール送信システムは正常に動作しています。</p>` +
    `</div></body></html>`;

  return sendEmail({ to: recipient, subject, htmlBody, textBody }, config);
}

// =============================================================================
// Internal: Cloudflare Email Sending via send_email binding
// =============================================================================

async function sendEmail(
  payload: EmailPayload,
  config: EmailConfig
): Promise<EmailResult> {
  try {
    // Build a simple MIME message
    const boundary = `boundary_${crypto.randomUUID()}`;
    const utf8Encode = (s: string) => {
      // Convert to base64 for MIME encoding
      const bytes = new TextEncoder().encode(s);
      return btoa(String.fromCharCode(...bytes));
    };

    const rawMime = [
      `From: =?UTF-8?B?${utf8Encode(config.senderName)}?= <${config.senderEmail}>`,
      `To: ${payload.to}`,
      `Subject: =?UTF-8?B?${utf8Encode(payload.subject)}?=`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      utf8Encode(payload.textBody),
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      utf8Encode(payload.htmlBody),
      `--${boundary}--`,
    ].join("\r\n");

    const message = new EmailMessage(
      config.senderEmail,
      payload.to,
      rawMime
    );

    await config.emailBinding.send(message);
    return { success: true };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg };
  }
}
