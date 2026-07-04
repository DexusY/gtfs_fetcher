interface Props { className?: string }

export function Skeleton({ className = '' }: Props) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />
}

export function SkeletonRow() {
  return (
    <div className="flex items-center justify-between gap-4" aria-hidden="true">
      <div className="flex items-center gap-3 flex-1">
        <Skeleton className="h-8 w-8 rounded-full" />
        <div className="flex flex-col gap-1.5 flex-1">
          <Skeleton className="h-3 w-44" />
          <Skeleton className="h-2.5 w-24" />
        </div>
      </div>
      <Skeleton className="h-8 w-20 shrink-0" />
    </div>
  )
}
