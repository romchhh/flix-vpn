'use client'

import { useState } from 'react'
import { AndroidIcon, AndroidTvIcon, AppleTvIcon, IosIcon, MacosIcon, WindowsIcon } from './DeviceIcons'
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
  if (n.includes('apple tv') || n.includes('appletv') || n.includes('tvos')) return <AppleTvIcon />
  if (n.includes('android tv')) return <AndroidTvIcon />
  if (n.includes('android')) return <AndroidIcon />
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
      className="rounded-full px-2.5 py-0.5 text-xs font-medium text-cyan-200/90"
      style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.2)' }}
    >
      Трафік: {label}
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
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const handleCopy = (url: string, deviceId: number) => {
    navigator.clipboard.writeText(url).catch(() => null)
    setCopiedId(deviceId)
    setTimeout(() => setCopiedId(null), 1800)
  }

  const handleRemoveDevice = async (deviceId: number) => {
    const shouldRemove = window.confirm('Видалити цей пристрій?')
    if (!shouldRemove) return
    await onRemoveDevice(deviceId)
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
              <div
                key={device.id}
                className="lg-inner rounded-2xl p-4"
                style={{ border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center text-cyan-300">
                      {getDeviceIcon(device.name)}
                    </span>
                    <div>
                      <p className="text-[1rem] font-semibold text-white">{device.name}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span
                          className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium text-emerald-300"
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
                    onClick={() => handleRemoveDevice(device.id)}
                    aria-label="Видалити пристрій"
                    title="Видалити пристрій"
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-white/30 transition hover:bg-red-500/10 hover:text-red-300"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M4 7h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      <path d="M9 4h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      <path d="M8 7v12m8-12v12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      <path d="M6.5 7l1 13h9l1-13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>

                {device.subscriptionUrl ? (
                  <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[0.72rem] font-bold uppercase tracking-[0.1em] text-white/45">
                        VPN-посилання
                      </p>
                      <button
                        type="button"
                        onClick={() => setExpandedId((prev) => (prev === device.id ? null : device.id))}
                        className="rounded-md px-2.5 py-1 text-[0.72rem] font-semibold text-white/65 transition hover:text-white"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                      >
                        {expandedId === device.id ? 'Сховати' : 'Показати'}
                      </button>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopy(device.subscriptionUrl!, device.id)}
                        className="flex-1 rounded-lg py-2.5 text-xs font-semibold text-white transition hover:brightness-110"
                        style={{
                          background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
                          boxShadow: '0 2px 10px rgba(34,211,238,0.2)',
                        }}
                      >
                        {copiedId === device.id ? '✓ Скопійовано' : 'Копіювати'}
                      </button>
                      <button
                        type="button"
                        onClick={() => device.subscriptionUrl && onConnectDevice(device.subscriptionUrl)}
                        className="flex-1 rounded-lg py-2.5 text-center text-xs font-semibold text-cyan-300 transition hover:text-cyan-200"
                        style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.22)' }}
                      >
                        Відкрити Happ
                      </button>
                    </div>
                    {expandedId === device.id && (
                      <p
                        className="mt-2 break-all rounded-lg border border-cyan-300/20 bg-cyan-500/5 px-2.5 py-2 font-mono text-[0.74rem] text-cyan-200/95"
                      >
                        {device.subscriptionUrl}
                      </p>
                    )}
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
