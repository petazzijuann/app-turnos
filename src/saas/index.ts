/**
 * SAAS · Punto de entrada de la plantilla reutilizable.
 * Todo lo que una app de suscripción nueva necesita sale de acá:
 *   auth + suscripción + layout + PWA + primitivas de interfaz.
 * Ver README ("Reutilizar src/saas/ en la próxima app").
 */
export { config, bookingUrl, manageUrl, type AppConfig } from './config'
export { supabase } from './supabase'
export { AuthProvider, useAuth, authMessage } from './auth'
export { LoginScreen } from './LoginScreen'
export { SubscriptionProvider, useSubscription } from './subscription'
export { SubscribeScreen } from './SubscribeScreen'
export { PlanScreen } from './PlanScreen'
export { AppLayout, type NavItem } from './AppLayout'
export { InstallPrompt, isIOS, isStandalone } from './pwa'
export { useTheme } from './theme'
export { Logo } from './Logo'
export * from './ui'
export { key, readJSON, writeJSON, remove, useStored, requestPersistentStorage } from './storage'
export { accessFor, acceptsBookings, daysUntil, type Access, type AccessLevel } from '../shared/access'
