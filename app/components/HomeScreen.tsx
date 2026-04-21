'use client'

import { OS_INSTALL_OPTIONS, type OsId } from '../types'
import { ShieldIcon } from './ShieldIcon'
import type { ActiveDevice } from './FlixVPNApp'

interface HomeScreenProps {
  isSubscribed: boolean
  subscriptionEnd: string | null
  recurringEnabled: boolean
  nextRecurringPaymentDate: string | null
  vpnAccessLink: string | null
  activeDevices: ActiveDevice[]
  canAddDevice: boolean
  selectedOs: OsId
  onSelectOs: (osId: OsId) => void
  onOpenTariffs: () => void
  onGoToDevices: () => void
  onAddDevice: () => Promise<void> | void
}

export function HomeScreen({
  isSubscribed,
  subscriptionEnd,
  recurringEnabled,
  nextRecurringPaymentDate,
  activeDevices,
  canAddDevice,
  selectedOs,
  onSelectOs,
  onOpenTariffs,
  onGoToDevices,
  onAddDevice,
}: HomeScreenProps) {
  const selectedInstall = OS_INSTALL_OPTIONS.find((os) => os.id === selectedOs) ?? OS_INSTALL_OPTIONS[0]

  return (
    <div className="space-y-4 pt-4">
      {/* Hero */}
      <section className="lg-card rounded-3xl p-6">
        <div className="mb-3 flex items-center gap-3 text-cyan-400">
          <span className="inline-flex shrink-0 items-center justify-center">
            <ShieldIcon size={28} />
          </span>
          <h1 className="text-[2rem] font-extrabold tracking-tight text-white">
            Flix VPN
          </h1>
        </div>
        <p className="mt-2 text-[1rem] leading-relaxed text-white/70">
          Мінімальний та зручний доступ до VPN. Статус підписки,
          підключення і базові інструкції — тут.
        </p>
      </section>

      {/* Subscription status + CTA */}
      <section className="lg-card rounded-3xl p-6">
        <div className="mb-2 flex items-center gap-2.5">
          <span
            className={`h-2.5 w-2.5 rounded-full pulse-dot ${
              isSubscribed ? 'bg-emerald-400 text-emerald-400' : 'bg-amber-400 text-amber-400'
            }`}
          />
          <p className="text-[1rem] font-semibold text-white">
            {isSubscribed ? 'Підписка активна' : 'Підписка не оформлена'}
          </p>
        </div>
        <p className="text-[0.97rem] text-white/65">
          {isSubscribed
            ? `Підписка активна до ${subscriptionEnd ?? '—'}`
            : 'Оформлення підписки доступне на екрані тарифів.'}
        </p>

        {isSubscribed && recurringEnabled && (
          <div className="lg-accent mt-3 rounded-2xl p-3">
            <p className="text-sm font-semibold text-cyan-300">Автосписання активне</p>
            <p className="mt-0.5 text-sm text-white/70">
              Наступний платіж: <span className="text-white">{nextRecurringPaymentDate ?? '—'}</span>
            </p>
            <p className="mt-1 text-xs text-white/50">
              Керування підпискою доступне в профілі.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={isSubscribed ? onGoToDevices : onOpenTariffs}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-[1.05rem] font-bold tracking-wide text-white transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
          style={{
            background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
            boxShadow: '0 8px 32px rgba(34,211,238,0.25), inset 0 1px 0 rgba(255,255,255,0.2)',
          }}
        >
          <span aria-hidden className="text-lg leading-none">⚡</span>
          {isSubscribed ? 'Підключити VPN' : 'Підключити VPN та обрати тариф'}
        </button>
      </section>

      {/* Devices */}
      <section className="lg-card rounded-3xl p-6">
        <h2 className="text-[0.82rem] font-bold uppercase tracking-[0.12em] text-white/45">
          Підключені пристрої
        </h2>
        <div className="mt-3 space-y-2">
          {activeDevices.length > 0 ? (
            activeDevices.map((device) => (
              <div
                key={device.id}
                className="lg-inner flex items-center justify-between rounded-xl px-3 py-2.5"
              >
                <span className="text-[0.98rem] font-medium text-white">{device.name}</span>
                <span className="text-[0.9rem] font-medium text-emerald-400">Активний</span>
              </div>
            ))
          ) : (
            <div
              className="rounded-xl px-3 py-3 text-[0.95rem] text-white/60"
              style={{
                background: 'rgba(34,211,238,0.05)',
                border: '1px dashed rgba(34,211,238,0.22)',
              }}
            >
              {isSubscribed
                ? 'Поки що немає активних підключень.'
                : 'Список пристроїв зʼявиться після активації підписки.'}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onAddDevice}
          disabled={!isSubscribed || !canAddDevice}
          className="lg-inner mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[0.97rem] font-medium transition-all duration-150 enabled:hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-35"
          style={{ color: '#67e8f9' }}
        >
          <span aria-hidden className="text-base leading-none font-bold">+</span>
          Підключити новий пристрій
        </button>
        {isSubscribed && !canAddDevice && (
          <p className="mt-2 text-sm text-amber-300">Досягнуто ліміт: максимум 5 активних пристроїв.</p>
        )}
      </section>

      {/* Install section */}
      <section className="lg-card rounded-3xl p-6">
        <h2 className="text-[0.82rem] font-bold uppercase tracking-[0.12em] text-white/45">
          Встановлення застосунку
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {OS_INSTALL_OPTIONS.map((os) => (
            <button
              key={os.id}
              type="button"
              onClick={() => onSelectOs(os.id)}
              className="rounded-xl px-3 py-2 text-[0.93rem] font-medium transition-all duration-150"
              style={
                selectedOs === os.id
                  ? {
                      background: 'rgba(34,211,238,0.18)',
                      border: '1px solid rgba(34,211,238,0.45)',
                      color: '#22d3ee',
                      boxShadow: '0 0 10px rgba(34,211,238,0.15)',
                    }
                  : {
                      background: 'rgba(255,255,255,0.07)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'rgba(255,255,255,0.65)',
                    }
              }
            >
              {os.label}
            </button>
          ))}
        </div>
        <a
          href={selectedInstall.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-center text-[0.97rem] font-semibold text-white transition-all duration-150 hover:brightness-110"
          style={{
            background: 'linear-gradient(135deg, #0e7490 0%, #1d4ed8 100%)',
            boxShadow: '0 4px 16px rgba(6,182,212,0.22)',
          }}
        >
          Встановити для {selectedInstall.label}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M2 12L12 2M12 2H6M12 2v6" stroke="rgba(255,255,255,0.75)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
        <p
          className="lg-inner mt-3 rounded-xl px-3 py-2.5 text-sm leading-relaxed text-white/60"
        >
          Після інсталяції поверніться в застосунок і натисніть «Підключити VPN».
        </p>
      </section>
    </div>
  )
}
