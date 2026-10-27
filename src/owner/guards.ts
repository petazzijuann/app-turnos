/** APP DEL DUEÑO · ¿Puede escribir? (plan vencido = solo lectura). */
import { useSubscription } from '../saas/subscription'
import { useToast } from '../saas/ui'

/** true cuando el plan no está activo: se puede mirar pero no tocar. */
export function useReadOnly(): boolean {
  return useSubscription().access.level !== 'full'
}

/**
 * Envuelve una acción que escribe: si el plan no está activo avisa y no hace
 * nada. Así no hay que repetir el chequeo en cada botón.
 */
export function useGuard() {
  const readOnly = useReadOnly()
  const toast = useToast()
  return (fn: () => void | Promise<void>) => {
    if (readOnly) {
      toast('Tu plan no está activo: reactivalo para hacer cambios.', 'danger')
      return
    }
    void fn()
  }
}
