export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      {/* Outer ring */}
      <rect
        x="2.5"
        y="2.5"
        width="27"
        height="27"
        rx="8"
        stroke="currentColor"
        strokeWidth="1.6"
        className="text-fg/30"
      />
      {/* Bus / departure arrow inside */}
      <path
        d="M9 11.5 H21 M9 16 H17 M9 20.5 H21"
        stroke="rgb(var(--c-brand))"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Brand bullet */}
      <circle cx="23" cy="20.5" r="1.4" fill="rgb(var(--c-brand))" />
    </svg>
  )
}
