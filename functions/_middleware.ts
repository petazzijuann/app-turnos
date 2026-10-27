/**
 * FUNCTIONS · Middleware global.
 * Cualquier excepción que se escape se convierte en un JSON prolijo: nunca
 * hay que mandarle un stack trace (ni el detalle de la base) al navegador.
 */
import type { Env } from './_lib/env'

export const onRequest: PagesFunction<Env> = async (ctx) => {
  try {
    return await ctx.next()
  } catch (e) {
    // Queda en los logs de Cloudflare (wrangler pages deployment tail).
    console.error('Error no manejado', new URL(ctx.request.url).pathname, e)
    return new Response(
      JSON.stringify({ error: 'Algo salió mal de nuestro lado. Probá de nuevo en un momento.' }),
      {
        status: 500,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      }
    )
  }
}
