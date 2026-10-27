/** FUNCTIONS · Respuestas JSON y errores con mensajes para el cliente. */

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

export const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { ...JSON_HEADERS, ...(init.headers ?? {}) },
  })

/** Respuesta de error con el texto que se le muestra a la persona. */
export const fail = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  json({ error, ...extra }, { status })

export const notFound = (error = 'No encontramos lo que buscabas.') => fail(404, error)

export const badRequest = (error: string) => fail(400, error)

/** Cachea respuestas públicas en el borde un ratito (datos poco cambiantes). */
export const cached = (data: unknown, seconds: number) =>
  json(data, {
    headers: { 'cache-control': `public, max-age=0, s-maxage=${seconds}` },
  })

export const clientIp = (req: Request) =>
  req.headers.get('cf-connecting-ip') ??
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
  'anon'

/** Lee el body JSON sin explotar si viene vacío o roto. */
export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T
  } catch {
    return null
  }
}

/** Caracteres de control: no aportan nada y ensucian mails y .ics. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g

/** Texto limpio y acotado (los datos vienen de un formulario público). */
export function clean(v: unknown, max = 200): string {
  if (typeof v !== 'string') return ''
  return v.replace(CONTROL_CHARS, '').trim().slice(0, max)
}
