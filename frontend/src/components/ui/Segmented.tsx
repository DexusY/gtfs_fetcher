interface SegmentedProps<T extends string> {
  value: T
  onChange: (v: T) => void
  options: ReadonlyArray<{ value: T; label: React.ReactNode; icon?: React.ReactNode; disabled?: boolean }>
  size?: 'sm' | 'md'
  ariaLabel?: string
  fullWidth?: boolean
}

export default function Segmented<T extends string>({
  value, onChange, options, size = 'md', ariaLabel, fullWidth = false,
}: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={[
        'inline-flex items-center p-0.5 rounded-lg bg-elevated border border-line',
        fullWidth ? 'w-full' : '',
      ].join(' ')}
    >
      {options.map(opt => {
        const active = opt.value === value
        const disabled = !!opt.disabled
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-disabled={disabled || undefined}
            disabled={disabled}
            onClick={() => !disabled && onChange(opt.value)}
            className={[
              'inline-flex items-center justify-center gap-1.5 rounded-md font-sans font-medium tracking-tightish',
              'transition-[background-color,color,box-shadow] duration-150',
              size === 'sm' ? 'h-7 px-2.5 text-[11.5px]' : 'h-8 px-3 text-[12.5px]',
              fullWidth ? 'flex-1' : '',
              disabled
                ? 'cursor-not-allowed opacity-40 text-fgSubtle'
                : active
                  ? 'bg-surface text-fg shadow-card cursor-pointer'
                  : 'cursor-pointer text-fgMuted hover:text-fg',
            ].join(' ')}
          >
            {opt.icon}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
