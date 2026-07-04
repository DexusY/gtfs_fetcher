type Variant = 'ready' | 'warming' | 'idle' | 'info' | 'error' | 'neutral'

const styles: Record<Variant, { wrap: string; dot: string; defaultLabel: string }> = {
  ready:   { wrap: 'bg-successSoft text-successText border-success/30', dot: 'bg-success', defaultLabel: 'Ready' },
  warming: { wrap: 'bg-warningSoft text-warningText border-warning/30', dot: 'bg-warning', defaultLabel: 'Warming' },
  idle:    { wrap: 'bg-elevated text-fgSubtle border-line',             dot: 'bg-fgSubtle', defaultLabel: 'Idle' },
  info:    { wrap: 'bg-infoSoft text-infoText border-info/30',          dot: 'bg-info',     defaultLabel: 'Info' },
  error:   { wrap: 'bg-dangerSoft text-dangerText border-danger/30',    dot: 'bg-danger',   defaultLabel: 'Error' },
  neutral: { wrap: 'bg-elevated text-fgMuted border-line',              dot: 'bg-fgMuted',  defaultLabel: '—' },
}

interface BadgeProps {
  variant: Variant
  label?: string
  pulse?: boolean
  size?: 'sm' | 'md'
}

export default function Badge({ variant, label, pulse = false, size = 'md' }: BadgeProps) {
  const { wrap, dot, defaultLabel } = styles[variant]
  const sz = size === 'sm' ? 'px-2 h-5 text-[10px] gap-1.5' : 'px-2.5 h-6 text-[11px] gap-2'
  return (
    <span className={`inline-flex items-center rounded-full border font-sans font-medium tracking-tightish ${sz} ${wrap}`}>
      <span className="relative inline-flex items-center justify-center" aria-hidden="true">
        {pulse && (
          <span className={`absolute h-2 w-2 rounded-full ${dot} opacity-50 animate-ping`} />
        )}
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      </span>
      {label ?? defaultLabel}
    </span>
  )
}
