/**
 * APP DEL DUEÑO · Estado del negocio (lo que necesitan todas las pantallas):
 * negocio, personas, servicios, quién hace qué y horarios.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '../saas/supabase'
import { useToast } from '../saas/ui'
import type { Business, HourRow, Service, Staff } from '../shared/types'
import { DEFAULT_TZ } from '../shared/time'
import {
  loadHours,
  loadMyBusiness,
  loadServices,
  loadStaff,
  loadStaffServices,
} from './data'

type ShopValue = {
  loading: boolean
  error: string | null
  business: Business | null
  staff: Staff[]
  services: Service[]
  hours: HourRow[]
  /** staff_id -> ids de servicios que hace (vacío = hace todos). */
  staffServices: Record<string, string[]>
  timezone: string
  reload: () => Promise<void>
  setBusiness: (b: Business) => void
  /** Cuántas reservas online entraron desde que abriste la pantalla. */
  newOnline: number
  clearNewOnline: () => void
}

const Ctx = createContext<ShopValue | null>(null)

export function useShop() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useShop debe usarse dentro de <ShopProvider>')
  return ctx
}

/** Negocio ya creado (después del onboarding todas las pantallas lo asumen). */
export function useBusiness(): Business {
  const { business } = useShop()
  if (!business) throw new Error('No hay negocio cargado')
  return business
}

/** Pitido corto para avisar que entró una reserva (sin archivos de audio). */
function beep() {
  try {
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.5)
    setTimeout(() => void ctx.close(), 800)
  } catch {
    /* el navegador no quiso: no pasa nada */
  }
}

export const SOUND_KEY = 'avisoSonido'

export function ShopProvider({ children }: { children: ReactNode }) {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [business, setBusinessState] = useState<Business | null>(null)
  const [staff, setStaff] = useState<Staff[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [hours, setHours] = useState<HourRow[]>([])
  const [staffServices, setStaffServices] = useState<Record<string, string[]>>({})
  const [newOnline, setNewOnline] = useState(0)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const reload = useCallback(async () => {
    try {
      setError(null)
      const biz = await loadMyBusiness()
      if (!alive.current) return
      setBusinessState(biz)
      if (!biz) {
        setStaff([])
        setServices([])
        setHours([])
        setStaffServices({})
        return
      }
      const [st, sv, hr] = await Promise.all([
        loadStaff(biz.id),
        loadServices(biz.id),
        loadHours(biz.id),
      ])
      const links = await loadStaffServices(st.map((s) => s.id))
      if (!alive.current) return
      setStaff(st)
      setServices(sv)
      setHours(hr)
      const map: Record<string, string[]> = {}
      for (const l of links) (map[l.staff_id] ??= []).push(l.service_id)
      setStaffServices(map)
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'No pudimos cargar tus datos.')
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    reload().finally(() => {
      if (alive.current) setLoading(false)
    })
  }, [reload])

  // Aviso en tiempo real cuando entra una reserva online.
  useEffect(() => {
    if (!business) return
    const channel = supabase
      .channel(`turnos:${business.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'turnos_appointments',
          filter: `business_id=eq.${business.id}`,
        },
        (payload) => {
          const row = payload.new as { source?: string }
          if (row?.source !== 'online') return
          setNewOnline((n) => n + 1)
          toast('📅 ¡Entró una reserva online!')
          try {
            if (localStorage.getItem(`fl.turnos.${SOUND_KEY}`) !== 'false') beep()
          } catch {
            beep()
          }
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [business, toast])

  const value = useMemo<ShopValue>(
    () => ({
      loading,
      error,
      business,
      staff,
      services,
      hours,
      staffServices,
      timezone: business?.timezone || DEFAULT_TZ,
      reload,
      setBusiness: setBusinessState,
      newOnline,
      clearNewOnline: () => setNewOnline(0),
    }),
    [loading, error, business, staff, services, hours, staffServices, reload, newOnline]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Personas activas que hacen un servicio (vacío de links = lo hacen todas). */
export function staffForService(
  staff: Staff[],
  staffServices: Record<string, string[]>,
  serviceId: string | null
): Staff[] {
  const activos = staff.filter((s) => s.active)
  if (!serviceId) return activos
  const conLinks = activos.filter((s) => (staffServices[s.id]?.length ?? 0) > 0)
  if (conLinks.length === 0) return activos
  return activos.filter((s) => {
    const list = staffServices[s.id]
    return !list || list.length === 0 || list.includes(serviceId)
  })
}
