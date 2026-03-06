import React from 'react'

// ── Badge ─────────────────────────────────────────────────────
type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'purple' | 'blue'
export function Badge({ children, variant = 'default' }: {
  children: React.ReactNode
  variant?: BadgeVariant
}) {
  const styles: Record<BadgeVariant, string> = {
    default: 'bg-[#252d3d] text-[#8b949e] border border-[#30363d]',
    success: 'bg-[#0f2d1a] text-[#3fb950] border border-[#1a4731]',
    warning: 'bg-[#2d2007] text-[#d29922] border border-[#3d2c0a]',
    error:   'bg-[#2d0f0f] text-[#f85149] border border-[#3d1515]',
    purple:  'bg-[#1f1035] text-[#bc8cff] border border-[#2e1f52]',
    blue:    'bg-[#0d1f35] text-[#58a6ff] border border-[#1a3050]',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[variant]}`}>
      {children}
    </span>
  )
}

// ── Button ────────────────────────────────────────────────────
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
type ButtonSize = 'sm' | 'md' | 'lg'
export function Button({ children, variant = 'secondary', size = 'md', onClick, disabled, className = '', type = 'button' }: {
  children: React.ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  onClick?: () => void
  disabled?: boolean
  className?: string
  type?: 'button' | 'submit' | 'reset'
}) {
  const variantStyles: Record<ButtonVariant, string> = {
    primary:   'bg-[#238636] hover:bg-[#2ea043] text-white border border-[#238636]',
    secondary: 'bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] border border-[#30363d]',
    ghost:     'bg-transparent hover:bg-[#1f2937] text-[#8b949e] hover:text-[#e6edf3] border border-transparent',
    danger:    'bg-[#2d0f0f] hover:bg-[#3d1515] text-[#f85149] border border-[#3d1515]',
    success:   'bg-[#0f2d1a] hover:bg-[#1a4731] text-[#3fb950] border border-[#1a4731]',
  }
  const sizeStyles: Record<ButtonSize, string> = {
    sm:  'px-3 py-1.5 text-xs rounded-md gap-1.5',
    md:  'px-4 py-2 text-sm rounded-md gap-2',
    lg:  'px-5 py-2.5 text-sm rounded-lg gap-2',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center font-medium transition-colors
        ${variantStyles[variant]} ${sizeStyles[size]}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${className}`}
    >
      {children}
    </button>
  )
}

// ── Card ──────────────────────────────────────────────────────
export function Card({ children, className = '', onClick }: {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-[#161b27] border border-[#30363d] rounded-lg
        ${onClick ? 'cursor-pointer hover:border-[#58a6ff] hover:bg-[#1c2333] transition-colors' : ''}
        ${className}`}
    >
      {children}
    </div>
  )
}

// ── Input ─────────────────────────────────────────────────────
export function Input({ label, error, className = '', ...props }: {
  label?: string
  error?: string
  className?: string
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-medium text-[#8b949e]">{label}</label>}
      <input
        {...props}
        className={`bg-[#0d1117] border border-[#30363d] text-[#e6edf3] rounded-md px-3 py-2
          text-sm placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] transition-colors
          ${error ? 'border-[#f85149]' : ''}
          ${props.disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${className}`}
      />
      {error && <span className="text-xs text-[#f85149]">{error}</span>}
    </div>
  )
}

// ── Select ────────────────────────────────────────────────────
export function Select({ label, error, children, className = '', ...props }: {
  label?: string
  error?: string
  className?: string
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-medium text-[#8b949e]">{label}</label>}
      <select
        {...props}
        className={`bg-[#0d1117] border border-[#30363d] text-[#e6edf3] rounded-md px-3 py-2
          text-sm focus:outline-none focus:border-[#58a6ff] transition-colors
          ${error ? 'border-[#f85149]' : ''}
          ${className}`}
      >
        {children}
      </select>
      {error && <span className="text-xs text-[#f85149]">{error}</span>}
    </div>
  )
}

// ── Textarea ──────────────────────────────────────────────────
export function Textarea({ label, error, className = '', ...props }: {
  label?: string
  error?: string
  className?: string
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-medium text-[#8b949e]">{label}</label>}
      <textarea
        {...props}
        className={`bg-[#0d1117] border border-[#30363d] text-[#e6edf3] rounded-md px-3 py-2
          text-sm placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] transition-colors resize-none
          ${error ? 'border-[#f85149]' : ''}
          ${className}`}
      />
      {error && <span className="text-xs text-[#f85149]">{error}</span>}
    </div>
  )
}

// ── Spinner ───────────────────────────────────────────────────
export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8' }[size]
  return (
    <svg className={`${s} animate-spin text-[#58a6ff]`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  )
}

// ── Modal ─────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, size = 'md' }: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  if (!open) return null
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${widths[size]} bg-[#161b27] border border-[#30363d]
        rounded-xl shadow-2xl flex flex-col max-h-[90vh]`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#30363d]">
          <h2 className="text-base font-semibold text-[#e6edf3]">{title}</h2>
          <button onClick={onClose}
            className="text-[#8b949e] hover:text-[#e6edf3] transition-colors p-1 rounded">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

// ── EmptyState ────────────────────────────────────────────────
export function EmptyState({ icon, title, description, action }: {
  icon: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
      <div className="text-[#484f58] w-12 h-12">{icon}</div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-[#8b949e]">{title}</p>
        {description && <p className="text-xs text-[#484f58]">{description}</p>}
      </div>
      {action}
    </div>
  )
}
