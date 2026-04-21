export function ShieldIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 28" fill="none">
      <path
        d="M13 1.5L2 6.5v8c0 7 4.9 13.2 11 15 6.1-1.8 11-8 11-15v-8L13 1.5z"
        fill="rgba(34,211,238,0.12)"
        stroke="#22d3ee"
        strokeWidth="1.2"
      />
      <path
        d="M9 14l3 3 5-5.5"
        stroke="#22d3ee"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
