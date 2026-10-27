/** FUNCTIONS · Mails con Resend (solo la confirmación al cliente). */
import type { Env } from './env'

export type Attachment = { filename: string; content: string; contentType?: string }

export async function sendMail(
  env: Env,
  mail: {
    to: string
    subject: string
    html: string
    text?: string
    replyTo?: string
    attachments?: Attachment[]
  }
): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM || 'Futurislabs <hola@futurislabs.net>',
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        reply_to: mail.replyTo,
        attachments: mail.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          content_type: a.contentType,
        })),
      }),
    })
    return res.ok
  } catch {
    // El mail es un extra: si falla, la reserva ya quedó hecha.
    return false
  }
}

/** base64 de un texto UTF-8 (para adjuntar el .ics). */
export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** Mail de confirmación, con el look sobrio de la marca. */
export function confirmationEmail(p: {
  businessName: string
  clientName: string
  service: string
  staff: string
  whenLong: string
  time: string
  address?: string | null
  manageUrl: string
  welcome?: string | null
}): { subject: string; html: string; text: string } {
  const e = escapeHtml
  const subject = `Turno confirmado en ${p.businessName} · ${p.whenLong} ${p.time}`
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f6f8fb;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0b1736">
  <div style="max-width:520px;margin:0 auto;padding:24px 16px">
    <div style="background:#fff;border:1px solid #dde4ee;border-radius:18px;padding:24px">
      <p style="margin:0 0 4px;font-size:13px;color:#4a5a72">Turno confirmado</p>
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25">${e(p.businessName)}</h1>
      <p style="margin:0 0 2px;font-size:15px;text-transform:capitalize">${e(p.whenLong)}</p>
      <p style="margin:0 0 14px;font-size:30px;font-weight:700;line-height:1.1">${e(p.time)}</p>
      <p style="margin:0 0 4px;font-size:15px">${e(p.service)} · con ${e(p.staff)}</p>
      ${p.address ? `<p style="margin:0 0 4px;font-size:14px;color:#4a5a72">📍 ${e(p.address)}</p>` : ''}
      ${p.welcome ? `<p style="margin:14px 0 0;font-size:14px;color:#4a5a72">${e(p.welcome)}</p>` : ''}
      <p style="margin:22px 0 0">
        <a href="${e(p.manageUrl)}" style="display:inline-block;background:#0b5ed7;color:#fff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:12px">Ver o cancelar mi turno</a>
      </p>
      <p style="margin:16px 0 0;font-size:13px;color:#4a5a72">
        Adjuntamos el turno para que lo agregues a tu calendario. Si no vas a poder venir,
        avisá desde el botón de arriba.
      </p>
    </div>
    <p style="margin:14px 0 0;text-align:center;font-size:12px;color:#4a5a72">
      Agenda online con Turnos de Futurislabs
    </p>
  </div>
</body></html>`
  const text = `Turno confirmado en ${p.businessName}
${p.whenLong} ${p.time}
${p.service} con ${p.staff}
${p.address ? p.address + '\n' : ''}Ver o cancelar: ${p.manageUrl}`
  return { subject, html, text }
}
