'use client'

import type { SVGProps } from 'react'

type Tab = 'home' | 'tariffs' | 'subscriptions' | 'profile'

interface Props {
  active: Tab
  onChange: (tab: Tab) => void
}

function IconHome(props: SVGProps<SVGSVGElement> & { active: boolean }) {
  const { active, ...rest } = props
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      <path
        d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
        strokeWidth={active ? 2.5 : 2}
      />
      <polyline points="9 22 9 12 15 12 15 22" strokeWidth={active ? 2.5 : 2} />
    </svg>
  )
}

function IconTariffs(props: SVGProps<SVGSVGElement> & { active: boolean }) {
  const { active, ...rest } = props
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      <rect x="3" y="4" width="18" height="16" rx="3" strokeWidth={active ? 2.5 : 2} />
      <path d="M7 9h10M7 13h10M7 17h6" strokeWidth={active ? 2.5 : 2} />
    </svg>
  )
}

function IconSubscriptions(props: SVGProps<SVGSVGElement> & { active: boolean }) {
  const { active, ...rest } = props
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      <rect x="2" y="5" width="20" height="14" rx="2" strokeWidth={active ? 2.5 : 2} />
      <path d="M2 10h20" strokeWidth={active ? 2.5 : 2} />
    </svg>
  )
}

function IconProfile(props: SVGProps<SVGSVGElement> & { active: boolean }) {
  const { active, ...rest } = props
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      <circle cx="12" cy="8" r="3.5" strokeWidth={active ? 2.5 : 2} />
      <path
        d="M5 20.5c0-3.9 3.1-7 7-7s7 3.1 7 7"
        strokeWidth={active ? 2.5 : 2}
      />
    </svg>
  )
}

const tabs = [
  { id: 'home' as const, label: 'Головна', Icon: IconHome },
  { id: 'tariffs' as const, label: 'Тарифи', Icon: IconTariffs },
  { id: 'subscriptions' as const, label: 'Пристрої', Icon: IconSubscriptions },
  { id: 'profile' as const, label: 'Профіль', Icon: IconProfile },
]

export function BottomNav({ active, onChange }: Props) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[100] px-3 pb-3"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div
        className="mx-auto flex max-w-md items-center justify-around rounded-[2rem] py-1.5 px-2 backdrop-blur-2xl"
        style={{
          background: 'rgba(5, 13, 28, 0.88)',
          border: '1px solid rgba(255,255,255,0.09)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.04) inset',
        }}
      >
        {tabs.map(({ id, label, Icon }) => {
          const isActive = active === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={`flex min-w-[64px] flex-col items-center gap-0.5 rounded-2xl py-1.5 transition-all duration-200 ${
                isActive ? 'text-cyan-400' : 'text-white/35 hover:text-white/60'
              }`}
              aria-label={label}
            >
              <span
                className="relative flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200"
                style={
                  isActive
                    ? {
                        background: 'rgba(34,211,238,0.15)',
                        boxShadow: '0 0 14px rgba(34,211,238,0.25)',
                      }
                    : {}
                }
              >
                <Icon className="h-5 w-5" active={isActive} />
              </span>
              <span className={`text-[11px] font-semibold leading-tight tracking-wide ${isActive ? 'text-cyan-400' : 'text-white/35'}`}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
