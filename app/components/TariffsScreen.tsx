'use client'

import { useRef } from 'react'
import { PLANS, type Plan } from '../types'
import { PlanCard } from './PlanCard'

interface TariffsScreenProps {
  selectedPlan: Plan['id']
  activePlan: Plan['id'] | null
  referralBalance: number
  applyReferralBalance: boolean
  onToggleReferralBalance: (enabled: boolean) => void
  onSelectPlan: (planId: Plan['id']) => void
  onSubscribe: () => void
  isSubscribed: boolean
  subscriptionEnd: string | null
  recurringEnabled: boolean
  nextRecurringPaymentDate: string | null
  onOpenProfile?: () => void
}

export function TariffsScreen({
  selectedPlan,
  activePlan,
  referralBalance,
  applyReferralBalance,
  onToggleReferralBalance,
  onSelectPlan,
  onSubscribe,
  isSubscribed,
  subscriptionEnd,
  recurringEnabled,
  nextRecurringPaymentDate,
  onOpenProfile,
}: TariffsScreenProps) {
  const paymentSectionRef = useRef<HTMLElement | null>(null)
  const selected = PLANS.find((plan) => plan.id === selectedPlan)
  const discountApplied = applyReferralBalance ? Math.min(selected?.price || 0, referralBalance) : 0
  const finalPrice = Math.max(0, (selected?.price || 0) - discountApplied)
  const isRecurringSelected = (selected?.months ?? 0) === 1
  const activePlanLabel = activePlan ? PLANS.find((plan) => plan.id === activePlan)?.label : null

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

      {/* My subscription */}
      <section className="lg-card rounded-3xl p-6">
        <h2 className="text-[1.1rem] font-bold tracking-tight text-white">Моя підписка</h2>
        {!isSubscribed && (
          <p className="mt-2 text-[0.95rem] leading-relaxed text-white/60">
            Зараз немає активної підписки. Оберіть тариф нижче та оформіть доступ.
          </p>
        )}
        {isSubscribed && activePlanLabel && (
          <div className="mt-3 space-y-2 text-[0.95rem] leading-relaxed text-white/75">
            <p>
              <span className="text-white/50">План:</span>{' '}
              <span className="font-semibold text-cyan-200">{activePlanLabel}</span>
            </p>
            {subscriptionEnd && (
              <p>
                <span className="text-white/50">Активна до:</span>{' '}
                <span className="font-medium text-white/90">{subscriptionEnd}</span>
              </p>
            )}
            {recurringEnabled && (
              <>
                <p className="text-emerald-300/90">
                  Увімкнено автоматичне продовження (автосписання).
                  {nextRecurringPaymentDate && (
                    <>
                      {' '}
                      Наступний платіж: <span className="font-semibold">{nextRecurringPaymentDate}</span>.
                    </>
                  )}
                </p>
                <p className="text-[0.88rem] text-white/50">
                  Скасувати автопідписку можна в профілі — доступ збережеться до кінця оплаченого періоду.
                </p>
              </>
            )}
            {!recurringEnabled && (
              <p className="text-white/55">
                Це разовий тариф: наступне продовження оформлюється вручну, автосписання не застосовується.
              </p>
            )}
            {onOpenProfile && (
              <button
                type="button"
                onClick={onOpenProfile}
                className="mt-2 text-[0.9rem] font-semibold text-cyan-300 underline decoration-cyan-500/40 underline-offset-2"
              >
                Відкрити профіль
              </button>
            )}
          </div>
        )}
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
        {isRecurringSelected && (
          <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/[0.08] p-4 text-[0.88rem] leading-relaxed">
            <p className="font-semibold text-amber-200">Важливо:</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-white/78">
              <li>Після успішної оплати буде активована автоматична підписка</li>
              <li>Кошти будуть автоматично списуватися кожен місяць</li>
              <li>Ваша картка буде збережена для подальших платежів</li>
              <li>Ви можете скасувати підписку в будь-який час у своєму профілі</li>
              <li>При скасуванні підписки доступ зберігається до кінця оплаченого періоду</li>
            </ul>
            <p className="mt-3 border-t border-white/10 pt-3 text-[0.82rem] text-white/55">
              Продовжуючи, ви погоджуєтеся з умовами автоматичної підписки.
            </p>
          </div>
        )}
        {!isRecurringSelected && selected && (
          <p className="mt-3 text-[0.85rem] text-white/45">
            Обраний тариф — одноразова оплата без автоматичного продовження.
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
      </section>
    </div>
  )
}
