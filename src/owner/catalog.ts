/** APP DEL DUEÑO · Rubros y servicios sugeridos para arrancar en 1 minuto. */

export type CategoryKey = 'barberia' | 'peluqueria' | 'unas' | 'estetica' | 'consultorio' | 'otro'

export const CATEGORIES: { key: CategoryKey; label: string; emoji: string }[] = [
  { key: 'barberia', label: 'Barbería', emoji: '💈' },
  { key: 'peluqueria', label: 'Peluquería', emoji: '💇' },
  { key: 'unas', label: 'Uñas', emoji: '💅' },
  { key: 'estetica', label: 'Centro de estética', emoji: '✨' },
  { key: 'consultorio', label: 'Consultorio', emoji: '🩺' },
  { key: 'otro', label: 'Otro', emoji: '🏠' },
]

export const categoryLabel = (key: string) =>
  CATEGORIES.find((c) => c.key === key)?.label ?? 'Negocio'

export type ServiceTemplate = { name: string; duration_min: number; price?: number }

/** Plantillas por rubro: el dueño las tilda y las edita si quiere. */
export const SERVICE_TEMPLATES: Record<CategoryKey, ServiceTemplate[]> = {
  barberia: [
    { name: 'Corte de pelo', duration_min: 30 },
    { name: 'Corte + barba', duration_min: 45 },
    { name: 'Barba', duration_min: 20 },
    { name: 'Corte para niños', duration_min: 25 },
    { name: 'Color', duration_min: 60 },
  ],
  peluqueria: [
    { name: 'Corte', duration_min: 45 },
    { name: 'Lavado y peinado', duration_min: 30 },
    { name: 'Color raíz', duration_min: 90 },
    { name: 'Mechas / balayage', duration_min: 150 },
    { name: 'Alisado', duration_min: 120 },
    { name: 'Brushing', duration_min: 40 },
  ],
  unas: [
    { name: 'Esmaltado semipermanente', duration_min: 60 },
    { name: 'Kapping', duration_min: 90 },
    { name: 'Esculpidas', duration_min: 120 },
    { name: 'Retiro de gel', duration_min: 30 },
    { name: 'Pedicuría', duration_min: 50 },
  ],
  estetica: [
    { name: 'Limpieza de cutis', duration_min: 60 },
    { name: 'Depilación media pierna', duration_min: 30 },
    { name: 'Depilación completa', duration_min: 60 },
    { name: 'Lifting de pestañas', duration_min: 60 },
    { name: 'Masaje descontracturante', duration_min: 60 },
    { name: 'Diseño de cejas', duration_min: 30 },
  ],
  consultorio: [
    { name: 'Primera consulta', duration_min: 45 },
    { name: 'Consulta de seguimiento', duration_min: 30 },
    { name: 'Control', duration_min: 20 },
    { name: 'Sesión', duration_min: 50 },
  ],
  otro: [
    { name: 'Turno', duration_min: 30 },
    { name: 'Turno largo', duration_min: 60 },
  ],
}

/** Horario típico para no arrancar de cero: lun-vie 9-13 y 15-20, sáb 9-14. */
export const DEFAULT_WEEK: { weekday: number; blocks: [string, string][] }[] = [
  { weekday: 1, blocks: [['09:00', '13:00'], ['15:00', '20:00']] },
  { weekday: 2, blocks: [['09:00', '13:00'], ['15:00', '20:00']] },
  { weekday: 3, blocks: [['09:00', '13:00'], ['15:00', '20:00']] },
  { weekday: 4, blocks: [['09:00', '13:00'], ['15:00', '20:00']] },
  { weekday: 5, blocks: [['09:00', '13:00'], ['15:00', '20:00']] },
  { weekday: 6, blocks: [['09:00', '14:00']] },
  { weekday: 0, blocks: [] },
]

/** Convierte el nombre del negocio en un slug lindo para el link. */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
}
