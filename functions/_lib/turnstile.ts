/** FUNCTIONS · Verificación de Cloudflare Turnstile. */
import type { Env } from './env'

export async function verifyTurnstile(
  env: Env,
  token: string,
  ip: string
): Promise<{ ok: boolean; reason?: string }> {
  // Sin secreto configurado no se valida (cómodo en local). En producción
  // cargá TURNSTILE_SECRET y la validación pasa a ser obligatoria.
  if (!env.TURNSTILE_SECRET) return { ok: true, reason: 'sin-secreto' }
  if (!token) return { ok: false, reason: 'sin-token' }

  try {
    const body = new FormData()
    body.append('secret', env.TURNSTILE_SECRET)
    body.append('response', token)
    body.append('remoteip', ip)
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    })
    const data = (await r.json()) as { success?: boolean; 'error-codes'?: string[] }
    return { ok: !!data.success, reason: data['error-codes']?.join(',') }
  } catch {
    return { ok: false, reason: 'error-de-red' }
  }
}
