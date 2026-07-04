import { forwardRef, useId } from 'react'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
}

const chevronLight =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M3 4.5 L6 7.5 L9 4.5' stroke='%2371717A' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>\")"

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, children, className = '', id: idProp, ...props }, ref) => {
    const autoId = useId()
    const id = idProp ?? autoId

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={id} className="block font-sans text-[12px] font-medium text-fgMuted tracking-tightish">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={id}
            aria-invalid={error ? true : undefined}
            style={{
              backgroundImage: chevronLight,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              backgroundSize: '12px 12px',
            }}
            className={[
              'w-full h-10 appearance-none rounded-lg',
              'bg-surface border border-line text-fg',
              'pl-3 pr-9 py-2',
              'font-sans text-[13.5px] tracking-tightish',
              'focus:outline-none focus:border-brand focus:shadow-ring',
              'transition-[border-color,box-shadow] duration-150 cursor-pointer',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              error ? 'border-danger focus:border-danger' : '',
              className,
            ].join(' ')}
            {...props}
          >
            {children}
          </select>
        </div>
        {error && (
          <p role="alert" className="font-sans text-[11.5px] text-danger">{error}</p>
        )}
      </div>
    )
  }
)

Select.displayName = 'Select'
export default Select
