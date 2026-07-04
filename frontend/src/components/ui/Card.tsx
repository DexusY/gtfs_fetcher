import { forwardRef } from 'react'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padded?: boolean
  hoverable?: boolean
  as?: 'div' | 'section' | 'article'
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ padded = true, hoverable = false, as: Tag = 'div', className = '', children, ...props }, ref) => (
    <Tag
      ref={ref as React.Ref<HTMLDivElement>}
      className={[
        'bg-surface border border-line rounded-xl shadow-card',
        padded ? 'p-5' : '',
        hoverable ? 'transition-shadow duration-200 hover:shadow-cardHover' : '',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </Tag>
  )
)
Card.displayName = 'Card'

interface CardHeaderProps {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  icon?: React.ReactNode
  className?: string
}

export function CardHeader({ title, description, action, icon, className = '' }: CardHeaderProps) {
  return (
    <div className={`flex items-start gap-3 ${className}`}>
      {icon && (
        <div className="shrink-0 h-9 w-9 rounded-lg bg-elevated border border-line flex items-center justify-center text-fgMuted">
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h2 className="font-display text-[15px] font-semibold tracking-tight2 text-fg leading-tight">
          {title}
        </h2>
        {description && (
          <p className="font-sans text-[12.5px] text-fgMuted leading-snug mt-1">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

interface StatCardProps {
  label: string
  value: React.ReactNode
  delta?: React.ReactNode
  icon?: React.ReactNode
  trend?: 'up' | 'down' | 'flat'
  className?: string
}

export function StatCard({ label, value, delta, icon, trend, className = '' }: StatCardProps) {
  return (
    <div className={`relative overflow-hidden rounded-xl border border-line bg-surface p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="eyebrow">{label}</span>
        {icon && <span className="text-fgSubtle">{icon}</span>}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[26px] font-semibold tracking-tight3 text-fg nums-tabular leading-none">
          {value}
        </span>
        {delta && (
          <span className={[
            'text-[11.5px] font-sans font-medium tracking-tightish',
            trend === 'up' ? 'text-success' :
            trend === 'down' ? 'text-danger' :
            'text-fgMuted',
          ].join(' ')}>
            {delta}
          </span>
        )}
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-12 -bottom-12 h-32 w-32 rounded-full bg-brand/[0.06] blur-2xl"
      />
    </div>
  )
}
