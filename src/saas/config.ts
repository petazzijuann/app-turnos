/**
 * SAAS · Panel de control de la microapp de suscripción.
 * ---------------------------------------------------------------------------
 * Para arrancar una app de suscripción nueva con esta plantilla alcanza con:
 *   1. copiar `src/saas/` tal cual,
 *   2. cambiar los valores de este archivo,
 *   3. escribir la app en su propia carpeta (acá: `src/owner/`).
 * Lo que empieza con VITE_ se puede sobreescribir por variable de entorno.
 */

const env = import.meta.env

export const config = {
  /** Identificador del producto. Es el valor de `subscriptions.app`. */
  app: 'turnos',
  /** Nombre comercial. */
  appName: 'Turnos',
  /** Marca paraguas. */
  brand: 'Futurislabs',
  tagline: 'Tu agenda online. Tus clientes reservan solos; tú recordás por WhatsApp.',

  /** Dominio público de la app (se usa para armar links de reservas y QR). */
  origin:
    typeof location !== 'undefined' && location.hostname !== 'localhost'
      ? location.origin
      : (env.VITE_APP_ORIGIN as string | undefined) ?? 'https://turnos.futurislabs.net',

  /** Checkout de Lemon Squeezy (producto con 14 días de prueba). */
  checkoutUrl: (env.VITE_LS_CHECKOUT_URL as string | undefined) ?? '',
  price: 'US$ 15/mes',
  trialDays: 14,

  supabase: {
    url: (env.VITE_SUPABASE_URL as string | undefined) ?? '',
    anonKey: (env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '',
  },

  turnstileSiteKey: (env.VITE_TURNSTILE_SITE_KEY as string | undefined) ?? '',

  /** Soporte y ayuda. */
  supportEmail: 'hola@futurislabs.net',
  landingUrl: 'https://futurislabs.net/turnos',
  helpUrl: 'https://futurislabs.net/turnos/guia/',
  siteUrl: 'https://futurislabs.net',

  /** Prefijo de las claves de localStorage. Cambialo por app. */
  storagePrefix: 'fl.turnos',
} as const

export type AppConfig = typeof config

/** Link público de reservas de un negocio. */
export const bookingUrl = (slug: string) => `${config.origin}/r/${slug}`
/** Link de gestión que recibe el cliente. */
export const manageUrl = (token: string) => `${config.origin}/c/${token}`
