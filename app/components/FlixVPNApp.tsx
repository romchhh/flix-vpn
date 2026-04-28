'use client'

import { useEffect, useState } from 'react'
import { buildReferralShareText } from '../lib/referrals'
import { OS_INSTALL_OPTIONS, type OsId, type Plan } from '../types'
import { HomeScreen } from './HomeScreen'
import { TariffsScreen } from './TariffsScreen'
import { SubscriptionsScreen } from './SubscriptionsScreen'
import { ProfileScreen } from './ProfileScreen'
import { BottomNav } from './BottomNav'

type Tab = 'home' | 'tariffs' | 'subscriptions' | 'profile'

interface TelegramWindow {
  Telegram?: {
    WebApp?: {
      initData?: string
      openLink?: (url: string, options?: { try_instant_view?: boolean; try_browser?: string }) => void
      initDataUnsafe?: {
        user?: {
          id?: number
        }
      }
    }
  }
}

function addMonths(base: Date, months: number) {
  const next = new Date(base)
  next.setMonth(next.getMonth() + months)
  return next
}

export interface ActiveDevice {
  id: number
  name: string
  subscriptionUrl: string | null
  usedTrafficMb?: number
}

interface LoadedProfile {
  userId: number
  username: string | null
  firstName: string | null
  lastName: string | null
  referralCount: number
  referralBalance: number
  notificationsEnabled: boolean
  subscriptionsCount: number
  devicesCount: number
  activeDevices: ActiveDevice[]
  subscription: {
    active: boolean
    status: string
    months: number | null
    endDate: string | null
    recurring?: {
      enabled: boolean
      nextPaymentDate: string | null
      canCancel: boolean
      walletId: string | null
    }
  }
  pricing?: {
    discountPercent: number
    priceByMonths: Record<number, number>
  }
}

interface PaymentCreateResult {
  ok: boolean
  mode: 'recurring' | 'one_time'
  paymentUrl: string
  localPaymentId: string
  invoiceId: string
  walletId?: string
  originalPrice?: number
  discountApplied?: number
  finalPrice?: number
  paidFromBalanceOnly?: boolean
}

function getUserIdFromRawInitData(initData: string): number | null {
  if (!initData) {
    return null
  }
  const params = new URLSearchParams(initData)
  const userRaw = params.get('user')
  if (!userRaw) {
    return null
  }
  try {
    const parsed = JSON.parse(userRaw) as { id?: number }
    return parsed.id ? Number(parsed.id) : null
  } catch {
    return null
  }
}

function buildRedirectUrl(deepLink: string): string {
  // Opens via our /redirect page so Telegram opens it in an external browser,
  // which then passes the custom scheme (happ://) to the OS/app.
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  return `${base}/redirect?to=${encodeURIComponent(deepLink)}`
}

