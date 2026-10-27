import { describe, expect, it } from 'vitest'
import { DEFAULT_TEMPLATES, renderTemplate, templateFor } from './whatsapp'
import { formatPhone, toE164, waLink } from './phone'

describe('plantillas de WhatsApp', () => {
  it('reemplaza las variables', () => {
    const out = renderTemplate(DEFAULT_TEMPLATES.reminder, {
      nombre: 'Martín',
      servicio: 'Corte',
      dia: 'martes 10 de marzo',
      hora: '15:30',
      persona: 'Nico',
      negocio: 'Barbería Demo',
      link: 'https://turnos.futurislabs.net/c/abc',
    })
    expect(out).toBe(
      'Hola Martín! Te recordamos tu turno en Barbería Demo: Corte el martes 10 de marzo a las 15:30 con Nico. Confirmá o cancelá acá: https://turnos.futurislabs.net/c/abc'
    )
  })

  it('deja intacta una variable que no existe', () => {
    expect(renderTemplate('Hola {nombre}, {inventada}', { nombre: 'Lu' })).toBe(
      'Hola Lu, {inventada}'
    )
  })

  it('usa la plantilla de fábrica cuando la del negocio está vacía', () => {
    expect(templateFor({ reminder: '   ' }, 'reminder')).toBe(DEFAULT_TEMPLATES.reminder)
    expect(templateFor({ reminder: 'Hola!' }, 'reminder')).toBe('Hola!')
    expect(templateFor(null, 'today')).toBe(DEFAULT_TEMPLATES.today)
  })
})

describe('teléfonos', () => {
  it('normaliza números argentinos al formato de WhatsApp', () => {
    expect(toE164('11 2345 6789', 'AR')).toBe('+5491123456789')
    expect(toE164('011 15 2345-6789', 'AR')).toBe('+5491123456789')
    expect(toE164('+54 9 11 2345 6789', 'AR')).toBe('+5491123456789')
    expect(toE164('3514 15 234567', 'AR')).toBe('+5493514234567')
  })

  it('respeta otros países sin inventarles prefijos', () => {
    expect(toE164('99 123 456', 'UY')).toBe('+59899123456')
    expect(toE164('9 1234 5678', 'CL')).toBe('+56912345678')
  })

  it('rechaza lo que no es un teléfono', () => {
    expect(toE164('', 'AR')).toBeNull()
    expect(toE164('abc', 'AR')).toBeNull()
    expect(toE164('12', 'AR')).toBeNull()
  })

  it('arma el link de wa.me con el mensaje', () => {
    expect(waLink('+5491123456789', 'Hola!')).toBe('https://wa.me/5491123456789?text=Hola!')
    expect(waLink('+5491123456789')).toBe('https://wa.me/5491123456789')
  })

  it('muestra el número legible', () => {
    expect(formatPhone('+5491123456789')).toBe('+54 911 2345-6789')
    expect(formatPhone('+59899123456')).toBe('+598 9912-3456')
    expect(formatPhone(null)).toBe('')
  })
})
