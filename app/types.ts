import type { ReactNode } from 'react'
import { SITE_PLANS } from './config/subscriptions'

export type PlanId = '1m' | '3m' | '6m' | '12m'

export interface Plan {
  id: PlanId
  label: string
  months: number
  price: number
  originalPrice?: number
  perMonth: number
  savePct: number | null
  best: boolean
}

export interface Device {
  id: string
  name: string
  icon: ReactNode
  active?: boolean
}

export type OsId = 'ios' | 'android' | 'macos' | 'windows' | 'android-tv' | 'apple-tv'

export interface OsInstallOption {
  id: OsId
  label: string
  url: string
}

export const PLANS: Plan[] = SITE_PLANS

export const OS_INSTALL_OPTIONS: OsInstallOption[] = [
  { id: 'ios', label: 'iOS', url: 'https://apps.apple.com/ua/app/happ-proxy-utility/id6504287215' },
  { id: 'android', label: 'Android', url: 'https://play.google.com/store/apps/details?id=com.happproxy' },
  { id: 'macos', label: 'macOS', url: 'https://apps.apple.com/ua/app/happ-proxy-utility/id6504287215' },
  { id: 'windows', label: 'Windows', url: 'https://github.com/Happ-proxy/happ-desktop/releases/latest/download/setup-Happ.x64.exe?' },
  { id: 'android-tv', label: 'Android TV', url: 'https://play.google.com/store/apps/details?id=com.happproxy' },
  { id: 'apple-tv', label: 'Apple TV', url: 'https://apps.apple.com/ua/app/happ-proxy-utility-for-tv/id6748297274?' },
]
