'use client'

import { useEffect, type ReactNode } from 'react'

interface TelegramWebApp {
  expand?: () => void
  disableVerticalSwipes?: () => void
  enableClosingConfirmation?: () => void
  ready?: () => void
}

interface TelegramWindow {
  Telegram?: {
    WebApp?: TelegramWebApp
  }
}

export function ShopLayoutClient({ children }: { children: ReactNode }) {
  useEffect(() => {
    const tg = (window as unknown as TelegramWindow).Telegram?.WebApp
    if (!tg) {
      return
    }
    tg.expand?.()
    tg.disableVerticalSwipes?.()
    tg.enableClosingConfirmation?.()
    tg.ready?.()
  }, [])

  return <>{children}</>
}
