/**
 * FUNCTIONS · Rate limit simple por IP para las rutas públicas.
 * Usa KV si está el binding RATE; si no, un contador en memoria del isolate
 * (alcanza para frenar lo obvio y no obliga a crear infraestructura).
 */
import type { Env } from './env'

type Bucket = { count: number; resetAt: number }
const memory = new Map<string, Bucket>()

export type RateResult = { ok: boolean; retryAfter: number }

/**
 * @param key           qué se limita (ej. `book:1.2.3.4`)
 * @param limit         cuántas veces se permite
 * @param windowSeconds en cuánto tiempo
 */
export async function rateLimit(
  env: Env,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateResult> {
  const now = Date.now()

  if (env.RATE) {
    const raw = await env.RATE.get(key)
    const b: Bucket = raw
      ? (JSON.parse(raw) as Bucket)
      : { count: 0, resetAt: now + windowSeconds * 1000 }
    if (b.resetAt < now) {
      b.count = 0
      b.resetAt = now + windowSeconds * 1000
    }
    b.count++
    // El TTL mínimo de KV es 60 s.
    await env.RATE.put(key, JSON.stringify(b), {
      expirationTtl: Math.max(60, Math.ceil((b.resetAt - now) / 1000)),
    })
    return { ok: b.count <= limit, retryAfter: Math.ceil((b.resetAt - now) / 1000) }
  }

  // Limpieza perezosa para que el Map no crezca para siempre.
  if (memory.size > 5000) {
    for (const [k, v] of memory) if (v.resetAt < now) memory.delete(k)
  }
  const b = memory.get(key)
  if (!b || b.resetAt < now) {
    memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 })
    return { ok: true, retryAfter: windowSeconds }
  }
  b.count++
  return { ok: b.count <= limit, retryAfter: Math.ceil((b.resetAt - now) / 1000) }
}

/** Respuesta 429 lista para devolver. */
export const tooMany = (retryAfter: number) =>
  new Response(
    JSON.stringify({ error: 'Demasiados intentos. Esperá un momento y probá de nuevo.' }),
    {
      status: 429,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'retry-after': String(retryAfter),
      },
    }
  )