function openExternalUrl(url: string) {
  const tg = (window as TelegramWindow).Telegram?.WebApp

  if (url.startsWith('happ://')) {
    // Must go through an https redirect page so Telegram's openLink accepts it.
    const redirectUrl = buildRedirectUrl(url)
    if (tg?.openLink) {
      tg.openLink(redirectUrl)
    } else {
      window.open(redirectUrl, '_blank', 'noopener,noreferrer')
    }
    return
  }

  if (tg?.openLink) {
    tg.openLink(url)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

function getUserIdFromUrl(): number | null {
  if (typeof window === 'undefined') {
    return null
  }
  const rawUserId = new URLSearchParams(window.location.search).get('user_id')
  if (!rawUserId) {
    return null
  }
  const parsed = Number(rawUserId)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function formatDateUaLong(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  if (Number.isNaN(date.getTime())) {
    return typeof dateInput === 'string' ? dateInput : ''
  }
  const months = [
    'січня',
    'лютого',
    'березня',
    'квітня',
    'травня',
    'червня',
    'липня',
    'серпня',
    'вересня',
    'жовтня',
    'листопада',
    'грудня',
  ]
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()} року`
}

function buildPlans(priceByMonths: Record<number, number>, globalDiscountPercent: number): Plan[] {
  const oneMonthPrice = priceByMonths[1] ?? 99
  const safeDiscount = Math.max(0, Math.min(90, globalDiscountPercent))
  const toMoney = (v: number) => Number(v.toFixed(2))
  const discounted = (base: number) => toMoney(base * (1 - safeDiscount / 100))
  const perMonth = (total: number, months: number) => Math.max(1, Math.round(total / months))
  const calcSavePct = (total: number, months: number) => {
    if (months === 1 || oneMonthPrice <= 0) return null
    const pct = Math.round((1 - (total / months) / oneMonthPrice) * 100)
    return pct > 0 ? pct : 0
  }
  const p1 = discounted(oneMonthPrice)
  const p3 = discounted(priceByMonths[3] ?? 200)
  const p6 = discounted(priceByMonths[6] ?? 350)
  const p12 = discounted(priceByMonths[12] ?? 600)
  return [
    { id: '1m', label: '1 місяць', months: 1, originalPrice: oneMonthPrice, price: p1, perMonth: perMonth(p1, 1), savePct: null, best: false },
    { id: '3m', label: '3 місяці', months: 3, originalPrice: priceByMonths[3] ?? 200, price: p3, perMonth: perMonth(p3, 3), savePct: calcSavePct(p3, 3), best: false },
    { id: '6m', label: '6 місяців', months: 6, originalPrice: priceByMonths[6] ?? 350, price: p6, perMonth: perMonth(p6, 6), savePct: calcSavePct(p6, 6), best: true },
    { id: '12m', label: '12 місяців', months: 12, originalPrice: priceByMonths[12] ?? 600, price: p12, perMonth: perMonth(p12, 12), savePct: calcSavePct(p12, 12), best: false },
  ]
}

export function FlixVPNApp() {
  const MAX_ACTIVE_DEVICES = 5
  const [tab, setTab] = useState<Tab>('home')
  const [selectedPlan, setSelectedPlan] = useState<Plan['id']>('6m')
  const [activePlan, setActivePlan] = useState<Plan['id'] | null>(null)
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null)
  const [nextRecurringPaymentDate, setNextRecurringPaymentDate] = useState<string | null>(null)
  const [recurringEnabled, setRecurringEnabled] = useState(false)
  const [vpnAccessLink, setVpnAccessLink] = useState<string | null>(null)
  const [selectedOs, setSelectedOs] = useState<OsId>(OS_INSTALL_OPTIONS[0].id)
  const [applyReferralBalance, setApplyReferralBalance] = useState(true)
  const [referralCount, setReferralCount] = useState(0)
  const [referralBalance, setReferralBalance] = useState(0)
  const [firstName, setFirstName] = useState('')
  const [username, setUsername] = useState('')
  const [subscriptionsCount, setSubscriptionsCount] = useState(0)
  const [devicesCount, setDevicesCount] = useState(0)
  const [activeDevices, setActiveDevices] = useState<ActiveDevice[]>([])
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [telegramInitData, setTelegramInitData] = useState('')
  const [resolvedUserId, setResolvedUserId] = useState<number | null>(null)
  const [telegramUserId, setTelegramUserId] = useState<number | null>(null)
  const [globalDiscountPercent, setGlobalDiscountPercent] = useState(0)
  const [basePriceByMonths, setBasePriceByMonths] = useState<Record<number, number>>({
    1: 99,
    3: 200,
    6: 350,
    12: 600,
  })

  const safeUserId = telegramUserId ?? resolvedUserId ?? 0
  const botName = (process.env.NEXT_PUBLIC_BOT_USERNAME || 'flixvpnbot').replace('@', '')
  const supportUrl = process.env.NEXT_PUBLIC_SUPPORT_TG_URL || 'https://t.me/flixvpn_admin'

  const dynamicPlans = buildPlans(basePriceByMonths, globalDiscountPercent)
  const isSubscribed = activePlan !== null

  const handleSubscribe = async () => {
    if (!telegramInitData && !safeUserId) {
      return
    }
    const planData = dynamicPlans.find((plan) => plan.id === selectedPlan)
    if (!planData) {
      return
    }
    try {
      const paymentUrl = safeUserId
        ? `/api/user/payment/create?user_id=${safeUserId}`
        : '/api/user/payment/create'
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (telegramInitData) {
        headers['x-telegram-init-data'] = telegramInitData
      }
      const response = await fetch(paymentUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          months: planData.months,
          productName: 'Flix VPN',
          applyReferralBalance,
        }),
      })
      if (!response.ok) {
        try {
          const err = (await response.json()) as { error?: string }
          if (err.error) {
            window.alert(err.error)
          }
        } catch {
          // ignore parse errors
        }
        return
      }
      const payment = (await response.json()) as PaymentCreateResult
      if (payment.paymentUrl) {
        openExternalUrl(payment.paymentUrl)
      }
      const discountApplied = payment.discountApplied
      if (typeof discountApplied === 'number' && discountApplied > 0) {
        setReferralBalance((prev) => Math.max(0, prev - discountApplied))
      }

      // Activate subscription only if fully paid from referral balance (no MonoPay invoice)
      if (payment.paidFromBalanceOnly) {
        const endDate = addMonths(new Date(), planData.months)
        setActivePlan(planData.id)
        setSubscriptionEnd(formatDateUaLong(endDate))
        setTab('home')
      }
    } catch {
      // ignore network error in UI state
    }
  }

  const handleAddDevice = async () => {
    if (!isSubscribed || !safeUserId || activeDevices.length >= MAX_ACTIVE_DEVICES) {
      return
    }
    const selectedInstall = OS_INSTALL_OPTIONS.find((os) => os.id === selectedOs) ?? OS_INSTALL_OPTIONS[0]
    const apiUrl = `/api/user/devices?user_id=${safeUserId}`
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (telegramInitData) headers['x-telegram-init-data'] = telegramInitData
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ deviceName: selectedInstall.label }),
      })
      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as { error?: string }
        if (err.error) window.alert(err.error)
        return
      }
      const data = (await response.json()) as {
        activeDevices?: ActiveDevice[]
        devicesCount?: number
      }
      const nextDevices = Array.isArray(data.activeDevices) ? data.activeDevices : []
      setActiveDevices(nextDevices)
      setDevicesCount(Number(data.devicesCount ?? nextDevices.length ?? 0))
      setTab('subscriptions')
    } catch {
      // keep state on error
    }
  }

  const handleRemoveDevice = async (deviceId: number) => {
    if (!safeUserId) return
    const apiUrl = `/api/user/devices/${deviceId}?user_id=${safeUserId}`
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (telegramInitData) headers['x-telegram-init-data'] = telegramInitData
    try {
      const response = await fetch(apiUrl, { method: 'DELETE', headers })
      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as { error?: string }
        if (err.error) window.alert(err.error)
        return
      }
      const data = (await response.json()) as { activeDevices?: ActiveDevice[] }
      const nextDevices = Array.isArray(data.activeDevices) ? data.activeDevices : []
      setActiveDevices(nextDevices)
      setDevicesCount(nextDevices.length)
    } catch {
      // keep state on error
    }
  }

  const handleCancelRecurring = async () => {
    if (!safeUserId) {
      return
    }
    const apiUrl = `/api/user/subscription/recurring/cancel?user_id=${safeUserId}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (telegramInitData) {
      headers['x-telegram-init-data'] = telegramInitData
    }
    try {
      const confirmed = window.confirm(
        'Ви впевнені, що хочете скасувати підписку?\nАвтосписання буде вимкнено, а поточний оплачений період залишиться активним до кінця.',
      )
      if (!confirmed) {
        return
      }
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
      })
      if (!response.ok) {
        const err = (await response.json()) as { error?: string }
        if (err.error) {
          window.alert(err.error)
        }
        return
      }
      setRecurringEnabled(false)
      setNextRecurringPaymentDate(null)
      window.alert('Автосписання скасовано')
    } catch {
      // ignore network issues
    }
  }

  const handleGoToDevices = () => setTab('subscriptions')

  const handleShareReferral = async () => {
    if (!safeUserId) {
      return
    }
    const shareText = buildReferralShareText(botName, safeUserId)
    if (navigator.share) {
      await navigator.share({ text: shareText })
      return
    }
    await navigator.clipboard.writeText(shareText)
    window.alert('Реферальний текст скопійовано в буфер обміну')
  }

  const handleToggleNotifications = async (enabled: boolean) => {
    if (!telegramInitData) {
      return
    }
    const prev = notificationsEnabled
    setNotificationsEnabled(enabled)
    try {
      await fetch('/api/settings/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': telegramInitData,
        },
        body: JSON.stringify({ enabled }),
      })
    } catch {
      setNotificationsEnabled(prev)
    }
  }

  useEffect(() => {
    let isMounted = true
    const tgUserId = Number((window as TelegramWindow).Telegram?.WebApp?.initDataUnsafe?.user?.id ?? 0)
    if (tgUserId > 0) {
      setTelegramUserId(tgUserId)
    }
    const initData = (window as TelegramWindow).Telegram?.WebApp?.initData || ''
    setTelegramInitData(initData)
    const userIdFromInit = getUserIdFromRawInitData(initData)
    const userIdFromUrl = getUserIdFromUrl()
    const resolvedInitialUserId = userIdFromInit || userIdFromUrl
    if (resolvedInitialUserId) {
      setResolvedUserId(resolvedInitialUserId)
    }

    const loadSettings = async () => {
      const profileUrl = resolvedInitialUserId
        ? `/api/user/profile?user_id=${resolvedInitialUserId}`
        : '/api/user/profile'
      const headers: Record<string, string> = {}
      if (initData) {
        headers['x-telegram-init-data'] = initData
      }

      try {
        const response = await fetch(profileUrl, { headers })
        if (!response.ok) {
          return
        }
        const data = (await response.json()) as LoadedProfile
        if (!isMounted) {
          return
        }
        setNotificationsEnabled(Boolean(data.notificationsEnabled))
        setReferralCount(Number(data.referralCount || 0))
        setReferralBalance(Number(data.referralBalance || 0))
        setSubscriptionsCount(Number(data.subscriptionsCount || 0))
        setDevicesCount(Number(data.devicesCount || 0))
        setActiveDevices(Array.isArray(data.activeDevices)
          ? (data.activeDevices as ActiveDevice[])
          : [])
        setFirstName((data.firstName || '').toString())
        setUsername((data.username || '').toString())
        setResolvedUserId(Number(data.userId || resolvedInitialUserId || 0) || null)
        if (data.subscription?.active && data.subscription?.months) {
          const planId = `${data.subscription.months}m` as Plan['id']
          if (dynamicPlans.some((p) => p.id === planId)) {
            setActivePlan(planId)
            setSelectedPlan(planId)
          }
        } else {
          setActivePlan(null)
        }
        if (data.subscription?.endDate) {
          setSubscriptionEnd(formatDateUaLong(data.subscription.endDate))
        }
        if (data.pricing?.priceByMonths) {
          setBasePriceByMonths({
            1: Number(data.pricing.priceByMonths[1] || 99),
            3: Number(data.pricing.priceByMonths[3] || 200),
            6: Number(data.pricing.priceByMonths[6] || 350),
            12: Number(data.pricing.priceByMonths[12] || 600),
          })
        }
        setGlobalDiscountPercent(Number(data.pricing?.discountPercent || 0))
        const recurring = data.subscription?.recurring
        setRecurringEnabled(Boolean(recurring?.enabled))
        if (recurring?.nextPaymentDate) {
          setNextRecurringPaymentDate(formatDateUaLong(recurring.nextPaymentDate))
        } else {
          setNextRecurringPaymentDate(null)
        }

      } catch {
        // Keep defaults when request fails
      }
    }
    if (initData || resolvedInitialUserId) {
      loadSettings()
    }
    return () => {
      isMounted = false
    }
  }, [])

  const renderScreen = () => {
    switch (tab) {
      case 'home':
        return (
          <HomeScreen
            isSubscribed={isSubscribed}
            subscriptionEnd={subscriptionEnd}
            recurringEnabled={recurringEnabled}
            nextRecurringPaymentDate={nextRecurringPaymentDate}
            vpnAccessLink={vpnAccessLink}
            activeDevices={activeDevices}
            canAddDevice={activeDevices.length < MAX_ACTIVE_DEVICES}
            selectedOs={selectedOs}
            onSelectOs={setSelectedOs}
            onOpenTariffs={() => setTab('tariffs')}
            onGoToDevices={handleGoToDevices}
            onAddDevice={handleAddDevice}
          />
        )
      case 'tariffs':
        return (
          <TariffsScreen
            plans={dynamicPlans}
            selectedPlan={selectedPlan}
            activePlan={activePlan}
            referralBalance={referralBalance}
            applyReferralBalance={applyReferralBalance}
            globalDiscountPercent={globalDiscountPercent}
            onToggleReferralBalance={setApplyReferralBalance}
            onSelectPlan={setSelectedPlan}
            onSubscribe={handleSubscribe}
            isSubscribed={isSubscribed}
            subscriptionEnd={subscriptionEnd}
            recurringEnabled={recurringEnabled}
            nextRecurringPaymentDate={nextRecurringPaymentDate}
            onOpenProfile={() => setTab('profile')}
          />
        )
      case 'subscriptions':
        return (
          <SubscriptionsScreen
            isSubscribed={isSubscribed}
            activeDevices={activeDevices}
            canAddDevice={activeDevices.length < MAX_ACTIVE_DEVICES}
            onAddDevice={handleAddDevice}
            onRemoveDevice={handleRemoveDevice}
            onConnectDevice={openExternalUrl}
          />
        )
      case 'profile':
        return (
          <ProfileScreen
            botName={botName}
            userId={safeUserId || null}
            firstName={firstName}
            username={username}
            referralCount={referralCount}
            referralBalance={referralBalance}
            subscriptionsCount={subscriptionsCount}
            devicesCount={devicesCount}
            hasActiveSubscription={isSubscribed}
            subscriptionEndDate={subscriptionEnd}
            recurringEnabled={recurringEnabled}
            nextRecurringPaymentDate={nextRecurringPaymentDate}
            onCancelRecurring={handleCancelRecurring}
            onOpenTariffs={() => setTab('tariffs')}
            supportUrl={supportUrl}
            notificationsEnabled={notificationsEnabled}
            onToggleNotifications={handleToggleNotifications}
            onShareReferral={handleShareReferral}
          />
        )
    }
  }

  return (
    <div className="relative mx-auto flex min-h-dvh max-w-md flex-col">
      <div className="flex flex-1 flex-col overflow-y-auto px-4 pb-24">
        {renderScreen()}
      </div>
      <BottomNav active={tab} onChange={setTab} />
    </div>
  )
}
