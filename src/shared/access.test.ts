import { describe, expect, it } from 'vitest'
import { accessFor, acceptsBookings, daysUntil } from './access'

const NOW = new Date('2026-05-10T12:00:00Z')
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString()

describe('accessFor', () => {
  it('sin suscripción: no entra a la app ni toma reservas', () => {
    const a = accessFor(null, NOW)
    expect(a.level).toBe('none')
    expect(a.accepting).toBe(false)
  })

  it('en prueba: acceso completo y cuenta los días', () => {
    const a = accessFor({ status: 'on_trial', trial_ends_at: inDays(9.2) }, NOW)
    expect(a.level).toBe('full')
    expect(a.accepting).toBe(true)
    expect(a.trialDaysLeft).toBe(10)
    expect(a.notice).toBeNull()
  })

  it('en prueba por terminar: avisa', () => {
    expect(accessFor({ status: 'on_trial', trial_ends_at: inDays(2) }, NOW).notice).toContain(
      '2 días'
    )
    expect(accessFor({ status: 'on_trial', trial_ends_at: inDays(0.5) }, NOW).notice).toContain(
      '1 día'
    )
    expect(accessFor({ status: 'on_trial', trial_ends_at: inDays(-1) }, NOW).notice).toContain(
      'termina hoy'
    )
  })

  it('activa: acceso completo y sin avisos', () => {
    const a = accessFor({ status: 'active', renews_at: inDays(20) }, NOW)
    expect(a).toMatchObject({ level: 'full', accepting: true, notice: null, needsCard: false })
  })

  it('past_due: sigue funcionando pero pide la tarjeta', () => {
    const a = accessFor({ status: 'past_due' }, NOW)
    expect(a.level).toBe('full')
    expect(a.accepting).toBe(true)
    expect(a.needsCard).toBe(true)
    expect(a.notice).toContain('tarjeta')
  })

  it('cancelada: acceso completo hasta ends_at', () => {
    const vigente = accessFor({ status: 'cancelled', ends_at: inDays(5) }, NOW)
    expect(vigente.level).toBe('full')
    expect(vigente.accepting).toBe(true)
    expect(vigente.notice).toContain('5 días más')

    const vencida = accessFor({ status: 'cancelled', ends_at: inDays(-1) }, NOW)
    expect(vencida.level).toBe('readonly')
    expect(vencida.accepting).toBe(false)
  })

  it('expirada, impaga o pausada: solo lectura y la página pública se pausa', () => {
    for (const status of ['expired', 'unpaid', 'paused']) {
      const a = accessFor({ status }, NOW)
      expect(a.level).toBe('readonly')
      expect(a.accepting).toBe(false)
      expect(a.notice).toBeTruthy()
    }
  })

  it('estado desconocido: deja leer pero no tomar reservas', () => {
    const a = accessFor({ status: 'algo_nuevo_de_lemon' }, NOW)
    expect(a.level).toBe('readonly')
    expect(a.accepting).toBe(false)
  })

  it('acceptsBookings resume el caso de la página pública', () => {
    expect(acceptsBookings({ status: 'active' }, NOW)).toBe(true)
    expect(acceptsBookings({ status: 'on_trial', trial_ends_at: inDays(3) }, NOW)).toBe(true)
    expect(acceptsBookings({ status: 'expired' }, NOW)).toBe(false)
    expect(acceptsBookings(null, NOW)).toBe(false)
  })
})

describe('daysUntil', () => {
  it('redondea para arriba y nunca da negativo', () => {
    expect(daysUntil(inDays(0.1), NOW)).toBe(1)
    expect(daysUntil(inDays(-3), NOW)).toBe(0)
    expect(daysUntil(null, NOW)).toBeNull()
    expect(daysUntil('cualquier cosa', NOW)).toBeNull()
  })
})
