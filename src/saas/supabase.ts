/**
 * SAAS · Cliente de Supabase (auth + Postgres con RLS).
 * Las claves nuevas (sb_publishable_… / sb_secret_…) se pasan igual que las
 * viejas: supabase-js las manda en el header `apikey`.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from './config'

if (!config.supabase.url || !config.supabase.anonKey) {
  // Mejor un error claro en consola que una pantalla en blanco.
  console.error(
    'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. Copia .env.example a .env y completalos.'
  )
}

export const supabase = createClient(config.supabase.url, config.supabase.anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storageKey: `${config.storagePrefix}.auth`,
  },
  global: { headers: { 'x-app': config.app } },
})
