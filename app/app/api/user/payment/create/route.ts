import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import Database from 'better-sqlite3'
import { createPayment, createPaymentWithTokenization } from '@/lib/monopay'
import { getUserIdFromInitData, validateInitData } from '@/lib/telegram'
import { SITE_PLAN_PRICE_BY_MONTHS } from '@/config/subscriptions'
import { nowKyivIso, addMonthsFromKyiv } from '@/lib/time'

export const runtime = 'nodejs'

function formatDateUaLong(dateIso: string): string {
  const d = new Date(dateIso)
  if (Number.isNaN(d.getTime())) return dateIso
  const months = [
    'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
    'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня',
  ]
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} року`
}

async function sendTelegramMessage(chatId: number, text: string) {
  const token = process.env.TOKEN || process.env.BOT_TOKEN || ''
  if (!token) return
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    })
  } catch {
    // non-critical
  }
}

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

export async function POST(request: NextRequest) {
  const telegramUserId = getAuthorizedUserId(request)
  if (!telegramUserId) {
    return NextResponse.json({ error: 'Unauthorized telegram init data' }, { status: 401 })
  }

  const body = (await request.json()) as {
    months?: number
    productName?: string
    applyReferralBalance?: boolean
  }
  const months = Number(body.months || 0)
  const basePrice = SITE_PLAN_PRICE_BY_MONTHS[months] ?? 0
  const productName = (body.productName || 'Flix VPN').toString()
  const applyReferralBalance = Boolean(body.applyReferralBalance)

  if (![1, 3, 6, 12].includes(months) || basePrice <= 0) {
    return NextResponse.json({ error: 'Invalid payment payload' }, { status: 400 })
  }

  const isSubscription = months === 1
  let db: ReturnType<typeof openDb> | null = null
  try {
    db = openDb()
    const user = db.prepare(
      `SELECT
         COALESCE(u.balance, 0) AS balance,
         s.end_date AS subscription_end_date
       FROM users u
       LEFT JOIN subscriptions s ON s.user_id = u.user_id
       WHERE u.user_id = ?`,
    ).get(telegramUserId) as { balance: number; subscription_end_date: string | null } | undefined
    const currentBalance = Number(user?.balance || 0)
    const discountApplied = applyReferralBalance ? Math.min(basePrice, Math.max(currentBalance, 0)) : 0
    const finalPrice = Number((basePrice - discountApplied).toFixed(2))

    if (finalPrice <= 0) {
      const nextEndDateIso = addMonthsFromKyiv(user?.subscription_end_date ?? null, months)
      const localPaymentId = `balance_${telegramUserId}_${Math.floor(Date.now() / 1000)}`
      const createdAtIso = nowKyivIso()

      db.exec('BEGIN')
      try {
        if (discountApplied > 0) {
          db.prepare(
            `UPDATE users
             SET balance = CASE
               WHEN COALESCE(balance, 0) >= ? THEN COALESCE(balance, 0) - ?
               ELSE 0
             END
             WHERE user_id = ?`,
          ).run(discountApplied, discountApplied, telegramUserId)
        }
        db.prepare(
          `INSERT INTO payments (
             user_id, local_payment_id, invoice_id, wallet_id, months, price, mode, status, created_at
           ) VALUES (?, ?, ?, NULL, ?, ?, ?, 'paid', ?)`,
        ).run(
          telegramUserId,
          localPaymentId,
          localPaymentId,
          months,
          0,
          'referral_balance',
          createdAtIso,
        )
        db.prepare(
          `INSERT INTO subscriptions (
             user_id, months, end_date, status, recurring_enabled, recurring_wallet_id,
             recurring_cancelled_at, created_at, updated_at
           ) VALUES (?, ?, ?, 'active', 0, NULL, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             months = excluded.months,
             end_date = excluded.end_date,
             status = 'active',
             recurring_enabled = 0,
             recurring_wallet_id = NULL,
             recurring_cancelled_at = excluded.recurring_cancelled_at,
             updated_at = excluded.updated_at`,
        ).run(
          telegramUserId,
          months,
          nextEndDateIso,
          nowKyivIso(),
          createdAtIso,
          createdAtIso,
        )
        db.exec('COMMIT')
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }

      await sendTelegramMessage(
        telegramUserId,
        `🎉 <b>Оплата успішна</b>\n\n` +
        `🔓 Ви можете користуватися Flix VPN до <b>${formatDateUaLong(nextEndDateIso)}</b>\n\n` +
        `🛡 <b>План:</b> ${months} міс.\n` +
        `💰 <b>Сума:</b> 0.00 грн (оплачено з балансу)`,
      )

      return NextResponse.json({
        ok: true,
        mode: 'one_time',
        paymentUrl: '',
        localPaymentId,
        invoiceId: localPaymentId,
        originalPrice: basePrice,
        discountApplied,
        finalPrice: 0,
        paidFromBalanceOnly: true,
      })
    }

    if (isSubscription) {
      const result = await createPaymentWithTokenization(
        telegramUserId,
        productName,
        months,
        finalPrice,
      )
      db.exec('BEGIN')
      try {
        if (discountApplied > 0) {
          db.prepare(
            `UPDATE users
             SET balance = CASE
               WHEN COALESCE(balance, 0) >= ? THEN COALESCE(balance, 0) - ?
               ELSE 0
             END
             WHERE user_id = ?`,
          ).run(discountApplied, discountApplied, telegramUserId)
        }
        db.prepare(
          `INSERT INTO payments (
             user_id, local_payment_id, invoice_id, wallet_id, months, price, mode, status, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'created', ?)`,
        ).run(
          telegramUserId,
          result.localPaymentId,
          result.invoiceId,
          result.walletId,
          months,
          finalPrice,
          'recurring',
          nowKyivIso(),
        )
        const nowIso = nowKyivIso()
        db.prepare(
          `INSERT INTO subscriptions (
             user_id, months, end_date, status, recurring_enabled, recurring_wallet_id,
             recurring_cancelled_at, created_at, updated_at
           ) VALUES (?, NULL, NULL, 'inactive', 1, ?, NULL, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             recurring_enabled = 1,
             recurring_wallet_id = excluded.recurring_wallet_id,
             recurring_cancelled_at = NULL,
             updated_at = excluded.updated_at`,
        ).run(telegramUserId, result.walletId, nowIso, nowIso)
        db.exec('COMMIT')
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }
      return NextResponse.json({
        ok: true,
        mode: 'recurring',
        paymentUrl: result.pageUrl,
        localPaymentId: result.localPaymentId,
        invoiceId: result.invoiceId,
        walletId: result.walletId,
        originalPrice: basePrice,
        discountApplied,
        finalPrice,
        paidFromBalanceOnly: false,
      })
    }

    const result = await createPayment(
      telegramUserId,
      productName,
      months,
      finalPrice,
    )
    db.exec('BEGIN')
    try {
      if (discountApplied > 0) {
        db.prepare(
          `UPDATE users
           SET balance = CASE
             WHEN COALESCE(balance, 0) >= ? THEN COALESCE(balance, 0) - ?
             ELSE 0
           END
           WHERE user_id = ?`,
        ).run(discountApplied, discountApplied, telegramUserId)
      }
      db.prepare(
        `INSERT INTO payments (
           user_id, local_payment_id, invoice_id, wallet_id, months, price, mode, status, created_at
         ) VALUES (?, ?, ?, NULL, ?, ?, ?, 'created', ?)`,
      ).run(
        telegramUserId,
        result.localPaymentId,
        result.invoiceId,
        months,
        finalPrice,
        'one_time',
        nowKyivIso(),
      )
      const nowIso = nowKyivIso()
      db.prepare(
        `INSERT INTO subscriptions (
           user_id, months, end_date, status, recurring_enabled, recurring_wallet_id,
           recurring_cancelled_at, created_at, updated_at
         ) VALUES (?, NULL, NULL, 'inactive', 0, NULL, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           recurring_enabled = 0,
           recurring_wallet_id = NULL,
           recurring_cancelled_at = excluded.recurring_cancelled_at,
           updated_at = excluded.updated_at`,
      ).run(telegramUserId, nowIso, nowIso, nowIso)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
    return NextResponse.json({
      ok: true,
      mode: 'one_time',
      paymentUrl: result.pageUrl,
      localPaymentId: result.localPaymentId,
      invoiceId: result.invoiceId,
      originalPrice: basePrice,
      discountApplied,
      finalPrice,
      paidFromBalanceOnly: false,
    })
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : 'Payment generation failed'
    const message = rawMessage.includes('FORBIDDEN')
      ? 'MonoPay відхилив запит (FORBIDDEN). Перевірте XTOKEN у .env та перезапустіть Next.js.'
      : rawMessage
    const status = rawMessage.includes('FORBIDDEN') ? 502 : 500
    return NextResponse.json({ error: message }, { status })
  } finally {
    db?.close()
  }
}
