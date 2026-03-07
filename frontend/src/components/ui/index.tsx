import React from 'react'

// ── Badge ─────────────────────────────────────────────────────
type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'purple' | 'blue'
export function Badge({ children, variant = 'default' }: {
  children: React.ReactNode
  variant?: BadgeVariant
}) {
  const styles: Record<BadgeVariant, React.CSSProperties> = {
    default: { background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' },
    success: { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' },
    warning: { background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a' },
    error:   { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' },
    purple:  { background: '#faf5ff', color: '#7c3aed', border: '1px solid #e9d5ff' },
    blue:    { background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' },
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={styles[variant]}>
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
  const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
    primary:   { background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', color: '#ffffff', border: '1px solid #2563eb' },
    secondary: { background: '#ffffff', color: '#374151', border: '1px solid #d1d5db' },
    ghost:     { background: 'transparent', color: '#6b7280', border: '1px solid transparent' },
    danger:    { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' },
    success:   { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' },
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
      style={variantStyles[variant]}
      className={`inline-flex items-center justify-center font-medium transition-all duration-150
        ${sizeStyles[size]}
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:brightness-110 hover:shadow-sm'}
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
      className={`rounded-xl transition-all duration-150 ${className}`}
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        cursor: onClick ? 'pointer' : undefined,
      }}
      onMouseEnter={onClick ? e => {
        (e.currentTarget as HTMLElement).style.borderColor = '#93c5fd'
        ;(e.currentTarget as HTMLElement).style.background = '#f8faff'
      } : undefined}
      onMouseLeave={onClick ? e => {
        (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'
        ;(e.currentTarget as HTMLElement).style.background = '#ffffff'
      } : undefined}
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
      {label && <label className="text-xs font-medium" style={{ color: '#374151' }}>{label}</label>}
      <input
        {...props}
        className={`rounded-lg px-3 py-2 text-sm outline-none transition-all ${className}`}
        style={{
          background: '#f8fafc',
          border: `1px solid ${error ? '#fca5a5' : '#d1d5db'}`,
          color: '#0f172a',
        }}
        onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)' }}
        onBlur={e => { e.currentTarget.style.borderColor = error ? '#fca5a5' : '#d1d5db'; e.currentTarget.style.boxShadow = 'none' }}
      />
      {error && <span className="text-xs" style={{ color: '#f87070' }}>{error}</span>}
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
      {label && <label className="text-xs font-medium" style={{ color: '#374151' }}>{label}</label>}
      <select
        {...props}
        className={`rounded-lg px-3 py-2 text-sm outline-none transition-all ${className}`}
        style={{
          background: '#f8fafc',
          border: `1px solid ${error ? '#fca5a5' : '#d1d5db'}`,
          color: '#0f172a',
        }}
        onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)' }}
        onBlur={e => { e.currentTarget.style.borderColor = error ? '#fca5a5' : '#d1d5db'; e.currentTarget.style.boxShadow = 'none' }}
      >
        {children}
      </select>
      {error && <span className="text-xs" style={{ color: '#f87070' }}>{error}</span>}
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
      {label && <label className="text-xs font-medium" style={{ color: '#374151' }}>{label}</label>}
      <textarea
        {...props}
        className={`rounded-lg px-3 py-2 text-sm outline-none transition-all resize-none ${className}`}
        style={{
          background: '#f8fafc',
          border: `1px solid ${error ? '#fca5a5' : '#d1d5db'}`,
          color: '#0f172a',
        }}
        onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)' }}
        onBlur={e => { e.currentTarget.style.borderColor = error ? '#fca5a5' : '#d1d5db'; e.currentTarget.style.boxShadow = 'none' }}
      />
      {error && <span className="text-xs" style={{ color: '#f87070' }}>{error}</span>}
    </div>
  )
}

// ── Spinner ───────────────────────────────────────────────────
export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8' }[size]
  return (
    <svg className={`${s} animate-spin`} fill="none" viewBox="0 0 24 24" style={{ color: '#4f82f7' }}>
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
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${widths[size]} rounded-2xl shadow-2xl flex flex-col max-h-[90vh]`}
        style={{ background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 4px 20px rgba(0,0,0,0.08)' }}>
        {/* Modal header gradient stripe */}
        <div className="h-[2px] rounded-t-2xl" style={{ background: 'linear-gradient(90deg, #2563eb, #7c3aed)' }} />
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #e2e8f0' }}>
          <h2 className="text-base font-semibold" style={{ color: '#0f172a' }}>{title}</h2>
          <button onClick={onClose}
            className="p-1 rounded-md transition-colors"
            style={{ color: '#94a3b8' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#475569'; (e.currentTarget as HTMLElement).style.background = '#f1f5f9' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#94a3b8'; (e.currentTarget as HTMLElement).style.background = '' }}>
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
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#94a3b8' }}>
        <div className="w-7 h-7">{icon}</div>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium" style={{ color: '#475569' }}>{title}</p>
        {description && <p className="text-xs" style={{ color: '#94a3b8' }}>{description}</p>}
      </div>
      {action}
    </div>
  )
}
