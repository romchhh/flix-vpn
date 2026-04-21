import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import Database from 'better-sqlite3'
import { getUserIdFromInitData, validateInitData } from '@/lib/telegram'

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

function getAuthorizedUserId(request: NextRequest): number | null {
  const initData = request.headers.get('x-telegram-init-data') || ''
  const botToken = process.env.TOKEN || process.env.BOT_TOKEN || ''
  if (!initData || !botToken) {
    return null
  }
  if (!validateInitData(initData, botToken)) {
    return null
  }
  return getUserIdFromInitData(initData)
}

export async function GET(request: NextRequest) {
  const userId = getAuthorizedUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized telegram init data' }, { status: 401 })
  }
  const db = openDb()
  try {
    const row = db
      .prepare('SELECT COALESCE(notifications_enabled, 1) AS notifications_enabled FROM users WHERE user_id = ?')
      .get(userId) as { notifications_enabled?: number } | undefined
    const enabled = row ? Boolean(row.notifications_enabled) : true
    return NextResponse.json({ enabled })
  } finally {
    db.close()
  }
}

export async function POST(request: NextRequest) {
  const userId = getAuthorizedUserId(request)
  const body = (await request.json()) as { enabled?: boolean }
  if (!userId || typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const db = openDb()
  try {
    const updateResult = db.prepare('UPDATE users SET notifications_enabled = ? WHERE user_id = ?').run(
      body.enabled ? 1 : 0,
      userId,
    )
    if (!updateResult.changes) {
      db.prepare(
        'INSERT INTO users (user_id, notifications_enabled) VALUES (?, ?)',
      ).run(userId, body.enabled ? 1 : 0)
    }
    return NextResponse.json({ ok: true, enabled: body.enabled })
  } finally {
    db.close()
  }
}
