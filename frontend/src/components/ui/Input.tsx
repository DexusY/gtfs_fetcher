import { forwardRef, useId } from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  leading?: React.ReactNode
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leading, className = '', id: idProp, ...props }, ref) => {
    const autoId = useId()
    const id      = idProp ?? autoId
    const errorId = `${id}-err`
    const hintId  = `${id}-hint`
    const describedBy =
      [error ? errorId : null, hint && !error ? hintId : null].filter(Boolean).join(' ') || undefined

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={id} className="block font-sans text-[12px] font-medium text-fgMuted tracking-tightish">
            {label}
          </label>
        )}
        <div className={[
          'flex items-center w-full h-10 rounded-lg',
          'bg-surface border border-line',
          'transition-[border-color,box-shadow] duration-150',
          'focus-within:border-brand focus-within:ring-brand-soft focus-within:shadow-ring',
          error ? 'border-danger focus-within:border-danger' : '',
        ].join(' ')}>
          {leading && (
            <span className="pl-3 pr-2 text-fgSubtle flex items-center" aria-hidden="true">
              {leading}
            </span>
          )}
          <input
            ref={ref}
            id={id}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            className={[
              'peer w-full h-full bg-transparent text-fg',
              leading ? 'pl-0' : 'pl-3',
              'pr-3 py-2',
              'font-sans text-[13.5px] tracking-tightish',
              'placeholder:text-fgSubtle placeholder:font-sans',
              'focus:outline-none',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              className,
            ].join(' ')}
            {...props}
          />
        </div>
        {hint && !error && (
          <p id={hintId} className="font-sans text-[11.5px] text-fgSubtle leading-relaxed">{hint}</p>
        )}
        {error && (
          <p id={errorId} role="alert" className="flex items-center gap-1.5 font-sans text-[11.5px] text-danger">
            <svg className="w-3 h-3 shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <circle cx="6" cy="6" r="5" />
              <path d="M6 3.5v3M6 8h0" strokeLinecap="round" />
            </svg>
            {error}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
export default Input
