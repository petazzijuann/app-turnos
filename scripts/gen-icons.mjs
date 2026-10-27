/**
 * Genera los íconos de la PWA a partir del logo de Futurislabs.
 * Sin dependencias: decodifica y escribe PNG con zlib.
 *
 * Fuente:  src/assets/brand/futurislabs-icon.png
 * Salidas: public/icons/*.png, public/apple-touch-icon.png,
 *          public/favicon-32.png, public/brand/futurislabs-icon-128.png
 *
 * Uso: node scripts/gen-icons.mjs
 */
import { deflateSync, inflateSync } from 'node:zlib'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

/** Navy del logo (--fl-ink): fondo de los íconos en ambos temas. */
const BG = [11, 23, 54]
const SOURCE = 'src/assets/brand/futurislabs-icon.png'

/* ------------------------------ PNG: leer ------------------------------ */

function decodePNG(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('No es un PNG')
  let pos = 8
  let width = 0
  let height = 0
  let colorType = 6
  let depth = 8
  const idat = []
  while (pos < buffer.length) {
    const len = buffer.readUInt32BE(pos)
    const type = buffer.toString('ascii', pos + 4, pos + 8)
    const data = buffer.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      depth = data[8]
      colorType = data[9]
      if (depth !== 8 || (colorType !== 6 && colorType !== 2)) {
        throw new Error(`PNG no soportado (depth ${depth}, color type ${colorType})`)
      }
      if (data[12] !== 0) throw new Error('PNG entrelazado no soportado')
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }

  const channels = colorType === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = new Uint8Array(width * height * 4)
  let prev = new Uint8Array(stride)

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const cur = new Uint8Array(stride)
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0
      const b = prev[i]
      const c = i >= channels ? prev[i - channels] : 0
      let v = line[i]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      cur[i] = v & 0xff
    }
    for (let x = 0; x < width; x++) {
      const s = x * channels
      const d = (y * width + x) * 4
      out[d] = cur[s]
      out[d + 1] = cur[s + 1]
      out[d + 2] = cur[s + 2]
      out[d + 3] = channels === 4 ? cur[s + 3] : 255
    }
    prev = cur
  }
  return { width, height, data: out }
}

/* ----------------------------- PNG: escribir ----------------------------- */

const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return (buf) => {
    let c = 0xffffffff
    for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
})()

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(CRC(body))
  return Buffer.concat([len, body, crc])
}

function encodePNG({ width, height, data }) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(
      raw,
      y * (width * 4 + 1) + 1
    )
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ------------------------------ Imagen ------------------------------ */

/** Recorta los bordes transparentes para que el logo quede centrado de verdad. */
function trim(img) {
  let top = img.height
  let left = img.width
  let right = -1
  let bottom = -1
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] > 8) {
        if (y < top) top = y
        if (y > bottom) bottom = y
        if (x < left) left = x
        if (x > right) right = x
      }
    }
  }
  if (right < 0) return img
  const width = right - left + 1
  const height = bottom - top + 1
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    const from = ((y + top) * img.width + left) * 4
    data.set(img.data.subarray(from, from + width * 4), y * width * 4)
  }
  return { width, height, data }
}

/** Reescala promediando el área de origen (buena calidad al achicar). */
function resize(img, width, height) {
  const data = new Uint8Array(width * height * 4)
  const sx = img.width / width
  const sy = img.height / height
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * sy)
    const y1 = Math.max(y0 + 1, Math.ceil((y + 1) * sy))
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * sx)
      const x1 = Math.max(x0 + 1, Math.ceil((x + 1) * sx))
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let j = y0; j < Math.min(y1, img.height); j++) {
        for (let i = x0; i < Math.min(x1, img.width); i++) {
          const k = (j * img.width + i) * 4
          const al = img.data[k + 3] / 255
          // Premultiplicado: evita halos oscuros en los bordes del logo.
          r += img.data[k] * al
          g += img.data[k + 1] * al
          b += img.data[k + 2] * al
          a += al
          n++
        }
      }
      const d = (y * width + x) * 4
      if (a > 0) {
        data[d] = Math.round(r / a)
        data[d + 1] = Math.round(g / a)
        data[d + 2] = Math.round(b / a)
      }
      data[d + 3] = Math.round((a / n) * 255)
    }
  }
  return { width, height, data }
}

