import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import Database from 'better-sqlite3'
import { nowKyivIso, addMonthsFromKyiv } from '@/lib/time'
import { ensurePaymentsNotifyColumn } from '@/lib/payments-db-migrate'
import {
  buildAdminUserMarkup,
  parseTelegramGroupId,
  sendTelegramHtml,
  type TelegramReplyMarkup,
} from '@/lib/telegram-notify'

export const runtime = 'nodejs'

// ── Interfaces ────────────────────────────────────────────────────────────────

interface MonoWalletData {
  walletId?: string
  cardToken?: string
  maskedPan?: string
  cardType?: string
  paymentSystem?: string
  country?: string
}

interface MonoWebhookPayload {
  invoiceId?: string
  status?: string
  walletData?: MonoWalletData
}

interface CardTokenResult {
  cardToken: string
  walletId: string
  maskedPan: string | null
  cardType: string | null
}

// ── Logger ────────────────────────────────────────────────────────────────────

function log(level: 'info' | 'warn' | 'error', msg: string, ctx?: Record<string, unknown>) {
  const ts = nowKyivIso()
  const prefix = `[webhook][${ts}][${level.toUpperCase()}]`
  if (ctx && Object.keys(ctx).length > 0) {
    console[level === 'error' ? 'error' : 'log'](`${prefix} ${msg}`, JSON.stringify(ctx))
  } else {
    console[level === 'error' ? 'error' : 'log'](`${prefix} ${msg}`)
  }
}

// ── DB ────────────────────────────────────────────────────────────────────────

function getDbPath() {
  return resolve(process.cwd(), '../database/data.db')
}

