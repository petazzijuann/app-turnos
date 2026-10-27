import { describe, expect, it } from 'vitest'
import { formatInTimeZone } from 'date-fns-tz'
import {
  addDays,
  computeSlots,
  daysWithSlots,
  formatHm,
  isSlotFree,
  parseHm,
  pickStaff,
  weekdayOf,
  type SlotsInput,
} from './slots'

const AR = 'America/Argentina/Buenos_Aires'
/** 2026-03-10 es martes (weekday 2). */
const MARTES = '2026-03-10'

/** Horas locales de cada slot, para leer los tests de un vistazo. */
const localTimes = (slots: { start: string }[], tz = AR) =>
  slots.map((s) => formatInTimeZone(new Date(s.start), tz, 'HH:mm'))

const base = (over: Partial<SlotsInput> = {}): SlotsInput => ({
  date: MARTES,
  timezone: AR,
  durationMin: 30,
  stepMin: 30,
  minNoticeHours: 0,
  // Bien lejos en el pasado: la anticipación mínima no molesta salvo que el
  // test la pruebe a propósito.
  now: '2026-01-01T00:00:00Z',
  staff: [
    {
      staffId: 'nico',
      hours: [
        { weekday: 2, start: '09:00', end: '13:00' },
        { weekday: 2, start: '15:00', end: '20:00' },
      ],
      busy: [],
    },
  ],
  ...over,
})

describe('utilidades', () => {
  it('parsea y formatea HH:MM', () => {
    expect(parseHm('09:30')).toBe(570)
    expect(parseHm('20:00:00')).toBe(1200)
    expect(formatHm(570)).toBe('09:30')
  })

  it('calcula el día de la semana de una fecha civil', () => {
    expect(weekdayOf('2026-03-10')).toBe(2) // martes
    expect(weekdayOf('2026-03-08')).toBe(0) // domingo
  })

  it('suma días sin pasarse de mes', () => {
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })
})

describe('bloques partidos', () => {
  it('no ofrece horarios en el corte del mediodía', () => {
    const times = localTimes(computeSlots(base()))
    expect(times[0]).toBe('09:00')
    expect(times).toContain('12:30')
    expect(times).not.toContain('13:00')
    expect(times).not.toContain('14:30')
    expect(times).toContain('15:00')
    expect(times.at(-1)).toBe('19:30')
    // 9-13 => 8 turnos de 30'; 15-20 => 10.
    expect(times).toHaveLength(18)
  })

  it('ignora el horario de otros días de la semana', () => {
    const slots = computeSlots(base({ date: '2026-03-11' })) // miércoles
    expect(slots).toHaveLength(0)
  })
})

describe('intervalo de horarios', () => {
  it('con intervalo de 15 ofrece el doble de inicios', () => {
    const times = localTimes(computeSlots(base({ stepMin: 15 })))
    expect(times.slice(0, 4)).toEqual(['09:00', '09:15', '09:30', '09:45'])
    // 9-13 => 15 inicios (último 12:30); 15-20 => 19 (último 19:30).
    expect(times).toHaveLength(34)
  })

  it('el intervalo es independiente de la duración', () => {
    const times = localTimes(computeSlots(base({ stepMin: 15, durationMin: 45 })))
    expect(times.slice(0, 3)).toEqual(['09:00', '09:15', '09:30'])
    // 9-13: último inicio 12:15 (12:15+45 = 13:00 justo).
    expect(times).toContain('12:15')
    expect(times).not.toContain('12:30')
  })
})

describe('la duración tiene que entrar completa en el bloque', () => {
  it('descarta el último inicio si el servicio se pasa del cierre', () => {
    const times = localTimes(computeSlots(base({ durationMin: 45 })))
    expect(times).toContain('12:00') // 12:00 + 45 = 12:45 <= 13:00
    expect(times).not.toContain('12:30') // 12:30 + 45 = 13:15 > 13:00
    expect(times.at(-1)).toBe('19:00') // 19:00 + 45 = 19:45 <= 20:00
  })

  it('un servicio más largo que el bloque no deja horarios', () => {
    const slots = computeSlots({
      ...base(),
      durationMin: 300,
      staff: [{ staffId: 'nico', hours: [{ weekday: 2, start: '09:00', end: '13:00' }], busy: [] }],
    })
    expect(slots).toHaveLength(0)
  })
})

