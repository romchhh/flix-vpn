'use client'

import { useState, type ReactNode } from 'react'
import { FAQ_ITEMS } from '../lib/faq'
import { generateReferralLink } from '../lib/referrals'
import styles from './ProfileScreen.module.css'

interface ProfileScreenProps {
  botName: string
  userId: number | null
  firstName: string
  username: string
  referralCount: number
  referralBalance: number
  subscriptionsCount: number
  devicesCount: number
  hasActiveSubscription: boolean
  subscriptionEndDate: string | null
  recurringEnabled: boolean
  nextRecurringPaymentDate: string | null
  onCancelRecurring: () => Promise<void> | void
  onOpenTariffs: () => void
  supportUrl: string
  notificationsEnabled: boolean
  onToggleNotifications: (enabled: boolean) => Promise<void> | void
  onShareReferral: () => void
}

interface StatCardProps {
  label: string
  value: string
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <div className={styles.statCard}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  )
}

interface SettingRowProps {
  label: string
  hint?: string
  icon: ReactNode
  onClick?: () => void
  danger?: boolean
  rightEl?: ReactNode
}

function SettingRow({ label, hint, icon, onClick, danger, rightEl }: SettingRowProps) {
  return (
    <button
      type="button"
      className={`${styles.settingRow} ${danger ? styles.danger : ''}`}
      onClick={onClick}
    >
      <div className={styles.settingIcon}>
        {icon}
      </div>
      <div className={styles.settingText}>
        <span className={styles.settingLabel}>{label}</span>
        {hint && <span className={styles.settingHint}>{hint}</span>}
      </div>
      {rightEl ?? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M5 3l4 4-4 4" stroke={danger ? '#f87171' : '#475569'} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}

export function ProfileScreen({
  botName,
  userId,
  firstName,
  username,
  referralCount,
  referralBalance,
  subscriptionsCount,
  devicesCount,
  hasActiveSubscription,
  subscriptionEndDate,
  recurringEnabled,
  nextRecurringPaymentDate,
  onCancelRecurring,
  onOpenTariffs,
  supportUrl,
  notificationsEnabled,
  onToggleNotifications,
  onShareReferral,
}: ProfileScreenProps) {
  const [showFaq, setShowFaq] = useState(false)
  const referralLink = userId ? generateReferralLink(botName, userId) : ''

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <div className={styles.avatar}>
          <span className={styles.avatarInitials}>FV</span>
        </div>
        <div className={styles.userInfo}>
          <h1 className={styles.userName}>{firstName || 'Flix VPN User'}</h1>
          <p className={styles.userTag}>{username ? `@${username}` : `ID: ${userId ?? '—'}`}</p>
        </div>
      </div>

      <div className={styles.statsGrid}>
        <StatCard label="Підписок" value={`${subscriptionsCount}`} />
        <StatCard label="Пристроїв" value={`${devicesCount}`} />
        <StatCard label="Рефералів" value={`${referralCount}`} />
        <StatCard label="Баланс" value={`${referralBalance.toFixed(2)} ₴`} />
      </div>

      {hasActiveSubscription && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Поточний план</h2>
          <div className={styles.planBanner}>
            <div className={styles.planBannerLeft}>
              <div className={styles.planBannerDot} />
              <div>
                <span className={styles.planBannerName}>FlixVPN · Активний план</span>
                <span className={styles.planBannerExp}>
                  {subscriptionEndDate ? `Підписка активна до ${subscriptionEndDate}` : 'Підписка активна'}
                </span>
              </div>
            </div>
            <button type="button" className={styles.renewBtn} onClick={onOpenTariffs}>
              Продовжити
            </button>
          </div>
        </div>
      )}
      {hasActiveSubscription && recurringEnabled && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Керування підпискою</h2>
          <div className={styles.referralCard}>
            <p className="text-[15px] font-semibold text-white">Повторювана підписка активна</p>
            <p className="mt-1 text-[14px] text-white/60">
              Наступний платіж: {nextRecurringPaymentDate ?? '—'}
            </p>
            <button
              type="button"
              onClick={onCancelRecurring}
              className={styles.cancelSubscriptionBtn}
            >
              Скасувати підписку
            </button>
          </div>
        </div>
      )}

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Реферальна програма</h2>
        <div className={styles.referralCard}>
          <div className={styles.referralTop}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="18" cy="5" r="3" stroke="#22d3ee" strokeWidth="1.5" />
              <circle cx="6" cy="12" r="3" stroke="#22d3ee" strokeWidth="1.5" />
              <circle cx="18" cy="19" r="3" stroke="#22d3ee" strokeWidth="1.5" />
              <path d="M8.59 13.51l6.83 3.98M15.41 6.51L8.59 10.49" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <div>
              <p className={styles.referralTitle}>Ваше реферальне посилання</p>
              <p className={styles.referralSub}>10% від кожної оплати запрошеного користувача</p>
            </div>
          </div>
          <div className={styles.referralCodeRow}>
            <span className={styles.referralCode}>FLIX-{userId ?? '—'}</span>
            <button
              type="button"
              className={styles.copyBtn}
              onClick={() => referralLink && navigator.clipboard.writeText(referralLink)}
            >
              Копіювати
            </button>
          </div>
          <button
            type="button"
            onClick={onShareReferral}
            className="mt-3 w-full rounded-xl px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110"
            style={{
              background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
              boxShadow: '0 4px 16px rgba(34,211,238,0.18)',
            }}
          >
            Поділитися
          </button>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Налаштування</h2>
        <div className={styles.settingsGroup}>
          <SettingRow
            label="Сповіщення"
            hint={notificationsEnabled ? 'Увімкнено' : 'Вимкнено'}
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 3a7 7 0 00-7 7v3l-1.5 3h17L19 13v-3a7 7 0 00-7-7z" stroke="#22d3ee" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M9.5 19.5a2.5 2.5 0 005 0" stroke="#22d3ee" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            }
            rightEl={
              <div
                className={`${styles.toggle} ${notificationsEnabled ? styles.toggleOn : ''}`}
                onClick={async (e) => {
                  e.stopPropagation()
                  await onToggleNotifications(!notificationsEnabled)
                }}
              >
                <div className={styles.toggleThumb} />
              </div>
            }
          />
          <SettingRow
            label="Підтримка"
            hint="@flixvpn_admin"
            onClick={() => window.open(supportUrl, '_blank', 'noopener,noreferrer')}
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="#22d3ee" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
            }
          />
          <SettingRow
            label="FAQ"
            hint="Відповіді на питання"
            onClick={() => setShowFaq((prev) => !prev)}
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="#22d3ee" strokeWidth="1.6" />
                <path d="M12 17v.5" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" />
                <path d="M9.5 9.5a2.5 2.5 0 014.8.8c0 1.5-1.5 2.2-2.3 3" stroke="#22d3ee" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            }
          />
        </div>
      </div>

      {showFaq && (
        <div className={styles.section}>
          <div className={styles.referralCard}>
            <h2 className={styles.sectionTitle}>FAQ</h2>
            <div className="space-y-3">
              {FAQ_ITEMS.map((item) => (
                <div key={item.question}>
                  <p className="text-[15px] font-semibold text-white">{item.question}</p>
                  <p className="mt-1 text-[14px] leading-relaxed text-white/65">{item.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className={styles.spacer} />
    </div>
  )
}
