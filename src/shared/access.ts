/**
 * COMPARTIDO · De estado de suscripción a permisos reales.
 * Función pura: la usa el front (para decidir qué pantalla mostrar) y las
 * Pages Functions (para decidir si la página pública toma reservas).
 */

export type SubscriptionRow = {
  status: string | null
  trial_ends_at?: string | null
  renews_at?: string | null
  ends_at?: string | null
  update_payment_url?: string | null
  customer_portal_url?: string | null
} | null

/**
 * full     = puede usar todo y su página pública toma reservas.
 * readonly = entra y ve sus datos, pero no puede crear ni editar.
 * none     = nunca tuvo plan: pantalla de "activa tu prueba".
 */
export type AccessLevel = 'full' | 'readonly' | 'none'

export type Access = {
  level: AccessLevel
  status: string
  /** true si la página /r/:slug acepta reservas. */
  accepting: boolean
  /** Aviso no bloqueante para mostrar arriba de la app. */
  notice: string | null
  /** Días de prueba que quedan (null si no está en prueba). */
  trialDaysLeft: number | null
  /** true si hay que pedirle que actualice la tarjeta. */
  needsCard: boolean
}

const DAY = 86_400_000

const at = (v?: string | null) => (v ? new Date(v).getTime() : null)

/** Días enteros que faltan (redondeando para arriba, mínimo 0). */
export function daysUntil(when?: string | null, now: Date | number = Date.now()): number | null {
  const t = at(when)
  if (t == null || Number.isNaN(t)) return null
  const ms = t - (now instanceof Date ? now.getTime() : now)
  return Math.max(0, Math.ceil(ms / DAY))
}

export function accessFor(sub: SubscriptionRow, now: Date | number = Date.now()): Access {
  const ms = now instanceof Date ? now.getTime() : now
  const status = sub?.status ?? 'none'

  const base: Access = {
    level: 'none',
    status,
    accepting: false,
    notice: null,
    trialDaysLeft: null,
    needsCard: false,
  }

  if (!sub || status === 'none') return base

  switch (status) {
    case 'on_trial': {
      const left = daysUntil(sub.trial_ends_at, ms)
      // Si la fecha de fin de prueba ya pasó pero Lemon todavía no avisó,
      // no le cortamos el acceso: el webhook llega en minutos.
      return {
        ...base,
        level: 'full',
        accepting: true,
        trialDaysLeft: left,
        notice:
          left != null && left <= 3
            ? left === 0
              ? 'Tu prueba gratis termina hoy. Después se cobra automáticamente.'
              : `Te quedan ${left} día${left === 1 ? '' : 's'} de prueba gratis.`
            : null,
      }
    }

    case 'active':
      return { ...base, level: 'full', accepting: true }

    case 'past_due':
      return {
        ...base,
        level: 'full',
        accepting: true,
        needsCard: true,
        notice: 'No pudimos cobrar tu plan. Actualiza tu tarjeta para no perder el servicio.',
      }

    case 'cancelled': {
      const ends = at(sub.ends_at)
      const vigente = ends == null || ends > ms
      if (vigente) {
        const left = daysUntil(sub.ends_at, ms)
        return {
          ...base,
          level: 'full',
          accepting: true,
          notice:
            left != null
              ? `Cancelaste tu plan: podés seguir usando Turnos ${left} día${left === 1 ? '' : 's'} más.`
              : 'Cancelaste tu plan. Vas a poder usar Turnos hasta el fin del período pago.',
        }
      }
      return {
        ...base,
        level: 'readonly',
        notice: 'Tu plan terminó. Reactivalo para volver a tomar reservas online.',
      }
    }

    case 'expired':
    case 'unpaid':
    case 'paused':
      return {
        ...base,
        level: 'readonly',
        notice:
          status === 'paused'
            ? 'Tu plan está pausado. Reactivalo para volver a tomar reservas online.'
            : 'Tu plan no está activo. Reactivalo para volver a tomar reservas online.',
      }

    default:
      // Estado desconocido de Lemon: no bloqueamos de golpe, dejamos leer.
      return { ...base, level: 'readonly', notice: 'No pudimos confirmar el estado de tu plan.' }
  }
}

/** Atajo para las Functions: ¿esta suscripción habilita reservas online? */
export const acceptsBookings = (sub: SubscriptionRow, now?: Date | number) =>
  accessFor(sub, now).accepting