describe('bloqueos y turnos existentes', () => {
  it('un bloqueo tapa los horarios que pisa', () => {
    const times = localTimes(
      computeSlots(
        base({
          staff: [
            {
              staffId: 'nico',
              hours: [{ weekday: 2, start: '09:00', end: '13:00' }],
              busy: [{ start: '2026-03-10T13:00:00Z', end: '2026-03-10T15:00:00Z' }], // 10-12 AR
            },
          ],
        })
      )
    )
    expect(times).toEqual(['09:00', '09:30', '12:00', '12:30'])
  })

  it('un turno existente ocupa su rango y nada más', () => {
    const times = localTimes(
      computeSlots(
        base({
          staff: [
            {
              staffId: 'nico',
              hours: [{ weekday: 2, start: '09:00', end: '11:00' }],
              busy: [{ start: '2026-03-10T12:30:00Z', end: '2026-03-10T13:00:00Z' }], // 9:30-10 AR
            },
          ],
        })
      )
    )
    expect(times).toEqual(['09:00', '10:00', '10:30'])
  })

  it('un turno que termina justo cuando empieza el hueco no lo bloquea', () => {
    const times = localTimes(
      computeSlots(
        base({
          staff: [
            {
              staffId: 'nico',
              hours: [{ weekday: 2, start: '09:00', end: '10:00' }],
              busy: [{ start: '2026-03-10T12:00:00Z', end: '2026-03-10T12:30:00Z' }], // 9:00-9:30
            },
          ],
        })
      )
    )
    expect(times).toEqual(['09:30'])
  })
})

describe('anticipación mínima', () => {
  it('corta los horarios de hoy que están demasiado cerca', () => {
    // 10:10 AR = 13:10 UTC. Con 2 horas de anticipación, el primero libre
    // es 12:30 (12:10 no cae en la grilla de 30').
    const times = localTimes(
      computeSlots(base({ now: '2026-03-10T13:10:00Z', minNoticeHours: 2 }))
    )
    expect(times[0]).toBe('12:30')
    expect(times).not.toContain('12:00')
  })

  it('sin anticipación mínima, ofrece desde la hora exacta en adelante', () => {
    const times = localTimes(computeSlots(base({ now: '2026-03-10T13:00:00Z' })))
    expect(times[0]).toBe('10:00')
  })
})

describe('zona horaria y horario de verano', () => {
  it('los horarios del negocio no se corren por el cambio de hora', () => {
    // Nueva York adelanta el reloj el 2026-03-08 a las 02:00 (no existen las
    // 02:xx). Un bloque de 00:00 a 06:00 dura 5 horas reales ese día.
    const times = localTimes(
      computeSlots({
        date: '2026-03-08',
        timezone: 'America/New_York',
        durationMin: 60,
        stepMin: 60,
        now: '2026-01-01T00:00:00Z',
        staff: [
          { staffId: 'x', hours: [{ weekday: 0, start: '00:00', end: '06:00' }], busy: [] },
        ],
      }),
      'America/New_York'
    )
    expect(times).toEqual(['00:00', '01:00', '03:00', '04:00', '05:00'])
  })

  it('en Buenos Aires (sin horario de verano) las horas locales son estables', () => {
    const invierno = localTimes(computeSlots(base({ date: '2026-07-07' /* martes */ })))
    expect(invierno[0]).toBe('09:00')
    expect(invierno.at(-1)).toBe('19:30')
  })
})

describe('"Cualquiera"', () => {
  const dos = (busyLu: boolean): SlotsInput =>
    base({
      stepMin: 60,
      staff: [
        { staffId: 'nico', hours: [{ weekday: 2, start: '09:00', end: '11:00' }], busy: [] },
        {
          staffId: 'lu',
          hours: [{ weekday: 2, start: '09:00', end: '11:00' }],
          busy: busyLu ? [{ start: '2026-03-10T12:00:00Z', end: '2026-03-10T13:00:00Z' }] : [],
        },
      ],
    })

  it('agrupa por hora y lista a todas las personas libres', () => {
    const slots = computeSlots(dos(false))
    expect(slots).toHaveLength(2)
    expect(slots[0]!.staffIds.sort()).toEqual(['lu', 'nico'])
  })

  it('deja solo a quien está libre cuando la otra persona está ocupada', () => {
    const slots = computeSlots(dos(true))
    expect(slots[0]!.staffIds).toEqual(['nico']) // 9:00: Lu ocupada
    expect(slots[1]!.staffIds.sort()).toEqual(['lu', 'nico']) // 10:00: las dos
  })

  it('reparte el trabajo: elige a quien tiene menos turnos ese día', () => {
    expect(pickStaff(['nico', 'lu'], { nico: 3, lu: 1 })).toBe('lu')
    expect(pickStaff(['nico', 'lu'], {}, ['nico', 'lu'])).toBe('nico')
    expect(pickStaff([])).toBeNull()
  })
})

describe('isSlotFree (recálculo del servidor)', () => {
  it('acepta una hora de la grilla y rechaza una inventada', () => {
    const input = base()
    const slots = computeSlots(input)
    expect(isSlotFree(input, slots[0]!.start, 'nico')).toBe(true)
    expect(isSlotFree(input, '2026-03-10T12:07:00Z', 'nico')).toBe(false)
    expect(isSlotFree(input, slots[0]!.start, 'otra-persona')).toBe(false)
  })
})

describe('días con disponibilidad', () => {
  it('marca en cero los días sin horario', () => {
    const dias = daysWithSlots(
      {
        timezone: AR,
        durationMin: 30,
        stepMin: 30,
        now: '2026-01-01T00:00:00Z',
        staff: base().staff,
      },
      '2026-03-09',
      4
    )
    expect(dias.map((d) => d.count > 0)).toEqual([false, true, false, false])
  })
})
