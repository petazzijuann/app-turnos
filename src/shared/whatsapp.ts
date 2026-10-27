/** COMPARTIDO · Plantillas de mensajes de WhatsApp con variables. */
import type { WaTemplates } from './types'

/** Variables que puede usar el dueño en sus plantillas. */
export const WA_VARS = [
  'nombre',
  'servicio',
  'dia',
  'hora',
  'persona',
  'negocio',
  'link',
] as const
export type WaVar = (typeof WA_VARS)[number]

export const WA_VAR_HELP: Record<WaVar, string> = {
  nombre: 'Nombre del cliente',
  servicio: 'Servicio reservado',
  dia: 'Día del turno (ej. martes 10 de marzo)',
  hora: 'Hora del turno (ej. 15:30)',
  persona: 'Quién atiende',
  negocio: 'Nombre de tu negocio',
  link: 'Link para confirmar o cancelar',
}

export const DEFAULT_TEMPLATES: Required<WaTemplates> = {
  reminder:
    'Hola {nombre}! Te recordamos tu turno en {negocio}: {servicio} el {dia} a las {hora} con {persona}. Confirmá o cancelá acá: {link}',
  confirm:
    'Hola {nombre}! Te agendamos {servicio} el {dia} a las {hora} con {persona} en {negocio}. Cualquier cambio: {link}',
  today: 'Hola {nombre}! Hoy te esperamos a las {hora} en {negocio}. ¡Nos vemos!',
  winback:
    'Hola {nombre}! Hace un rato que no te vemos por {negocio}. ¿Te reservamos un turno esta semana?',
}

export type TemplateKind = keyof typeof DEFAULT_TEMPLATES

export const TEMPLATE_LABELS: Record<TemplateKind, string> = {
  reminder: 'Recordatorio de turno',
  confirm: 'Confirmación de turno',
  today: 'Te esperamos hoy',
  winback: 'Te extrañamos',
}

/** Reemplaza {variables}. Lo que no reconoce lo deja tal cual. */
export function renderTemplate(
  template: string,
  values: Partial<Record<WaVar, string>>
): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const v = values[name as WaVar]
    return v === undefined ? match : v
  })
}

/** Plantilla del negocio o la de fábrica si está vacía. */
export function templateFor(templates: WaTemplates | null | undefined, kind: TemplateKind): string {
  const t = templates?.[kind]
  return t && t.trim() ? t : DEFAULT_TEMPLATES[kind]
}
