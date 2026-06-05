-- Migration: 0001_init
-- Description: Initialize database schema for SBI IPO Monitor

-- Subscribers table: stores email addresses of users who want notifications
CREATE TABLE IF NOT EXISTS subscribers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT NOT NULL UNIQUE,
    token       TEXT NOT NULL UNIQUE,
    status      TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'unsubscribed', 'bounced')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_subscribers_status ON subscribers(status);
CREATE INDEX idx_subscribers_email ON subscribers(email);

-- Notifications table: tracks sent notifications to prevent duplicates
CREATE TABLE IF NOT EXISTS notifications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    check_id    INTEGER NOT NULL,
    email       TEXT NOT NULL,
    sent_at     TEXT NOT NULL DEFAULT (datetime('now')),
    status      TEXT NOT NULL DEFAULT 'sent' CHECK(status IN ('sent', 'failed', 'bounced')),
    FOREIGN KEY (check_id) REFERENCES check_logs(id)
);

CREATE INDEX idx_notifications_check ON notifications(check_id);

-- Check logs: records each check of the IPO page
CREATE TABLE IF NOT EXISTS check_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    checked_at      TEXT NOT NULL DEFAULT (datetime('now')),
    button_found    INTEGER NOT NULL DEFAULT 0,
    button_enabled  INTEGER NOT NULL DEFAULT 0,
    button_text     TEXT,
    page_title      TEXT,
    response_time_ms INTEGER,
    notified        INTEGER NOT NULL DEFAULT 0,
    error_message   TEXT
);

CREATE INDEX idx_check_logs_time ON check_logs(checked_at DESC);

-- Notification log: tracks the last time we sent a mass notification
CREATE TABLE IF NOT EXISTS notification_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sent_at         TEXT NOT NULL DEFAULT (datetime('now')),
    recipient_count INTEGER NOT NULL DEFAULT 0,
    success_count   INTEGER NOT NULL DEFAULT 0,
    fail_count      INTEGER NOT NULL DEFAULT 0
);
