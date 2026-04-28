import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import Database from 'better-sqlite3'
import {
  getTelegramUserFromInitData,
  getUserIdFromInitData,
  validateInitData,
} from '@/lib/telegram'
import { bytesToMb, getMarzbanUserInfo } from '@/lib/marzban'
import { nowKyivIso } from '@/lib/time'
import { SITE_PLAN_PRICE_BY_MONTHS } from '@/config/subscriptions'

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

function getAuthorizedContext(request: NextRequest) {
  const initData = request.headers.get('x-telegram-init-data') || ''
  const botToken = process.env.TOKEN || process.env.BOT_TOKEN || ''
  if (initData && botToken && validateInitData(initData, botToken)) {
    const userId = getUserIdFromInitData(initData)
    const tgUser = getTelegramUserFromInitData(initData)
    if (userId) {
      return { userId, tgUser }
    }
  }

  const userIdFromQuery = getUserIdFromQuery(request)
  if (userIdFromQuery) {
    return { userId: userIdFromQuery, tgUser: null }
  }

  return null
}

export async function GET(request: NextRequest) {
  const auth = getAuthorizedContext(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized telegram init data' }, { status: 401 })
  }

  const db = openDb()
  try {
    const getSettingNumber = (key: string, fallback: number): number => {
      try {
        const row = db.prepare('SELECT value FROM app_settings WHERE key = ? LIMIT 1').get(key) as { value?: string | number } | undefined
        const parsed = Number(row?.value ?? fallback)
        return Number.isFinite(parsed) ? parsed : fallback
      } catch {
        return fallback
      }
    }
    const nowIso = nowKyivIso()
    const exists = db
      .prepare('SELECT user_id FROM users WHERE user_id = ?')
      .get(auth.userId) as { user_id?: number } | undefined
    if (!exists) {
      db.prepare(
        `INSERT INTO users (
          user_id, user_name, user_first_name, user_last_name, language, notifications_enabled
        )
        VALUES (?, ?, ?, ?, ?, 1)`,
      ).run(
        auth.userId,
        auth.tgUser?.username || null,
        auth.tgUser?.first_name || null,
        auth.tgUser?.last_name || null,
        auth.tgUser?.language_code || null,
      )
    } else {
      db.prepare(
        `UPDATE users
         SET user_name = COALESCE(?, user_name),
             user_first_name = COALESCE(?, user_first_name),
             user_last_name = COALESCE(?, user_last_name),
             language = COALESCE(?, language)
         WHERE user_id = ?`,
      ).run(
        auth.tgUser?.username || null,
        auth.tgUser?.first_name || null,
        auth.tgUser?.last_name || null,
        auth.tgUser?.language_code || null,
        auth.userId,
      )
    }

    const user = db.prepare(
      `SELECT
        u.user_id AS user_id,
        u.user_name AS user_name,
        u.user_first_name AS user_first_name,
        u.user_last_name AS user_last_name,
        COALESCE(u.balance, 0) AS balance,
        COALESCE(u.notifications_enabled, 1) AS notifications_enabled,
        s.months AS subscription_months,
        s.end_date AS subscription_end_date,
        COALESCE(s.status, 'inactive') AS subscription_status,
        COALESCE(s.recurring_enabled, 0) AS recurring_enabled,
        s.recurring_wallet_id
      FROM users u
      LEFT JOIN subscriptions s ON s.user_id = u.user_id
      WHERE u.user_id = ?`,
    ).get(auth.userId) as {
      user_id: number
      user_name: string | null
      user_first_name: string | null
      user_last_name: string | null
      balance: number
      notifications_enabled: number
      subscription_months: number | null
      subscription_end_date: string | null
      subscription_status: string
      recurring_enabled: number
      recurring_wallet_id: string | null
    } | undefined

    const referralCountRow = db
      .prepare('SELECT COUNT(*) as cnt FROM users WHERE referred_by = ?')
      .get(auth.userId) as { cnt: number }
    const activeDevicesRows = db.prepare(
      `SELECT id, device_name, marzban_username, subscription_url
       FROM user_devices
       WHERE user_id = ? AND status = 'active'
       ORDER BY id ASC`,
    ).all(auth.userId) as Array<{
      id: number
      device_name: string | null
      marzban_username: string | null
      subscription_url: string | null
    }>

    const subscriptionActive =
      user?.subscription_status === 'active' &&
      (!!user?.subscription_end_date ? user.subscription_end_date > nowIso : false)
    const subscriptionsCount = subscriptionActive ? 1 : 0

    // Build active devices with traffic stats (parallel Marzban requests)
    const rawDevices = subscriptionActive
      ? activeDevicesRows.filter((row) => (row.device_name || '').trim().length > 0)
      : []

    const activeDevices = await Promise.all(
      rawDevices.map(async (row) => {
        const marzbanUsername = row.marzban_username || null
        let usedTrafficMb = 0
        if (marzbanUsername) {
          try {
            const info = await getMarzbanUserInfo(marzbanUsername)
            usedTrafficMb = bytesToMb(info?.used_traffic)
          } catch {
            // ignore Marzban unavailability
          }
        }
        return {
          id: row.id,
          name: (row.device_name || '').trim(),
          subscriptionUrl: row.subscription_url || null,
          usedTrafficMb,
        }
      }),
    )

    const devicesCount = activeDevices.length
    const recurringEnabled = subscriptionActive && Boolean(user?.recurring_enabled ?? 0)
    const nextPaymentDate = recurringEnabled ? (user?.subscription_end_date || null) : null
    const discountPercentRaw = getSettingNumber('subscription_discount_percent', 0)
    const discountPercent = Math.max(0, Math.min(90, discountPercentRaw))
    const priceByMonths: Record<number, number> = {
      1: getSettingNumber('subscription_price_1', SITE_PLAN_PRICE_BY_MONTHS[1] ?? 99),
      3: getSettingNumber('subscription_price_3', SITE_PLAN_PRICE_BY_MONTHS[3] ?? 200),
      6: getSettingNumber('subscription_price_6', SITE_PLAN_PRICE_BY_MONTHS[6] ?? 350),
      12: getSettingNumber('subscription_price_12', SITE_PLAN_PRICE_BY_MONTHS[12] ?? 600),
    }

    return NextResponse.json({
      userId: auth.userId,
      username: user?.user_name || auth.tgUser?.username || null,
      firstName: user?.user_first_name || auth.tgUser?.first_name || null,
      lastName: user?.user_last_name || auth.tgUser?.last_name || null,
      referralCount: Number(referralCountRow?.cnt || 0),
      referralBalance: Number(user?.balance || 0),
      notificationsEnabled: Boolean(user?.notifications_enabled ?? 1),
      subscriptionsCount,
      devicesCount,
      activeDevices,
      subscription: {
        active: subscriptionActive,
        status: user?.subscription_status || 'inactive',
        months: user?.subscription_months || null,
        endDate: user?.subscription_end_date || null,
        recurring: {
          enabled: recurringEnabled,
          nextPaymentDate,
          canCancel: recurringEnabled,
          walletId: user?.recurring_wallet_id || null,
        },
      },
      pricing: {
        discountPercent,
        priceByMonths,
      },
    })
  } finally {
    db.close()
  }
}
