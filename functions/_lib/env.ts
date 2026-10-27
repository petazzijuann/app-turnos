/** FUNCTIONS · Variables de entorno (ver README para cargarlas en Pages). */
export type Env = {
  /** URL del proyecto Supabase (sin barra final). */
  SUPABASE_URL: string
  /** Clave secreta (sb_secret_… o service_role). SOLO del lado del servidor. */
  SUPABASE_SERVICE_ROLE_KEY: string
  /** Secreto de Cloudflare Turnstile. */
  TURNSTILE_SECRET?: string
  /** Secreto de firma del webhook de Lemon Squeezy. */
  LEMON_WEBHOOK_SECRET?: string
  /**
   * OPCIONAL. API key de Lemon Squeezy. Si está, los eventos de pago
   * refrescan la suscripción desde la API en lugar de ignorarse.
   * Sin esto el estado igual llega por `subscription_updated`.
   */
  LEMON_API_KEY?: string
  /** API key de Resend (mails de confirmación al cliente). */
  RESEND_API_KEY?: string
  /** Remitente de los mails. */
  MAIL_FROM?: string
  /** Origen público de la app, para armar links en los mails. */
  APP_ORIGIN?: string
  /** KV opcional para el rate limit de las rutas públicas. */
  RATE?: KVNamespace
}

/** La app a la que pertenece esta instalación (columna subscriptions.app). */
export const APP = 'turnos'

export const appOrigin = (env: Env, req: Request) =>
  env.APP_ORIGIN?.replace(/\/$/, '') || new URL(req.url).origin
