import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  active?: boolean
  children: ReactNode
  /** Shows the label next to the icon instead of only in the tooltip. */
  showLabel?: boolean
  variant?: 'ghost' | 'solid'
}

/** Rounded control used across the dock. Always carries an accessible label + tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, active, children, showLabel, variant = 'ghost', className = '', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={active}
      data-tip={showLabel ? undefined : label}
      className={`icon-btn icon-btn--${variant} ${active ? 'is-active' : ''} ${showLabel ? 'has-label' : ''} ${className}`}
      {...rest}
    >
      {children}
      {showLabel && <span className="icon-btn__label">{label}</span>}
    </button>
  )
})

export function ModuleLabel({ index, children }: { index: string; children: ReactNode }) {
  return (
    <div className="module-label">
      <span className="module-label__index">{index}</span>
      <span>{children}</span>
    </div>
  )
}
