/** APP DEL DUEÑO · Link de reservas: copiar, compartir y QR para imprimir. */
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { bookingUrl } from '../../saas/config'
import { Button, Card, LinkButton, useToast } from '../../saas/ui'

export function ShareBooking({ slug, name }: { slug: string; name: string }) {
  const toast = useToast()
  const url = bookingUrl(slug)
  const [qr, setQr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: 'M' })
      .then((d) => alive && setQr(d))
      .catch(() => alive && setQr(null))
    return () => {
      alive = false
    }
  }, [url])

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url)
      toast('Copiamos tu link.')
    } catch {
      toast('No pudimos copiar. Seleccionalo a mano.', 'danger')
    }
  }

  async function compartir() {
    const texto = `Reservá tu turno en ${name}: ${url}`
    if (navigator.share) {
      try {
        await navigator.share({ title: name, text: texto, url })
        return
      } catch {
        /* el usuario canceló */
      }
    }
    await copiar()
  }

  return (
    <Card title="Tu página de reservas">
      <p className="break-all rounded-xl bg-surface-2 px-3 py-2.5 font-mono text-sm">{url}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => void copiar()}>
          Copiar
        </Button>
        <Button onClick={() => void compartir()}>Compartir</Button>
        <LinkButton href={url} target="_blank" rel="noopener">
          Abrir ↗
        </LinkButton>
      </div>

      {qr ? (
        <div className="mt-4 flex flex-col items-center gap-3">
          <img
            src={qr}
            alt={`Código QR de la página de reservas de ${name}`}
            className="size-44 rounded-xl border border-line bg-white p-2"
            width={176}
            height={176}
          />
          <div className="flex flex-wrap justify-center gap-2">
            <a
              href={qr}
              download={`qr-turnos-${slug}.png`}
              className="inline-flex items-center justify-center rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium no-underline hover:bg-surface-2"
            >
              Descargar QR
            </a>
            <Button onClick={() => imprimirQr(qr, name, url)}>Imprimir cartel</Button>
          </div>
          <p className="text-center text-xs text-muted">
            Pegá el QR en el mostrador o en la vidriera: tus clientes lo escanean y reservan solos.
          </p>
        </div>
      ) : null}
    </Card>
  )
}

/** Cartel A4 listo para imprimir, sin dependencias ni librerías de PDF. */
function imprimirQr(qr: string, name: string, url: string) {
  const w = window.open('', '_blank', 'width=800,height=1000')
  if (!w) return
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Reservá tu turno · ${esc(name)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: system-ui, sans-serif; text-align: center; color: #0b1736; }
  h1 { font-size: 34px; margin: 0 0 6px; }
  p.sub { font-size: 19px; color: #4a5a72; margin: 0 0 26px; }
  img { width: 340px; height: 340px; }
  p.url { font-size: 17px; margin-top: 22px; word-break: break-all; }
  p.foot { margin-top: 34px; font-size: 13px; color: #4a5a72; }
</style></head><body onload="window.print()">
  <h1>Reservá tu turno</h1>
  <p class="sub">${esc(name)}</p>
  <img src="${qr}" alt="QR">
  <p class="url">${esc(url)}</p>
  <p class="foot">Escaneá el código con la cámara del celular.</p>
</body></html>`)
  w.document.close()
}