/** Lienzo con fondo navy; `radius` 0 = cuadrado (maskable). */
function canvasWithBackground(size, radius) {
  const data = new Uint8Array(size * size * 4)
  const SS = 4 // submuestreo para que las esquinas no queden dentadas
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let cover = 0
      for (let j = 0; j < SS; j++) {
        for (let i = 0; i < SS; i++) {
          const px = x + (i + 0.5) / SS
          const py = y + (j + 0.5) / SS
          const cx = Math.min(Math.max(px, radius), size - radius)
          const cy = Math.min(Math.max(py, radius), size - radius)
          const dx = px - cx
          const dy = py - cy
          if (dx * dx + dy * dy <= radius * radius) cover++
        }
      }
      const d = (y * size + x) * 4
      data[d] = BG[0]
      data[d + 1] = BG[1]
      data[d + 2] = BG[2]
      data[d + 3] = Math.round((cover / (SS * SS)) * 255)
    }
  }
  return { width: size, height: size, data }
}

/** Pega `src` sobre `dst` en (ox, oy) con mezcla alfa. */
function composite(dst, src, ox, oy) {
  for (let y = 0; y < src.height; y++) {
    const dy = oy + y
    if (dy < 0 || dy >= dst.height) continue
    for (let x = 0; x < src.width; x++) {
      const dx = ox + x
      if (dx < 0 || dx >= dst.width) continue
      const s = (y * src.width + x) * 4
      const d = (dy * dst.width + dx) * 4
      const sa = src.data[s + 3] / 255
      if (sa === 0) continue
      const da = dst.data[d + 3] / 255
      const oa = sa + da * (1 - sa)
      for (let k = 0; k < 3; k++) {
        dst.data[d + k] = Math.round(
          (src.data[s + k] * sa + dst.data[d + k] * da * (1 - sa)) / oa
        )
      }
      dst.data[d + 3] = Math.round(oa * 255)
    }
  }
}

/** Ícono cuadrado: logo centrado sobre el navy de la marca. */
function icon(logo, size, { maskable }) {
  // En maskable el sistema puede recortar hasta un 20 % de cada lado.
  const ratio = maskable ? 0.52 : 0.68
  const radius = maskable ? 0 : size * 0.22
  const canvas = canvasWithBackground(size, radius)
  const scale = (size * ratio) / Math.max(logo.width, logo.height)
  const w = Math.max(1, Math.round(logo.width * scale))
  const h = Math.max(1, Math.round(logo.height * scale))
  composite(canvas, resize(logo, w, h), Math.round((size - w) / 2), Math.round((size - h) / 2))
  return encodePNG(canvas)
}

/* ------------------------------- Salidas ------------------------------- */

const logo = trim(decodePNG(readFileSync(SOURCE)))
mkdirSync('public/icons', { recursive: true })
mkdirSync('public/brand', { recursive: true })

for (const size of [192, 512]) {
  writeFileSync(`public/icons/icon-${size}.png`, icon(logo, size, { maskable: false }))
  writeFileSync(`public/icons/maskable-${size}.png`, icon(logo, size, { maskable: true }))
}
writeFileSync('public/apple-touch-icon.png', icon(logo, 180, { maskable: false }))
writeFileSync('public/favicon-32.png', icon(logo, 32, { maskable: false }))

// Logo con fondo transparente para la interfaz (header y pantalla de licencia).
for (const size of [64, 128]) {
  const scale = size / Math.max(logo.width, logo.height)
  writeFileSync(
    `public/brand/futurislabs-icon-${size}.png`,
    encodePNG(resize(logo, Math.round(logo.width * scale), Math.round(logo.height * scale)))
  )
}

console.log(`Íconos generados desde ${SOURCE} (logo ${logo.width}×${logo.height})`)
