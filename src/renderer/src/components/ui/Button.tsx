import type { ButtonHTMLAttributes } from 'react'

const VARIANTS = {
  primary:
    'bg-amber-500 font-semibold text-stone-950 hover:bg-amber-400 disabled:hover:bg-amber-500',
  secondary:
    'bg-stone-800 font-medium text-stone-200 hover:bg-stone-700 disabled:hover:bg-stone-800',
  danger: 'bg-red-700 font-medium text-white hover:bg-red-600 disabled:hover:bg-red-700',
} as const

export type ButtonVariant = keyof typeof VARIANTS

/** A button in one of the app's styles. It is `type="button"` unless told otherwise. */
export function Button({
  variant = 'secondary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      className={`rounded-md px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}
