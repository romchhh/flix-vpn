'use client'

const s = { stroke: '#22d3ee', strokeWidth: 1.2 }

export function IosIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <rect x="4" y="1" width="8" height="14" rx="2" {...s} />
      <circle cx="8" cy="12.5" r=".8" fill="#22d3ee" />
    </svg>
  )
}

export function AndroidIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="14" height="14" rx="2" {...s} />
      <path d="M1 7h14M7 1v14" {...s} />
    </svg>
  )
}

export function MacosIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M8 2a5 5 0 100 10A5 5 0 008 2z" {...s} />
      <path d="M8 2v10M3 7h10" stroke="#22d3ee" strokeWidth="1" />
    </svg>
  )
}

export function WindowsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="9" rx="1.5" {...s} />
      <path d="M5 12l-1 2M11 12l1 2M4 14h8" stroke="#22d3ee" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}

export function AppleTvIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="3" width="14" height="10" rx="2" {...s} />
      <circle cx="8" cy="8" r="2.5" stroke="#22d3ee" strokeWidth="1" />
    </svg>
  )
}

export function AndroidTvIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="3" width="14" height="10" rx="2" {...s} />
      <path d="M5 8h6M8 5v6" stroke="#22d3ee" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}
