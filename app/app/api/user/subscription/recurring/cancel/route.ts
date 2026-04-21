import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import Database from 'better-sqlite3'
import { getUserIdFromInitData, validateInitData } from '@/lib/telegram'
import { nowKyivIso } from '@/lib/time'

export const runtime = 'nodejs'

function getDbPath() {
  return resolve(process.cwd(), '../database/data.db')
}

function openDb() {
  const dbPath = getDbPath()
  if (!existsSync(dbPath)) {
    throw new Error('Database file not found')
  }
  return new Database(dbPath)
}

function getUserIdFromQuery(request: NextRequest): number | null {
  const rawUserId = request.nextUrl.searchParams.get('user_id')
  if (!rawUserId) {
    return null
  }
  const parsed = Number(rawUserId)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function getAuthorizedUserId(request: NextRequest): number | null {
  const initData = request.headers.get('x-telegram-init-data') || ''
  const botToken = process.env.TOKEN || process.env.BOT_TOKEN || ''
  if (initData && botToken && validateInitData(initData, botToken)) {
    return getUserIdFromInitData(initData)
  }
  return getUserIdFromQuery(request)
}

function parseAdminIds(): number[] {
  const raw = (process.env.ADMINISTRATORS || '').trim()
  if (!raw) return []
  const normalized = raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1) : raw
  return normalized
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((id) => Number.isFinite(id) && id > 0)
}

interface TelegramInlineButton {
  text: string
  url?: string
}

interface TelegramReplyMarkup {
  inline_keyboard: Array<Array<TelegramInlineButton>>
}

async function sendTelegramMessage(
  chatId: number,
  text: string,
  replyMarkup?: TelegramReplyMarkup,
) {
  const token = (process.env.TOKEN || process.env.BOT_TOKEN || '').trim()
  if (!token) return
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: replyMarkup,
    }),
  })
}

export async function POST(request: NextRequest) {
  const userId = getAuthorizedUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized telegram init data' }, { status: 401 })
  }

  const db = openDb()
  try {
    const user = db.prepare(
      `SELECT COALESCE(recurring_enabled, 0) AS recurring_enabled
       FROM subscriptions
       WHERE user_id = ?`,
    ).get(userId) as { recurring_enabled?: number } | undefined

    if (!user || !user.recurring_enabled) {
      return NextResponse.json({ error: 'Повторювана підписка не активна' }, { status: 400 })
    }

    const nowIso = nowKyivIso()
    db.prepare(
      `UPDATE subscriptions
       SET recurring_enabled = 0,
           recurring_cancelled_at = ?,
           updated_at = ?
       WHERE user_id = ?`,
    ).run(nowIso, nowIso, userId)
    db.prepare(
      `UPDATE recurring_subscriptions
       SET status = 'cancelled',
           cancelled_at = ?,
           updated_at = ?,
           last_error = 'Cancelled by user'
       WHERE user_id = ? AND status = 'active'`,
    ).run(nowIso, nowIso, userId)

    const adminText =
      `🔕 Користувач скасував підписку\n` +
      `User ID: <code>${userId}</code>\n` +
      `Час: <code>${nowIso}</code>`
    const adminUserMarkup: TelegramReplyMarkup = {
      inline_keyboard: [
        [{ text: '👤 Переглянути профіль', url: `tg://user?id=${userId}` }],
      ],
    }
    const adminIds = parseAdminIds()
    for (const adminId of adminIds) {
      await sendTelegramMessage(adminId, adminText, adminUserMarkup)
    }

    return NextResponse.json({ ok: true, recurringEnabled: false })
  } finally {
    db.close()
  }
}
