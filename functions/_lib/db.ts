/**
 * FUNCTIONS · Cliente mínimo de Supabase (PostgREST) con la clave secreta.
 * Se usa fetch directo en lugar de supabase-js para que el bundle del Worker
 * quede chico y la página pública responda rápido.
 *
 * OJO: esta clave saltea RLS. Nunca devolver filas crudas al navegador:
 * cada endpoint arma a mano lo que expone.
 */
import type { Env } from './env'

export class DbError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly detail?: string
  ) {
    super(message)
  }
}

export type PgError = { message?: string; code?: string; details?: string; hint?: string }

export function db(env: Env) {
  const base = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1`
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  const headers = (extra: Record<string, string> = {}) => ({
    apikey: key,
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
    ...extra,
  })

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${base}/${path}`, init)
    const text = await res.text()
    if (!res.ok) {
      let e: PgError = {}
      try {
        e = JSON.parse(text) as PgError
      } catch {
        e = { message: text }
      }
      throw new DbError(e.message ?? 'Error de base de datos', res.status, e.code, e.details)
    }
    return (text ? JSON.parse(text) : null) as T
  }

  return {
    /** SELECT. `query` es la query string de PostgREST (select=…&id=eq.…). */
    select: <T>(table: string, query: string) =>
      call<T[]>(`${table}?${query}`, { method: 'GET', headers: headers() }),

    /** Primera fila o null. */
    async one<T>(table: string, query: string): Promise<T | null> {
      const rows = await call<T[]>(`${table}?${query}&limit=1`, {
        method: 'GET',
        headers: headers(),
      })
      return rows[0] ?? null
    },

    insert: <T>(table: string, rows: unknown, select = '*') =>
      call<T[]>(`${table}?select=${encodeURIComponent(select)}`, {
        method: 'POST',
        headers: headers({ prefer: 'return=representation' }),
        body: JSON.stringify(rows),
      }),

    update: <T>(table: string, query: string, patch: unknown, select = '*') =>
      call<T[]>(`${table}?${query}&select=${encodeURIComponent(select)}`, {
        method: 'PATCH',
        headers: headers({ prefer: 'return=representation' }),
        body: JSON.stringify(patch),
      }),

    /** UPSERT por las columnas de un índice único. */
    upsert: <T>(table: string, rows: unknown, onConflict: string, select = '*') =>
      call<T[]>(
        `${table}?on_conflict=${encodeURIComponent(onConflict)}&select=${encodeURIComponent(select)}`,
        {
          method: 'POST',
          headers: headers({ prefer: 'resolution=merge-duplicates,return=representation' }),
          body: JSON.stringify(rows),
        }
      ),
  }
}

export type Db = ReturnType<typeof db>

/** true si el error es el de la restricción EXCLUDE (turno superpuesto). */
export const isOverlap = (e: unknown) =>
  e instanceof DbError &&
  (e.code === '23P01' ||
    e.message.includes('turnos_appointments_no_overlap') ||
    (e.detail ?? '').includes('turnos_appointments_no_overlap'))
