/** SAAS · Primitivas de interfaz compartidas por todas las microapps. */
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

/* ------------------------------- Botón ------------------------------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand text-on-brand hover:bg-brand-strong border border-transparent font-semibold',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-2 font-medium',
  ghost: 'bg-transparent text-muted hover:text-ink hover:bg-surface-2 border border-transparent',
  danger: 'bg-transparent text-danger border border-line hover:bg-danger-soft font-medium',
}
const SIZES: Record<Size, string> = {
  sm: 'text-sm px-3 py-1.5 gap-1.5',
  md: 'text-sm px-4 py-2.5 gap-2',
  lg: 'text-base px-5 py-3 gap-2',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex items-center justify-center rounded-xl transition-colors',
        'disabled:opacity-50 disabled:pointer-events-none select-none',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
    />
  )
}

export function LinkButton({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; size?: Size }) {
  return (
    <a
      {...props}
      className={cx(
        'inline-flex items-center justify-center rounded-xl transition-colors no-underline',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
    />
  )
}

/* ------------------------------- Campos ------------------------------- */

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
  htmlFor?: string
}) {
  return (
    <div className="min-w-0">
      <label className="fl-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  )
}

export function TextInput({
  label,
  hint,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode }) {
  const id = useId()
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <input id={id} {...props} className={cx('fl-input', className)} />
    </Field>
  )
}

/** Input numérico tolerante: acepta coma decimal y campo vacío mientras escribís. */
export function NumberInput({
  label,
  hint,
  value,
  onValue,
  min = 0,
  suffix,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  label: string
  hint?: ReactNode
  value: number
  onValue: (n: number) => void
  min?: number
  suffix?: string
}) {
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (Number.isFinite(value) ? String(value) : '')
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <div className="relative">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          {...props}
          value={shown}
          onChange={(e) => {
            const raw = e.target.value.replace(',', '.')
            setDraft(e.target.value)
            const n = raw === '' ? NaN : Number(raw)
            if (Number.isFinite(n)) onValue(Math.max(min, n))
            else if (raw === '') onValue(min)
          }}
          onBlur={() => setDraft(null)}
          className={cx('fl-input', suffix && 'pr-12', className)}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">
            {suffix}
          </span>
        ) : null}
      </div>
    </Field>
  )
}

export function Select({
  label,
  hint,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: ReactNode }) {
  const id = useId()
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <select id={id} {...props} className={cx('fl-input appearance-none', className)}>
        {children}
      </select>
    </Field>
  )
}

/* ------------------------------- Tarjeta ------------------------------- */

export function Card({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cx('fl-card p-4 sm:p-5', className)}>
      {(title || actions) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
            ) : null}
            {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      )}
      {children}
    </section>
  )
}

/* -------------------------------- Modal -------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="fl-card relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-b-none p-5 sm:rounded-b-[var(--fl-radius)]"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Cerrar">
            ✕
          </Button>
        </div>
        <div className="text-sm text-ink">{children}</div>
        {footer ? <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  )
}

/* ------------------------------- Tooltip ------------------------------- */

/** Tooltip simple: funciona con click (táctil) y con foco de teclado. */
export function InfoTip({ text, label = 'Más información' }: { text: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <span className="relative inline-block align-middle">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className="ml-1 inline-flex size-[18px] items-center justify-center rounded-full border border-line text-[11px] font-bold text-muted hover:text-ink"
      >
        ?
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="fl-card absolute left-1/2 z-40 mt-2 w-60 -translate-x-1/2 p-3 text-xs font-normal leading-relaxed text-ink"
        >
          {text}
        </span>
      ) : null}
    </span>
  )
}

/* ------------------------------- Avisos ------------------------------- */

export function Banner({
  tone = 'info',
  children,
  className,
}: {
  tone?: 'info' | 'ok' | 'warn' | 'danger'
  children: ReactNode
  className?: string
}) {
  const tones = {
    info: 'bg-brand-soft text-ink border-brand/30',
    ok: 'bg-ok-soft text-ink border-ok/30',
    warn: 'bg-warn-soft text-ink border-warn/40',
    danger: 'bg-danger-soft text-ink border-danger/40',
  } as const
  return (
    <div
      className={cx(
        'flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm',
        tones[tone],
        className
      )}
    >
      {children}
    </div>
  )
}

/* ------------------------------- Toasts ------------------------------- */

type Toast = { id: number; text: string; tone: 'ok' | 'danger' }
const ToastCtx = createContext<(text: string, tone?: 'ok' | 'danger') => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const push = (text: string, tone: 'ok' | 'danger' = 'ok') => {
    const id = Date.now() + Math.random()
    setItems((v) => [...v, { id, text, tone }])
    setTimeout(() => setItems((v) => v.filter((t) => t.id !== id)), 4000)
  }
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div
        className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4"
        role="status"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={cx(
              'fl-card max-w-sm px-4 py-2.5 text-sm',
              t.tone === 'danger' ? 'border-danger/40 bg-danger-soft' : ''
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