function openDb() {
  const dbPath = getDbPath()
  if (!existsSync(dbPath)) {
    throw new Error(`Database file not found at ${dbPath}`)
  }
  const db = new Database(dbPath)
  ensurePaymentsNotifyColumn(db)
  return db
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildMiniAppUrl(userId: number): string {
  const baseUrl = (process.env.MINI_APP_URL || process.env.NEXT_PUBLIC_MINI_APP_URL || '').trim()
  if (!baseUrl) return ''
  const url = new URL(baseUrl)
  url.searchParams.set('user_id', String(userId))
  return url.toString()
}

function nextEndDateForPayment(
  currentEndDateIso: string | null,
  months: number,
  canExtendActivePeriod: boolean,
): string {
  return canExtendActivePeriod
    ? addMonthsFromKyiv(currentEndDateIso, months)
    : addMonthsFromKyiv(null, months)
}

function formatDateUaLong(dateIso: string): string {
  const date = new Date(dateIso)
  if (Number.isNaN(date.getTime())) return dateIso
  const months = [
    'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
    'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня',
  ]
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()} року`
}

function isPaidStatus(statusRaw: string): boolean {
  const s = statusRaw.toLowerCase()
  return s === 'success' || s === 'paid'
}

function getReferralPercent(): number {
  const raw = Number(process.env.REFERRAL_PERCENT || 10)
  return Number.isFinite(raw) && raw >= 0 ? raw : 10
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isPaidInDatabase(statusRaw: string | null | undefined): boolean {
  const s = (statusRaw || '').toLowerCase()
  return s === 'paid' || s === 'success'
}

function buildPaymentAdminLogText(params: {
  userId: number
  months: number
  price: number
  invoiceId: string
  mode: string
  tokenLine: string | null
}): string {
  const { userId, months, price, invoiceId, mode, tokenLine } = params
  return (
    `💳 Нова успішна оплата\n` +
    `User ID: <code>${userId}</code>\n` +
    `План: ${months} міс.\n` +
    `Сума: ${Number(price).toFixed(2)} грн\n` +
    `Invoice: <code>${invoiceId}</code>` +
    (mode === 'recurring' && tokenLine != null ? `\n${tokenLine}` : '')
  )
}

type RecurringTokenLogMode = 'none' | 'pending' | 'hint' | 'from_db'

async function sendAdminPaymentLog(
  db: Database.Database,
  payment: {
    id: number
    user_id: number
    months: number
    price: number
    mode: string
  },
  invoiceId: string,
  recurringToken: { mode: RecurringTokenLogMode; hint?: string | null },
): Promise<boolean> {
  const telegramGroupId = parseTelegramGroupId()
  if (!telegramGroupId) {
    log('warn', 'TELEGRAM_GROUP_ID is not configured, payment log notification skipped', { invoiceId })
    return true
  }
  let tokenLine: string | null = null
  if (payment.mode === 'recurring') {
    const { mode: tm, hint } = recurringToken
    if (tm === 'pending') {
      tokenLine = 'Токен: <i>отримуємо (Mono може віддати з затримкою до ~2 хв)…</i>'
    } else if (tm === 'hint' && (hint || '').trim()) {
      tokenLine = `Токен: <code>${(hint || '').trim()}</code>`
    } else if (tm === 'from_db') {
      const row = db
        .prepare(`SELECT card_token FROM recurring_subscriptions WHERE user_id = ? LIMIT 1`)
        .get(payment.user_id) as { card_token?: string | null } | undefined
      const tok = (row?.card_token || '').trim()
      tokenLine = tok ? `Токен: <code>${tok}</code>` : 'Токен: <i>не знайдено в БД</i>'
    }
  }
  const text = buildPaymentAdminLogText({
    userId: payment.user_id,
    months: payment.months,
    price: payment.price,
    invoiceId,
    mode: payment.mode,
    tokenLine,
  })
  const ok = await sendTelegramHtml(telegramGroupId, text, buildAdminUserMarkup(payment.user_id))
  if (!ok) {
    log('warn', 'Admin payment log Telegram delivery failed', { invoiceId, telegramGroupId })
  }
  return ok
}

// ── Card token fetching with retries ──────────────────────────────────────────
//
// Як з’являється токен:
// 1) Monobank може покласти `walletData.cardToken` прямо в тіло webhook після оплати.
// 2) Якщо там порожньо — запитуємо GET /api/merchant/invoice/status?invoiceId=…
//    з заголовком X-Token (значення XTOKEN у .env). У відповіді в `walletData` з’являється
//    cardToken / walletId — інколи лише через кілька секунд або десятки секунд після success.
//
const TOKEN_RETRIES = 8
/** Пауза перед кожною наступною спробою (після 1-ї спроби без затримки). */
const TOKEN_RETRY_DELAYS_MS = [4000, 7000, 11000, 15000, 18000, 22000, 30000]
/** Таймаут одного HTTP-запиту до Mono (invoice/status). */
const MONO_INVOICE_STATUS_TIMEOUT_MS = 60_000

async function fetchCardToken(
  invoiceId: string,
  walletId: string,
  fromPayload: MonoWalletData,
): Promise<CardTokenResult | null> {
  // 1. Спроба взяти токен із тіла webhook (Mono інколи одразу кладе сюди walletData)
  const payloadToken = (fromPayload.cardToken || '').trim()
  if (payloadToken) {
    log('info', 'Card token found in webhook payload', { invoiceId })
    return {
      cardToken: payloadToken,
      walletId: (fromPayload.walletId || walletId).trim(),
      maskedPan: fromPayload.maskedPan || null,
      cardType: fromPayload.paymentSystem || fromPayload.cardType || null,
    }
  }

  const xtoken = (process.env.XTOKEN || '').trim()
  if (!xtoken) {
    log('warn', 'XTOKEN not configured — cannot fetch card token from Mono API', { invoiceId })
    return null
  }

  for (let attempt = 1; attempt <= TOKEN_RETRIES; attempt++) {
    if (attempt > 1) {
      const delayIdx = Math.min(attempt - 2, TOKEN_RETRY_DELAYS_MS.length - 1)
      const delay = TOKEN_RETRY_DELAYS_MS[delayIdx] ?? 10_000
      log('info', `Token not ready yet, waiting ${delay}ms before retry ${attempt}/${TOKEN_RETRIES}`, {
        invoiceId,
        attempt,
      })
      await sleep(delay)
    }

    try {
      log('info', `Fetching invoice status from Mono (attempt ${attempt}/${TOKEN_RETRIES})`, { invoiceId })
      const res = await fetch(
        `https://api.monobank.ua/api/merchant/invoice/status?invoiceId=${encodeURIComponent(invoiceId)}`,
        {
          headers: { 'X-Token': xtoken },
          signal: AbortSignal.timeout(MONO_INVOICE_STATUS_TIMEOUT_MS),
        },
      )
      const rawText = await res.text()
      let body: {
        status?: string
        walletData?: { cardToken?: string; walletId?: string; status?: string }
        paymentInfo?: { maskedPan?: string; paymentSystem?: string }
      }
      try {
        body = JSON.parse(rawText)
      } catch {
        log('warn', 'Invoice status is not valid JSON', { invoiceId, attempt, httpStatus: res.status, rawText: rawText.slice(0, 200) })
        continue
      }

      const wd = body.walletData || {}
      const pi = body.paymentInfo || {}
      log('info', 'Invoice status response', {
        invoiceId,
        attempt,
        httpStatus: res.status,
        monoStatus: body.status,
        walletData: wd,
        maskedPan: pi.maskedPan,
        paymentSystem: pi.paymentSystem,
      })

      const token = (wd.cardToken || '').trim()
      if (token) {
        log('info', 'Card token obtained', { invoiceId, attempt, maskedPan: pi.maskedPan })
        return {
          cardToken: token,
          walletId: (wd.walletId || walletId).trim(),
          maskedPan: pi.maskedPan || null,
          cardType: pi.paymentSystem || null,
        }
      }

      log('info', 'cardToken not yet available in walletData', { invoiceId, attempt, walletData: wd })
    } catch (err) {
      log('error', `Invoice status fetch attempt ${attempt} failed`, { invoiceId, err: String(err) })
    }
  }

  log('warn', 'Card token not obtained after all retries', { invoiceId, retries: TOKEN_RETRIES })
  return null
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let rawPayload: unknown
  try {
    rawPayload = await request.json()
  } catch {
    log('error', 'Failed to parse webhook JSON body')
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const payload = rawPayload as MonoWebhookPayload
  const invoiceId = (payload.invoiceId || '').trim()
  const status = (payload.status || '').trim()
  const walletData = payload.walletData || {}

  log('info', 'Webhook received', { invoiceId, status, hasWalletData: !!payload.walletData })

  if (!invoiceId) {
    log('warn', 'Webhook missing invoiceId')
    return NextResponse.json({ ok: false, error: 'invoiceId is required' }, { status: 400 })
  }

  const db = openDb()
  try {
    const payment = db.prepare(
      `SELECT id, user_id, months, price, mode, status, wallet_id,
              COALESCE(admin_chat_notified, 0) AS admin_chat_notified
       FROM payments
       WHERE invoice_id = ?`,
    ).get(invoiceId) as
      | {
          id: number
          user_id: number
          months: number
          price: number
          mode: string
          status: string
          wallet_id: string | null
          admin_chat_notified: number
        }
      | undefined

    if (!payment) {
      log('warn', 'Payment not found in DB', { invoiceId })
      return NextResponse.json({ ok: true, skipped: 'payment_not_found' })
    }

    log('info', 'Payment found', {
      invoiceId,
      paymentId: payment.id,
      userId: payment.user_id,
      months: payment.months,
      mode: payment.mode,
      currentStatus: payment.status,
    })

    if (!status) {
      log('warn', 'Webhook has empty status', { invoiceId })
      return NextResponse.json({ ok: true, skipped: 'empty_status' })
    }

    if (!isPaidStatus(status)) {
      log('info', 'Non-paid status, updating payment record', { invoiceId, status })
      db.prepare('UPDATE payments SET status = ? WHERE id = ?').run(status.toLowerCase(), payment.id)
      return NextResponse.json({ ok: true, skipped: 'non_paid_status' })
    }

    // Вже оплачено в БД (повторний webhook після таймауту / ретраї Mono).
    // Раніше тут одразу виходили — і лог у чат адмінів міг ніколи не піти.
    if (isPaidInDatabase(payment.status)) {
      const notified = Number(payment.admin_chat_notified || 0) === 1
      if (!notified) {
        log('warn', 'Duplicate webhook for paid invoice — sending missed admin log', { invoiceId })
        const adminOk = await sendAdminPaymentLog(db, payment, invoiceId, { mode: 'from_db' })
        if (adminOk || !parseTelegramGroupId()) {
          db.prepare('UPDATE payments SET admin_chat_notified = 1 WHERE id = ?').run(payment.id)
        }
      } else {
        log('info', 'Payment already marked as paid, skipping duplicate webhook', { invoiceId })
      }
      return NextResponse.json({ ok: true, skipped: 'already_paid' })
    }

    // ── Mark payment as paid ──────────────────────────────────────────────────
    log('info', 'Marking payment as paid', { invoiceId, paymentId: payment.id })
    db.prepare('UPDATE payments SET status = ? WHERE id = ?').run('paid', payment.id)

    // ── Load current subscription for stacking ────────────────────────────────
    const userSubscription = db.prepare(
      `SELECT s.end_date AS subscription_end_date, u.referred_by, u.user_name
       FROM users u
       LEFT JOIN subscriptions s ON s.user_id = u.user_id
       WHERE u.user_id = ?`,
    ).get(payment.user_id) as {
      subscription_end_date: string | null
      referred_by: number | null
      user_name: string | null
    } | undefined

    // ── Activate subscription ─────────────────────────────────────────────────
    const nextEndDateIso = nextEndDateForPayment(
      userSubscription?.subscription_end_date || null,
      Number(payment.months),
      payment.mode !== 'recurring',
    )
    const nowIso = nowKyivIso()

    log('info', 'Activating subscription', {
      userId: payment.user_id,
      months: payment.months,
      mode: payment.mode,
      endDate: nextEndDateIso,
    })

    db.prepare(
      `INSERT INTO subscriptions (
         user_id, months, end_date, status, recurring_enabled, recurring_wallet_id,
         recurring_cancelled_at, created_at, updated_at
       ) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         months = excluded.months,
         end_date = excluded.end_date,
         status = 'active',
         recurring_enabled = excluded.recurring_enabled,
         recurring_wallet_id = excluded.recurring_wallet_id,
         recurring_cancelled_at = excluded.recurring_cancelled_at,
         updated_at = excluded.updated_at`,
    ).run(
      payment.user_id,
      payment.months,
      nextEndDateIso,
      payment.mode === 'recurring' ? 1 : 0,
      payment.mode === 'recurring' ? payment.wallet_id : null,
      payment.mode === 'recurring' ? null : nowIso,
      nowIso,
      nowIso,
    )

    // ── Спочатку повідомляємо користувача та чат (до довгого fetch токена) ───────
    // Інакше таймаут / обрив після UPDATE paid залишав оплату без логів у чаті,
    // а повторний webhook потрапляв у already_paid і мовчки виходив.
    const prettyEndDate = formatDateUaLong(nextEndDateIso)
    const miniAppUrl = buildMiniAppUrl(payment.user_id)
    const userReplyMarkup: TelegramReplyMarkup | undefined = miniAppUrl
      ? { inline_keyboard: [[{ text: '🚀 Відкрити Flix VPN', web_app: { url: miniAppUrl } }]] }
      : undefined

    const userMessage =
      `🎉 <b>Оплата успішна</b>\n\n` +
      `🔓 Ви можете користуватися Flix VPN до <b>${prettyEndDate}</b>\n\n` +
      `🛡 <b>План:</b> ${payment.months} міс.\n` +
      `💰 <b>Сума:</b> ${Number(payment.price).toFixed(2)} грн\n\n` +
      `Відкрийте Mini App, перейдіть у «Пристрої» та додайте пристрій — отримаєте унікальне посилання для підключення VPN 👇`

    log('info', 'Sending user notification', { userId: payment.user_id })
    await sendTelegramHtml(payment.user_id, userMessage, userReplyMarkup)

    const paymentAmount = Number(payment.price || 0)
    const referrerId = Number(userSubscription?.referred_by || 0)
    if (referrerId > 0 && paymentAmount > 0) {
      const referralPercent = getReferralPercent()
      const rewardAmount = Number(((paymentAmount * referralPercent) / 100).toFixed(2))
      if (rewardAmount > 0) {
        db.prepare(`UPDATE users SET balance = COALESCE(balance, 0) + ? WHERE user_id = ?`).run(
          rewardAmount,
          referrerId,
        )
        const payerDisplay = userSubscription?.user_name
          ? `@${userSubscription.user_name}`
          : `<code>${payment.user_id}</code>`
        log('info', 'Sending referral reward notification', { referrerId, rewardAmount })
        await sendTelegramHtml(
          referrerId,
          `💸 ${payerDisplay} оплатив підписку і на ваш рахунок нараховано <b>${rewardAmount.toFixed(2)} грн</b>!`,
        )
      }
    }

    const recurringLogMode: RecurringTokenLogMode =
      payment.mode === 'recurring' ? 'pending' : 'none'
    let adminLogOk = await sendAdminPaymentLog(db, payment, invoiceId, {
      mode: recurringLogMode,
    })
    if (adminLogOk || !parseTelegramGroupId()) {
      db.prepare('UPDATE payments SET admin_chat_notified = 1 WHERE id = ?').run(payment.id)
    }

    // ── Save card token for recurring payments (може тривати десятки секунд) ───
    let recurringCardToken: string | null = null
    if (payment.mode === 'recurring') {
      log('info', 'Recurring payment — starting card token fetch', {
        invoiceId,
        userId: payment.user_id,
        walletId: payment.wallet_id,
      })

      const tokenResult = await fetchCardToken(invoiceId, payment.wallet_id || '', walletData)

      if (tokenResult) {
        recurringCardToken = tokenResult.cardToken
        log('info', 'Saving card token to recurring_subscriptions', {
          userId: payment.user_id,
          walletId: tokenResult.walletId,
          maskedPan: tokenResult.maskedPan,
          nextPaymentDate: nextEndDateIso,
        })
        db.prepare(
          `INSERT INTO recurring_subscriptions (
             user_id, wallet_id, card_token, masked_card, card_type,
             months, price, next_payment_date, fail_count, status,
             last_error, created_at, updated_at, cancelled_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', NULL, ?, ?, NULL)
           ON CONFLICT(user_id) DO UPDATE SET
             wallet_id = excluded.wallet_id,
             card_token = excluded.card_token,
             masked_card = excluded.masked_card,
             card_type = excluded.card_type,
             months = excluded.months,
             price = excluded.price,
             next_payment_date = excluded.next_payment_date,
             fail_count = 0,
             status = 'active',
             last_error = NULL,
             updated_at = excluded.updated_at,
             cancelled_at = NULL`,
        ).run(
          payment.user_id,
          tokenResult.walletId,
          tokenResult.cardToken,
          tokenResult.maskedPan,
          tokenResult.cardType,
          payment.months,
          payment.price,
          nextEndDateIso,
          nowIso,
          nowIso,
        )
        log('info', 'recurring_subscriptions record saved', { userId: payment.user_id })
        const gid = parseTelegramGroupId()
        if (gid) {
          const maskedRaw = (tokenResult.maskedPan || '').trim()
          const maskedLine = maskedRaw
            ? `\nКарта: <b>${maskedRaw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</b>`
            : ''
          await sendTelegramHtml(
            gid,
            `📬 <b>Апдейт по платежу</b>\n` +
              `<b>Токен для автосписання отримано та збережено</b>\n\n` +
              `User ID: <code>${payment.user_id}</code>\n` +
              `Invoice: <code>${invoiceId}</code>\n` +
              `План: ${payment.months} міс.\n` +
              `Сума: ${Number(payment.price).toFixed(2)} грн` +
              maskedLine +
              `\nТокен: <code>${recurringCardToken}</code>`,
            buildAdminUserMarkup(payment.user_id),
          )
        }
      } else {
        log('error', 'Card token not obtained — recurring_subscriptions NOT saved', {
          invoiceId,
          userId: payment.user_id,
        })
        const gid = parseTelegramGroupId()
        if (gid) {
          await sendTelegramHtml(
            gid,
            `⚠️ <b>Recurring:</b> оплата пройшла, токен картки <b>не отримано</b>\n` +
              `User ID: <code>${payment.user_id}</code>\n` +
              `Invoice: <code>${invoiceId}</code>`,
            buildAdminUserMarkup(payment.user_id),
          )
        }
      }
    }

    log('info', 'Webhook processed successfully', { invoiceId, userId: payment.user_id })
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook processing failed'
    log('error', 'Unhandled error in webhook', { invoiceId, error: message })
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  } finally {
    db.close()
  }
}
