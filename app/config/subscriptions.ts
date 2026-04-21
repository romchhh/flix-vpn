import type { Plan } from '../types'

// Subscription pricing configuration for web app.
export const SITE_PLAN_PRICE_BY_MONTHS: Record<number, number> = {
  1: 99,
  3: 200,
  6: 350,
  12: 600,
}

export const SITE_PLANS: Plan[] = [
  { id: '1m', label: '1 місяць', months: 1, price: SITE_PLAN_PRICE_BY_MONTHS[1], perMonth: 99, savePct: null, best: false },
  { id: '3m', label: '3 місяці', months: 3, price: SITE_PLAN_PRICE_BY_MONTHS[3], perMonth: 67, savePct: 17, best: false },
  { id: '6m', label: '6 місяців', months: 6, price: SITE_PLAN_PRICE_BY_MONTHS[6], perMonth: 58, savePct: 41, best: true },
  { id: '12m', label: '12 місяців', months: 12, price: SITE_PLAN_PRICE_BY_MONTHS[12], perMonth: 50, savePct: 50, best: false },
]
