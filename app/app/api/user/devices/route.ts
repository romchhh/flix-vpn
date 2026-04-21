import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import Database from 'better-sqlite3'
import { createDeviceMarzbanUser } from '@/lib/marzban'
import { getUserIdFromInitData, validateInitData } from '@/lib/telegram'
import { nowKyivIso } from '@/lib/time'

export const runtime = 'nodejs'
const MAX_ACTIVE_DEVICES = 5

function getDbPath() {
  return resolve(process.cwd(), '../database/data.db')
}

function openDb() {
  const dbPath = getDbPath()
  if (!existsSync(dbPath)) throw new Error('Database file not found')
  return new Database(dbPath)
}

function getUserIdFromQuery(request: NextRequest): number | null {
  const rawUserId = request.nextUrl.searchParams.get('user_id')
  if (!rawUserId) return null
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

function isSubscriptionActive(status: string | null, endDate: string | null): boolean {
  return status === 'active' && !!endDate && endDate > nowKyivIso()
}

function buildMarzbanNote(params: {
  userId: number
  username: string | null
  firstName: string | null
  deviceDbId: number
  deviceName: string
  months: number | null
  status: string | null
  endDate: string | null
}): string {
  const {
    userId,
    username,
    firstName,
    deviceDbId,
    deviceName,
    months,
    status,
    endDate,
  } = params

  return [
    'Flix VPN device account',
    `user_id: ${userId}`,
    `username: ${username ? `@${username}` : '—'}`,
    `name: ${firstName || '—'}`,
    `device_id: ${deviceDbId}`,
    `device_name: ${deviceName}`,
    `subscription_status: ${status || 'inactive'}`,
    `subscription_plan_months: ${months ?? '—'}`,
    `subscription_end_date: ${endDate || '—'}`,
    `generated_at_kyiv: ${nowKyivIso()}`,
  ].join('\n')
}

export async function POST(request: NextRequest) {
  const userId = getAuthorizedUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json()) as { deviceName?: string }
  const deviceName = (body.deviceName || '').toString().trim()
  if (!deviceName) {
    return NextResponse.json({ error: 'deviceName is required' }, { status: 400 })
  }

  const db = openDb()
  try {
    const user = db.prepare(
      `SELECT
         COALESCE(s.status, 'inactive') AS subscription_status,
         s.end_date AS subscription_end_date,
         s.months AS subscription_months,
         u.user_name AS user_name,
         u.user_first_name AS user_first_name
       FROM subscriptions s
       LEFT JOIN users u ON u.user_id = s.user_id
       WHERE s.user_id = ?`,
    ).get(userId) as {
      subscription_status: string | null
      subscription_end_date: string | null
      subscription_months: number | null
      user_name: string | null
      user_first_name: string | null
    } | undefined

    if (!user || !isSubscriptionActive(user.subscription_status, user.subscription_end_date)) {
      return NextResponse.json({ error: 'Підписка неактивна' }, { status: 403 })
    }

    const activeCountRow = db.prepare(
      `SELECT COUNT(*) as cnt FROM user_devices WHERE user_id = ? AND status = 'active'`,
    ).get(userId) as { cnt: number }
    if (Number(activeCountRow?.cnt || 0) >= MAX_ACTIVE_DEVICES) {
      return NextResponse.json(
        { error: `Максимум ${MAX_ACTIVE_DEVICES} активних пристроїв` },
        { status: 409 },
      )
    }

    // Insert device record first to get the DB id
    const insertResult = db.prepare(
      `INSERT INTO user_devices (user_id, device_name, status, created_at)
       VALUES (?, ?, 'active', ?)`,
    ).run(userId, deviceName, nowKyivIso())
    const deviceDbId = Number(insertResult.lastInsertRowid)

    // Create per-device Marzban user
    const expireTs = user.subscription_end_date
      ? Math.floor(new Date(user.subscription_end_date).getTime() / 1000)
      : Math.floor(Date.now() / 1000) + 30 * 86400

    let marzbanUsername: string | null = null
    let subscriptionUrl: string | null = null

    try {
      const note = buildMarzbanNote({
        userId,
        username: user.user_name,
        firstName: user.user_first_name,
        deviceDbId,
        deviceName,
        months: user.subscription_months,
        status: user.subscription_status,
        endDate: user.subscription_end_date,
      })
      const marzban = await createDeviceMarzbanUser(userId, deviceDbId, expireTs, note)
      if (marzban) {
        marzbanUsername = marzban.username
        subscriptionUrl = marzban.subLink
        db.prepare(
          `UPDATE user_devices
           SET marzban_username = ?, subscription_url = ?
           WHERE id = ?`,
        ).run(marzbanUsername, subscriptionUrl, deviceDbId)
      }
    } catch (err) {
      console.error('Marzban createDeviceUser failed:', err)
      // Device record stays; subscriptionUrl is null — user can retry
    }

    const activeDevicesRows = db.prepare(
      `SELECT id, device_name, marzban_username, subscription_url
       FROM user_devices
       WHERE user_id = ? AND status = 'active'
       ORDER BY id ASC`,
    ).all(userId) as Array<{
      id: number
      device_name: string | null
      marzban_username: string | null
      subscription_url: string | null
    }>

    const activeDevices = activeDevicesRows.map((row) => ({
      id: row.id,
      name: (row.device_name || '').trim(),
      marzbanUsername: row.marzban_username || null,
      subscriptionUrl: row.subscription_url || null,
    }))

    return NextResponse.json({ ok: true, activeDevices, devicesCount: activeDevices.length })
  } finally {
    db.close()
  }
}
