import type { D1Database } from "@cloudflare/workers-types";

/** Subscriber record */
export interface Subscriber {
  id: number;
  email: string;
  token: string;
  status: "active" | "unsubscribed" | "bounced";
  created_at: string;
  updated_at: string;
}

/** Check log record */
export interface CheckLog {
  id: number;
  checked_at: string;
  button_found: boolean;
  button_enabled: boolean;
  button_text: string | null;
  page_title: string | null;
  response_time_ms: number | null;
  notified: boolean;
  error_message: string | null;
}

/** Database operations for the SBI IPO Monitor */
export class Database {
  constructor(private db: D1Database) {}

  /** Add a new subscriber with a generated unsubscribe token */
  async addSubscriber(email: string): Promise<{ success: boolean; message: string; token?: string }> {
    const normalizedEmail = email.trim().toLowerCase();

    // Check if already exists
    const existing = await this.db
      .prepare("SELECT id, status FROM subscribers WHERE email = ?")
      .bind(normalizedEmail)
      .first<{ id: number; status: string }>();

    if (existing) {
      if (existing.status === "active") {
        return { success: false, message: "このメールアドレスは既に登録されています。" };
      }
      // Reactivate unsubscribed user
      const token = crypto.randomUUID();
      await this.db
        .prepare("UPDATE subscribers SET status = 'active', token = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(token, existing.id)
        .run();
      return { success: true, message: "登録を再開しました。", token };
    }

    const token = crypto.randomUUID();
    try {
      await this.db
        .prepare("INSERT INTO subscribers (email, token, status) VALUES (?, ?, 'active')")
        .bind(normalizedEmail, token)
        .run();
      return { success: true, message: "登録が完了しました。確認メールをお送りします。", token };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, message: `登録に失敗しました: ${msg}` };
    }
  }

  /** Unsubscribe by email and token */
  async unsubscribe(email: string, token: string): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = email.trim().toLowerCase();

    const result = await this.db
      .prepare("UPDATE subscribers SET status = 'unsubscribed', updated_at = datetime('now') WHERE email = ? AND token = ?")
      .bind(normalizedEmail, token)
      .run();

    if (result.meta.changes === 0) {
      return { success: false, message: "登録解除に失敗しました。URLが無効な可能性があります。" };
    }

    return { success: true, message: "登録を解除しました。ご利用ありがとうございました。" };
  }

  /** Get all active subscribers */
  async getActiveSubscribers(): Promise<Subscriber[]> {
    const result = await this.db
      .prepare("SELECT * FROM subscribers WHERE status = 'active' ORDER BY created_at ASC")
      .all<Subscriber>();
    return result.results;
  }

  /** Get the count of active subscribers */
  async getActiveSubscriberCount(): Promise<number> {
    const result = await this.db
      .prepare("SELECT COUNT(*) as count FROM subscribers WHERE status = 'active'")
      .first<{ count: number }>();
    return result?.count ?? 0;
  }

  /** Add a check log entry */
  async addCheckLog(log: Omit<CheckLog, "id">): Promise<number> {
    const result = await this.db
      .prepare(
        `INSERT INTO check_logs (checked_at, button_found, button_enabled, button_text, page_title, response_time_ms, notified, error_message)
         VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        log.button_found ? 1 : 0,
        log.button_enabled ? 1 : 0,
        log.button_text ?? null,
        log.page_title ?? null,
        log.response_time_ms ?? null,
        log.notified ? 1 : 0,
        log.error_message ?? null
      )
      .run();
    return result.meta.last_row_id ?? 0;
  }

  /** Get the most recent check log */
  async getLatestCheckLog(): Promise<CheckLog | null> {
    const result = await this.db
      .prepare("SELECT * FROM check_logs ORDER BY id DESC LIMIT 1")
      .first<Record<string, unknown>>();
    if (!result) return null;
    return this.mapCheckLog(result);
  }

  /** Get check logs with pagination */
  async getCheckLogs(limit: number = 20): Promise<CheckLog[]> {
    const result = await this.db
      .prepare("SELECT * FROM check_logs ORDER BY id DESC LIMIT ?")
      .bind(limit)
      .all<Record<string, unknown>>();
    return result.results.map((r) => this.mapCheckLog(r));
  }

  /** Check if we already sent a notification for the latest button-found state */
  async hasNotifiedForLatest(): Promise<boolean> {
    const latest = await this.getLatestCheckLog();
    if (!latest || !latest.button_found) return false;
    return latest.notified;
  }

  /** Record a notification was sent */
  async markNotified(checkId: number): Promise<void> {
    await this.db
      .prepare("UPDATE check_logs SET notified = 1 WHERE id = ?")
      .bind(checkId)
      .run();
  }

  /** Record individual notification delivery */
  async recordNotification(checkId: number, email: string, status: "sent" | "failed"): Promise<void> {
    await this.db
      .prepare("INSERT INTO notifications (check_id, email, status) VALUES (?, ?, ?)")
      .bind(checkId, email, status)
      .run();
  }

  /** Log a mass notification event */
  async addNotificationLog(recipientCount: number, successCount: number, failCount: number): Promise<void> {
    await this.db
      .prepare("INSERT INTO notification_logs (recipient_count, success_count, fail_count) VALUES (?, ?, ?)")
      .bind(recipientCount, successCount, failCount)
      .run();
  }

  /** Get recent notification logs */
  async getNotificationLogs(limit: number = 5): Promise<Array<{ sent_at: string; recipient_count: number; success_count: number; fail_count: number }>> {
    const result = await this.db
      .prepare("SELECT sent_at, recipient_count, success_count, fail_count FROM notification_logs ORDER BY id DESC LIMIT ?")
      .bind(limit)
      .all<{ sent_at: string; recipient_count: number; success_count: number; fail_count: number }>();
    return result.results;
  }

  /** Parse raw DB row to CheckLog */
  private mapCheckLog(row: Record<string, unknown>): CheckLog {
    return {
      id: Number(row.id),
      checked_at: String(row.checked_at),
      button_found: Boolean(row.button_found),
      button_enabled: Boolean(row.button_enabled),
      button_text: row.button_text ? String(row.button_text) : null,
      page_title: row.page_title ? String(row.page_title) : null,
      response_time_ms: row.response_time_ms ? Number(row.response_time_ms) : null,
      notified: Boolean(row.notified),
      error_message: row.error_message ? String(row.error_message) : null,
    };
  }
}
