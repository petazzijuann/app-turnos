/** SAAS · Persistencia local. Los datos del usuario nunca salen del navegador. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { config } from './config'

export const key = (name: string) => `${config.storagePrefix}.${name}`

export function readJSON<T>(name: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key(name))
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeJSON(name: string, value: unknown): boolean {
  try {
    localStorage.setItem(key(name), JSON.stringify(value))
    return true
  } catch {
    // Cuota llena o almacenamiento bloqueado (modo privado).
    return false
  }
}

export function remove(name: string) {
  try {
    localStorage.removeItem(key(name))
  } catch {
    /* sin acceso a localStorage */
  }
}

/** Estado de React sincronizado con localStorage. */
export function useStored<T>(name: string, initial: T) {
  const [value, setValue] = useState<T>(() => readJSON(name, initial))
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    writeJSON(name, value)
  }, [name, value])
  const reset = useCallback(() => setValue(initial), [initial])
  return [value, setValue, reset] as const
}

/**
 * Pide almacenamiento persistente para que el navegador no borre los datos
 * cuando falta espacio. Silencioso si no está soportado.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted?.()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
