import type Database from 'better-sqlite3'

/** Колонка для відновлення логів у Telegram після повторних webhook. */
export function ensurePaymentsNotifyColumn(db: Database.Database) {
  const rows = db.prepare('PRAGMA table_info(payments)').all() as { name: string }[]
  if (!rows.some((r) => r.name === 'admin_chat_notified')) {
    db.exec('ALTER TABLE payments ADD COLUMN admin_chat_notified INTEGER DEFAULT 0')
  }
}
