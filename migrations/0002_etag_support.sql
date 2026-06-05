-- Migration: 0002_etag_support
-- Description: Add ETag tracking and page change detection for conditional requests

-- State table for key-value storage (ETag tracking, etc.)
CREATE TABLE IF NOT EXISTS state (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Add columns to track HTTP status and whether page actually changed
ALTER TABLE check_logs ADD COLUMN http_status INTEGER NOT NULL DEFAULT 0;
ALTER TABLE check_logs ADD COLUMN page_changed INTEGER NOT NULL DEFAULT 1;
ALTER TABLE check_logs ADD COLUMN etag TEXT;
