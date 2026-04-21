const XTOKEN = process.env.XTOKEN

export interface CreatePaymentResult {
  invoiceId: string
  pageUrl: string
  localPaymentId: string
}

export interface CreatePaymentWithTokenizationResult extends CreatePaymentResult {
  walletId: string
}

async function createInvoice(payload: Record<string, unknown>) {
  const response = await fetch('https://api.monobank.ua/api/merchant/invoice/create', {
    method: 'POST',
    headers: {
      'X-Token': XTOKEN || '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const details = await response.text()
    throw new Error(`Mono create invoice failed: ${response.status} ${details}`)
  }

  const data = (await response.json()) as { invoiceId?: string; pageUrl?: string }
  if (!data.invoiceId || !data.pageUrl) {
    throw new Error('Mono response missing invoiceId/pageUrl')
  }
  return {
    invoiceId: data.invoiceId,
    pageUrl: data.pageUrl,
  }
}

function getBotUrl(): string {
  const botName = (process.env.BOT_NAME || process.env.NEXT_PUBLIC_BOT_NAME || '').trim().replace(/^@/, '')
  if (botName) {
    return `https://t.me/${botName}`
  }
  // fallback to mini app URL if bot name not configured
  return (process.env.MINI_APP_URL || process.env.NEXT_PUBLIC_MINI_APP_URL || '').trim()
}

function getWebhookUrl(): string {
  const fromEnv = (process.env.MONO_WEBHOOK_URL || '').trim()
  if (fromEnv) {
    return fromEnv
  }
  const miniAppUrl = (process.env.MINI_APP_URL || process.env.NEXT_PUBLIC_MINI_APP_URL || '').trim()
  if (!miniAppUrl) {
    return ''
  }
  const normalized = miniAppUrl.replace(/\/+$/, '')
  return `${normalized}/api/monopay/webhook`
}

export async function createPayment(
  userId: number,
  productName: string,
  months: number,
  price: number,
): Promise<CreatePaymentResult> {
  if (!XTOKEN) {
    throw new Error('XTOKEN is not configured')
  }

  const localPaymentId = `order_${userId}_${Math.floor(Date.now() / 1000)}`
  const payload: Record<string, unknown> = {
    amount: Math.round(price * 100),
    ccy: 980,
    merchantPaymInfo: {
      reference: localPaymentId,
      destination: `Оплата ${productName} на ${months} міс.`,
      comment: `User ${userId}`,
      basketOrder: [
        {
          name: `${productName} ${months} міс.`,
          code: '00000000',
          qty: 1,
          sum: Math.round(price * 100),
        },
      ],
    },
    redirectUrl: getBotUrl(),
    webHookUrl: getWebhookUrl(),
  }

  const data = await createInvoice(payload)
  return {
    invoiceId: data.invoiceId,
    pageUrl: data.pageUrl,
    localPaymentId,
  }
}

export async function createPaymentWithTokenization(
  userId: number,
  productName: string,
  months: number,
  price: number,
): Promise<CreatePaymentWithTokenizationResult> {
  if (!XTOKEN) {
    throw new Error('XTOKEN is not configured')
  }

  const localPaymentId = `subscription_${userId}_${Math.floor(Date.now() / 1000)}`
  const walletId = `wallet_${userId}_${Math.random().toString(36).slice(2, 10)}`
  const payload: Record<string, unknown> = {
    amount: Math.round(price * 100),
    ccy: 980,
    merchantPaymInfo: {
      reference: localPaymentId,
      destination: `Підписка ${productName} на ${months} міс.`,
      comment: `User ${userId}`,
      basketOrder: [
        {
          name: `${productName} ${months} міс.`,
          code: '00000000',
          qty: 1,
          sum: Math.round(price * 100),
        },
      ],
    },
    redirectUrl: getBotUrl(),
    webHookUrl: getWebhookUrl(),
    saveCardData: {
      saveCard: true,
      walletId,
    },
  }

  const data = await createInvoice(payload)
  return {
    invoiceId: data.invoiceId,
    pageUrl: data.pageUrl,
    localPaymentId,
    walletId,
  }
}
