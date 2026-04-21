'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

export default function RedirectPage() {
  const params = useSearchParams()
  const [target, setTarget] = useState<string | null>(null)
  const [triggered, setTriggered] = useState(false)

  useEffect(() => {
    const url = params.get('to')
    if (!url) return
    setTarget(url)
    // Auto-trigger navigation to deep link
    try {
      window.location.href = url
      setTriggered(true)
    } catch {
      // ignore
    }
  }, [params])

  if (!target) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 px-6 text-center">
        <p className="text-white/60">Невірне посилання</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 px-6 text-center">
      <div className="max-w-sm space-y-5">
        <div className="text-4xl">🛡️</div>
        <h1 className="text-xl font-bold text-white">Відкриття Happ VPN</h1>
        {triggered ? (
          <p className="text-sm text-white/60">
            Якщо додаток не відкрився автоматично — натисніть кнопку нижче або скопіюйте посилання і відкрийте вручну в Happ.
          </p>
        ) : (
          <p className="text-sm text-white/60">Підготовка з&apos;єднання…</p>
        )}

        <a
          href={target}
          className="block w-full rounded-2xl px-5 py-4 text-base font-bold text-white"
          style={{
            background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
            boxShadow: '0 8px 24px rgba(34,211,238,0.25)',
          }}
        >
          Відкрити Happ
        </a>

        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(target).then(() => alert('Скопійовано!'))}
          className="w-full rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white/70 transition hover:text-white"
        >
          Скопіювати посилання
        </button>

        <p className="text-xs text-white/30">
          Переконайтеся, що додаток Happ встановлено на вашому пристрої
        </p>
      </div>
    </div>
  )
}
