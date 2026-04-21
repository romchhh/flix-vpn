import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import Database from 'better-sqlite3'
import { nowKyivIso, addMonthsFromKyiv } from '@/lib/time'

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

interface TelegramInlineButton {
  text: string
  url?: string
  web_app?: { url: string }
}

interface TelegramReplyMarkup {
  inline_keyboard: Array<Array<TelegramInlineButton>>
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
  return new Database(dbPath)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseAdminIds(): number[] {
  const raw = (process.env.ADMINISTRATORS || '').trim()
  if (!raw) return []
  const normalized = raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1) : raw
  return normalized
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((id) => Number.isFinite(id) && id > 0)
}

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

// ── Telegram ──────────────────────────────────────────────────────────────────

async function sendTelegramMessage(
  chatId: number,
  text: string,
  replyMarkup?: TelegramReplyMarkup,
) {
  const token = (process.env.TOKEN || process.env.BOT_TOKEN || '').trim()
  if (!token) {
    log('warn', 'BOT TOKEN not configured, skipping Telegram message', { chatId })
    return
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
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
    if (!res.ok) {
      const body = await res.text()
      log('warn', 'Telegram sendMessage failed', { chatId, status: res.status, body })
    }
  } catch (err) {
    log('error', 'Telegram sendMessage threw', { chatId, err: String(err) })
  }
}

// ── Card token fetching with retries ──────────────────────────────────────────

const TOKEN_RETRIES = 4
const TOKEN_RETRY_DELAYS_MS = [1500, 3000, 5000, 8000]

async function fetchCardToken(
  invoiceId: string,
  walletId: string,
  fromPayload: MonoWalletData,
): Promise<CardTokenResult | null> {
  // 1. Try token already present in the webhook payload
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
      const delay = TOKEN_RETRY_DELAYS_MS[attempt - 2] ?? 5000
      log('info', `Token not ready yet, waiting ${delay}ms before retry ${attempt}/${TOKEN_RETRIES}`, {
        invoiceId,
        attempt,
      })
      await sleep(delay)
    }

    // Fetch invoice status — cardToken appears in walletData (may take a few seconds after payment)
    try {
      log('info', `Fetching invoice status from Mono (attempt ${attempt}/${TOKEN_RETRIES})`, { invoiceId })
      const res = await fetch(
        `https://api.monobank.ua/api/merchant/invoice/status?invoiceId=${encodeURIComponent(invoiceId)}`,
        { headers: { 'X-Token': xtoken } },
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
      `SELECT id, user_id, months, price, mode, status, wallet_id
       FROM payments
       WHERE invoice_id = ?`,
    ).get(invoiceId) as
      | { id: number; user_id: number; months: number; price: number; mode: string; status: string; wallet_id: string | null }
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

    // Already processed — idempotency guard
    if ((payment.status || '').toLowerCase() === 'paid') {
      log('info', 'Payment already marked as paid, skipping duplicate webhook', { invoiceId })
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

    // ── Save card token for recurring payments ────────────────────────────────
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
      } else {
        log('error', 'Card token not obtained — recurring_subscriptions NOT saved', {
          invoiceId,
          userId: payment.user_id,
        })
      }
    }

    // ── User notification ─────────────────────────────────────────────────────
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
    await sendTelegramMessage(payment.user_id, userMessage, userReplyMarkup)

    // ── Referral reward ───────────────────────────────────────────────────────
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
        await sendTelegramMessage(
          referrerId,
          `💸 ${payerDisplay} оплатив підписку і на ваш рахунок нараховано <b>${rewardAmount.toFixed(2)} грн</b>!`,
        )
      }
    }

    // ── Admin notification ────────────────────────────────────────────────────
    const adminText =
      `💳 Нова успішна оплата\n` +
      `User ID: <code>${payment.user_id}</code>\n` +
      `План: ${payment.months} міс.\n` +
      `Сума: ${Number(payment.price).toFixed(2)} грн\n` +
      `Invoice: <code>${invoiceId}</code>` +
      (payment.mode === 'recurring'
        ? `\nТокен: <code>${recurringCardToken || 'не отримано'}</code>`
        : '')

    const adminUserMarkup: TelegramReplyMarkup = {
      inline_keyboard: [
        [{ text: '👤 Переглянути профіль', url: `tg://user?id=${payment.user_id}` }],
      ],
    }

    const adminIds = parseAdminIds()
    log('info', 'Sending admin notifications', { adminIds, invoiceId })
    for (const adminId of adminIds) {
      await sendTelegramMessage(adminId, adminText, adminUserMarkup)
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
