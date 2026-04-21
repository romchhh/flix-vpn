'use client'

import { IosIcon, MacosIcon, WindowsIcon } from './DeviceIcons'
import type { ActiveDevice } from './FlixVPNApp'

interface SubscriptionsScreenProps {
  isSubscribed: boolean
  activeDevices: ActiveDevice[]
  canAddDevice: boolean
  onAddDevice: () => Promise<void> | void
  onRemoveDevice: (deviceId: number) => Promise<void> | void
  onConnectDevice: (url: string) => void
}

function getDeviceIcon(deviceName: string) {
  const n = deviceName.toLowerCase()
  if (n.includes('ios') || n.includes('iphone') || n.includes('ipad')) return <IosIcon />
  if (n.includes('windows')) return <WindowsIcon />
  if (n.includes('mac')) return <MacosIcon />
  return (
    <span className="text-xs font-bold text-cyan-400">
      {deviceName.slice(0, 2).toUpperCase() || 'DV'}
    </span>
  )
}

function TrafficBadge({ mb }: { mb?: number }) {
  if (mb === undefined || mb === null) return null
  const label = mb < 1024 ? `${mb} МБ` : `${(mb / 1024).toFixed(1)} ГБ`
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-medium text-white/70"
      style={{ background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.12)' }}
    >
      {label}
    </span>
  )
}

export function SubscriptionsScreen({
  isSubscribed,
  activeDevices,
  canAddDevice,
  onAddDevice,
  onRemoveDevice,
  onConnectDevice,
}: SubscriptionsScreenProps) {
  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url).catch(() => null)
    window.alert('Посилання скопійовано!')
  }

  return (
    <div className="space-y-4 pt-4">
      {/* Header */}
      <section className="lg-card rounded-3xl p-6">
        <h1 className="text-[2rem] font-extrabold tracking-tight text-white">
          Пристрої
        </h1>
        <p className="mt-2 text-[1rem] text-white/65">
          Кожен пристрій має унікальне VPN-посилання. До 5 пристроїв на підписку.
        </p>
      </section>

      {/* Devices list */}
      <section className="lg-card rounded-3xl p-5">
        <div className="space-y-3">
          {activeDevices.length > 0 ? (
            activeDevices.map((device) => (
              <div key={device.id} className="lg-inner rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span
                      className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
                      style={{
                        background: 'rgba(34,211,238,0.12)',
                        border: '1px solid rgba(34,211,238,0.22)',
                        boxShadow: '0 0 10px rgba(34,211,238,0.1)',
                      }}
                    >
                      {getDeviceIcon(device.name)}
                    </span>
                    <div>
                      <p className="text-[1rem] font-semibold text-white">{device.name}</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span
                          className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-emerald-300"
                          style={{ background: 'rgba(16,185,129,0.14)', border: '1px solid rgba(16,185,129,0.28)' }}
                        >
                          Активний
                        </span>
                        <TrafficBadge mb={device.usedTrafficMb} />
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveDevice(device.id)}
                    className="flex-shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium text-red-300 transition hover:text-red-200 hover:brightness-110"
                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.22)' }}
                  >
                    Видалити
                  </button>
                </div>

                {device.subscriptionUrl ? (
                  <div
                    className="mt-3 rounded-xl p-3"
                    style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    <p className="mb-1.5 text-[0.72rem] font-bold uppercase tracking-[0.1em] text-white/40">
                      VPN-посилання
                    </p>
                    <p className="break-all font-mono text-[0.78rem] text-cyan-300">
                      {device.subscriptionUrl}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopy(device.subscriptionUrl!)}
                        className="flex-1 rounded-lg py-2 text-xs font-bold text-white transition hover:brightness-110"
                        style={{
                          background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
                          boxShadow: '0 2px 10px rgba(34,211,238,0.2)',
                        }}
                      >
                        Копіювати
                      </button>
                      <button
                        type="button"
                        onClick={() => device.subscriptionUrl && onConnectDevice(device.subscriptionUrl)}
                        className="flex-1 rounded-lg py-2 text-center text-xs font-semibold text-cyan-300 transition hover:text-cyan-200"
                        style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.22)' }}
                      >
                        Підключити
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-amber-300">
                    VPN-посилання ще генерується…
                  </p>
                )}
              </div>
            ))
          ) : (
            <div
              className="rounded-xl px-4 py-4 text-[0.95rem] text-white/60"
              style={{ background: 'rgba(34,211,238,0.05)', border: '1px dashed rgba(34,211,238,0.22)' }}
            >
              {isSubscribed
                ? 'Пристрої ще не додані. Натисніть нижче, щоб додати перший.'
                : 'Додавання пристроїв доступне після активації підписки.'}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onAddDevice}
          disabled={!isSubscribed || !canAddDevice}
          className="lg-inner mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[0.97rem] font-semibold transition-all duration-150 enabled:hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-35"
          style={{ color: '#67e8f9' }}
        >
          <span aria-hidden className="text-base font-bold leading-none">+</span>
          Додати пристрій
        </button>
        {isSubscribed && !canAddDevice && (
          <p className="mt-2 text-xs text-amber-300">
            Досягнуто ліміт: максимум 5 активних пристроїв.
          </p>
        )}
      </section>
    </div>
  )
}
