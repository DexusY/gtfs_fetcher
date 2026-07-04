import { forwardRef } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'subtle'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-brand text-white border border-brand ' +
    'hover:bg-brandHover hover:border-brandHover ' +
    'shadow-[inset_0_1px_0_rgb(255_255_255/0.18)] hover:shadow-ring',
  secondary:
    'bg-surface text-fg border border-line ' +
    'hover:bg-hover hover:border-lineStrong',
  subtle:
    'bg-elevated text-fg border border-transparent ' +
    'hover:bg-hover',
  danger:
    'bg-danger text-white border border-danger ' +
    'hover:bg-danger/90',
  ghost:
    'bg-transparent text-fgMuted border border-transparent ' +
    'hover:bg-hover hover:text-fg',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-[12px] gap-1.5 rounded-md',
  md: 'h-9 px-4 text-[13px] gap-2 rounded-lg',
  lg: 'h-11 px-5 text-[14px] gap-2 rounded-lg',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, disabled, children, className = '', ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        'group relative inline-flex items-center justify-center select-none',
        'font-sans font-medium tracking-tightish',
        'transition-[background-color,border-color,box-shadow,transform] duration-150 cursor-pointer',
        'active:scale-[0.985]',
        'disabled:cursor-not-allowed disabled:opacity-45 disabled:pointer-events-none',
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(' ')}
      {...props}
    >
      {loading && (
        <svg
          aria-hidden="true"
          className="animate-spin shrink-0 w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  )
)

Button.displayName = 'Button'
export default Button
