import type { Plan } from '../types'

export type PaymentMode = 'recurring' | 'one_time'

export interface GeneratedPayment {
  localPaymentId: string
  mode: PaymentMode
  months: number
  price: number
  paymentUrl: string
  description: string
}

function getPaymentMode(months: number): PaymentMode {
  return months === 1 ? 'recurring' : 'one_time'
}

export function generatePayment(
  userId: number,
  plan: Plan,
): GeneratedPayment {
  const mode = getPaymentMode(plan.months)
  const localPaymentId = `${mode === 'recurring' ? 'subscription' : 'order'}_${userId}_${Date.now()}`
  const paymentUrl =
    mode === 'recurring'
      ? `https://mono.example/subscription/start?pid=${localPaymentId}&months=${plan.months}`
      : `https://mono.example/payment/start?pid=${localPaymentId}&months=${plan.months}`

  return {
    localPaymentId,
    mode,
    months: plan.months,
    price: plan.price,
    paymentUrl,
    description:
      mode === 'recurring'
        ? `Рекурентний платіж на ${plan.months} міс.`
        : `Одноразовий платіж на ${plan.months} міс.`,
  }
}
