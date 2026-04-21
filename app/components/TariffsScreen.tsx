'use client'

import { useRef } from 'react'
import { PLANS, type Plan } from '../types'
import { PlanCard } from './PlanCard'

interface LastPaymentInfo {
  localPaymentId: string
  mode: 'recurring' | 'one_time'
  paymentUrl: string
  originalPrice?: number
  discountApplied?: number
  finalPrice?: number
  paidFromBalanceOnly?: boolean
}

interface TariffsScreenProps {
  selectedPlan: Plan['id']
  activePlan: Plan['id'] | null
  referralBalance: number
  applyReferralBalance: boolean
  onToggleReferralBalance: (enabled: boolean) => void
  onSelectPlan: (planId: Plan['id']) => void
  onSubscribe: () => void
  lastPayment: LastPaymentInfo | null
}

export function TariffsScreen({
  selectedPlan,
  activePlan,
  referralBalance,
  applyReferralBalance,
  onToggleReferralBalance,
  onSelectPlan,
  onSubscribe,
  lastPayment,
}: TariffsScreenProps) {
  const paymentSectionRef = useRef<HTMLElement | null>(null)
  const selected = PLANS.find((plan) => plan.id === selectedPlan)
  const discountApplied = applyReferralBalance ? Math.min(selected?.price || 0, referralBalance) : 0
  const finalPrice = Math.max(0, (selected?.price || 0) - discountApplied)

  const handleSelectPlan = (planId: Plan['id']) => {
    onSelectPlan(planId)
    requestAnimationFrame(() => {
      paymentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  return (
    <div className="space-y-4 pt-4">
      {/* Header */}
      <section className="lg-card rounded-3xl p-6">
        <h1 className="text-[2rem] font-extrabold tracking-tight text-white">Тарифи</h1>
        <p className="mt-2 text-[1rem] text-white/65">
          Оберіть план та оформіть підписку. Після оформлення на головній з&apos;явиться
          статус і кнопка підключення.
        </p>
      </section>

      {/* Plans */}
      <section className="lg-card space-y-2 rounded-3xl p-5">
        {PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            selected={selectedPlan === plan.id}
            onSelect={handleSelectPlan}
          />
        ))}
      </section>

      {/* Payment */}
      <section ref={paymentSectionRef} className="lg-card rounded-3xl p-6">
        <div className="flex items-center justify-between">
          <p className="text-[1rem] text-white/80">
            План:{' '}
            <span className="font-semibold text-cyan-300">{selected?.label}</span>
          </p>
          <p className="text-[1.15rem] font-bold text-white">{finalPrice.toFixed(2)} грн</p>
        </div>
        {referralBalance > 0 && (
          <label className="mt-2 flex cursor-pointer items-center gap-2">
            <span className="text-[0.82rem] text-white/50">• Використати баланс ({referralBalance.toFixed(2)} грн)?</span>
            <div
              className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-all duration-200 ${applyReferralBalance ? 'bg-cyan-500/70' : 'bg-white/15'}`}
              onClick={() => onToggleReferralBalance(!applyReferralBalance)}
              style={applyReferralBalance ? { boxShadow: '0 0 8px rgba(34,211,238,0.4)' } : {}}
            >
              <div
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${applyReferralBalance ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
              />
            </div>
          </label>
        )}
        {activePlan && (
          <p className="mt-2 text-sm text-emerald-400">
            Активний зараз: {PLANS.find((plan) => plan.id === activePlan)?.label}
          </p>
        )}
        <button
          type="button"
          onClick={onSubscribe}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-[1.05rem] font-bold tracking-wide text-white transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
          style={{
            background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
            boxShadow: '0 8px 32px rgba(34,211,238,0.25), inset 0 1px 0 rgba(255,255,255,0.2)',
          }}
        >
          <span aria-hidden className="text-base leading-none">✓</span>
          Оформити підписку
        </button>
        {lastPayment && (
          <div className="lg-inner mt-3 rounded-xl p-3 text-sm">
            <p className="font-semibold text-white">Остання генерація оплати</p>
            <p className="mt-0.5 text-white/60">
              Сума:{' '}
              {typeof lastPayment.finalPrice === 'number'
                ? lastPayment.finalPrice.toFixed(2)
                : (selected?.price || 0).toFixed(2)}{' '}
              грн
            </p>
            {lastPayment.paymentUrl ? (
              <a
                href={lastPayment.paymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-white transition hover:brightness-110"
                style={{ background: 'rgba(34,211,238,0.15)', border: '1px solid rgba(34,211,238,0.3)' }}
              >
                Відкрити посилання на оплату
              </a>
            ) : (
              <p className="mt-2 font-semibold text-emerald-400">
                Оплата покрита балансом рефералки
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
