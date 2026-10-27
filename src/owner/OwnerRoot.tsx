/**
 * APP DEL DUEÑO · Cáscara: sesión -> suscripción -> negocio -> pantallas.
 * Este archivo es el que se carga perezosamente desde App.tsx.
 */
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '../saas/auth'
import { LoginScreen } from '../saas/LoginScreen'
import { Logo } from '../saas/Logo'
import { PlanScreen } from '../saas/PlanScreen'
import { SubscribeScreen } from '../saas/SubscribeScreen'
import { SubscriptionProvider, useSubscription } from '../saas/subscription'
import { AppLayout, type NavItem } from '../saas/AppLayout'
import { ToastProvider } from '../saas/ui'
import { ShopProvider, useShop } from './shop'
import { Onboarding } from './Onboarding'
import { Home } from './Home'
import { Agenda } from './Agenda'
import { Reminders } from './Reminders'
import { Clients } from './Clients'
import { Settings } from './Settings'
import { usePendingReminders } from './reminders'

function Splash({ text }: { text?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo size={44} />
      <div
        className="size-6 animate-spin rounded-full border-2 border-line border-t-brand"
        role="status"
        aria-label="Cargando"
      />
      {text ? <p className="text-sm text-muted">{text}</p> : null}
    </div>
  )
}

export default function OwnerRoot() {
  return (
    <ToastProvider>
      <AuthProvider>
        <SubscriptionProvider>
          <Gate />
        </SubscriptionProvider>
      </AuthProvider>
    </ToastProvider>
  )
}

function Gate() {
  const { loading: authLoading, user } = useAuth()
  const { loading: subLoading, access } = useSubscription()

  if (authLoading) return <Splash />
  if (!user) return <LoginScreen />
  if (subLoading) return <Splash />
  // Nunca tuvo plan -> pantalla de prueba gratis. Con plan vencido sí entra
  // (en modo solo lectura) para no dejarlo sin ver su propia agenda.
  if (access.level === 'none') return <SubscribeScreen />

  return (
    <ShopProvider>
      <Shell />
    </ShopProvider>
  )
}

const ICONS = {
  home: '🏠',
  agenda: '🗓️',
  reminders: '💬',
  clients: '👥',
  settings: '⚙️',
}

function Shell() {
  const { loading, error, business } = useShop()
  const pending = usePendingReminders()

  if (loading) return <Splash text="Cargando tu agenda…" />
  if (error) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <Logo size={44} />
        <p className="text-sm text-danger">{error}</p>
        <button
          className="underline underline-offset-2"
          onClick={() => location.reload()}
          type="button"
        >
          Volver a intentar
        </button>
      </div>
    )
  }

  // Primera vez: onboarding de 4 pasos.
  if (!business) return <Onboarding />

  const items: NavItem[] = [
    { to: '/', label: 'Inicio', icon: ICONS.home, end: true },
    { to: '/agenda', label: 'Agenda', icon: ICONS.agenda },
    { to: '/recordatorios', label: 'Recordar', icon: ICONS.reminders, badge: pending.count },
    { to: '/clientes', label: 'Clientes', icon: ICONS.clients },
    { to: '/ajustes', label: 'Ajustes', icon: ICONS.settings },
  ]

  return (
    <AppLayout items={items}>
      <Routes>
        <Route index element={<Home />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="recordatorios" element={<Reminders onChange={pending.refresh} />} />
        <Route path="clientes" element={<Clients />} />
        <Route path="ajustes" element={<Settings />} />
        <Route path="plan" element={<PlanScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  )
}
