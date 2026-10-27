/**
 * SAAS · Cáscara de la app con login: barra arriba, navegación abajo en el
 * celular y al costado en la compu. Las apps nuevas le pasan sus propios
 * ítems de navegación.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from './auth'
import { config } from './config'
import { Logo } from './Logo'
import { InstallPrompt } from './pwa'
import { useSubscription } from './subscription'
import { useTheme } from './theme'
import { Banner, Button, cx } from './ui'

export type NavItem = {
  to: string
  label: string
  icon: ReactNode
  /** Número que se muestra en un globito (ej. recordatorios pendientes). */
  badge?: number
  end?: boolean
}

export function AppLayout({
  items,
  children,
  right,
}: {
  items: NavItem[]
  children: ReactNode
  right?: ReactNode
}) {
  const { user, signOut } = useAuth()
  const { access } = useSubscription()
  const { theme, toggle } = useTheme()
  const [menu, setMenu] = useState(false)

  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menu])

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-3 sm:px-4">
          <Logo size={26} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[15px] font-semibold leading-tight">
              {config.appName}
            </p>
            <p className="truncate text-[11px] leading-tight text-muted">{config.brand}</p>
          </div>
          {right}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </Button>
          <div className="relative">
            <Button
              variant="secondary"
              size="sm"
              aria-haspopup="menu"
              aria-expanded={menu}
              onClick={() => setMenu((v) => !v)}
            >
              Menú
            </Button>
            {menu ? (
              <>
                <div
                  className="fixed inset-0 z-30"
                  aria-hidden="true"
                  onClick={() => setMenu(false)}
                />
                <div
                  role="menu"
                  className="fl-card absolute right-0 top-full z-40 mt-2 w-60 overflow-hidden p-1"
                >
                  <NavLink
                    role="menuitem"
                    to="/plan"
                    onClick={() => setMenu(false)}
                    className="block rounded-lg px-3 py-2.5 text-sm no-underline hover:bg-surface-2"
                  >
                    Mi plan
                  </NavLink>
                  <a
                    role="menuitem"
                    href={config.helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setMenu(false)}
                    className="block rounded-lg px-3 py-2.5 text-sm no-underline hover:bg-surface-2"
                  >
                    Ayuda ↗
                  </a>
                  <button
                    role="menuitem"
                    onClick={() => void signOut()}
                    className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-danger hover:bg-surface-2"
                  >
                    Cerrar sesión
                  </button>
                  <p className="break-all px-3 pb-1 pt-2 text-[11px] text-muted">{user?.email}</p>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-3 sm:px-4">
        <InstallPrompt />
        {access.notice ? (
          <Banner tone={access.needsCard ? 'danger' : 'warn'} className="mt-3">
            <span className="min-w-0 flex-1">{access.notice}</span>
            <NavLink to="/plan" className="font-semibold underline underline-offset-2">
              Ver mi plan
            </NavLink>
          </Banner>
        ) : null}
      </div>

      <div className="mx-auto flex w-full max-w-6xl gap-4 px-3 pb-24 pt-3 sm:px-4 md:pb-6">
        {/* Navegación al costado en pantallas grandes */}
        <nav className="hidden w-48 shrink-0 md:block" aria-label="Secciones">
          <ul className="sticky top-20 space-y-1">
            {items.map((it) => (
              <li key={it.to}>
                <NavItemLink item={it} vertical />
              </li>
            ))}
          </ul>
        </nav>
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {/* Navegación abajo en el celular: el dueño la usa con una mano */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Secciones"
      >
        <ul className="mx-auto flex max-w-6xl">
          {items.map((it) => (
            <li key={it.to} className="min-w-0 flex-1">
              <NavItemLink item={it} />
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

function NavItemLink({ item, vertical }: { item: NavItem; vertical?: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cx(
          'relative no-underline transition-colors',
          vertical
            ? 'flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium'
            : 'flex flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-medium',
          isActive
            ? vertical
              ? 'bg-brand-soft text-brand'
              : 'text-brand'
            : 'text-muted hover:text-ink'
        )
      }
    >
      <span className="relative text-lg leading-none" aria-hidden="true">
        {item.icon}
        {item.badge ? (
          <span className="absolute -right-2 -top-1.5 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-4 text-white">
            {item.badge > 99 ? '99+' : item.badge}
          </span>
        ) : null}
      </span>
      <span className={vertical ? '' : 'truncate'}>{item.label}</span>
    </NavLink>
  )
}
