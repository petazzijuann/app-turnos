/**
 * Rutas de la app. Está partida en dos bundles a propósito:
 *   /r/:slug y /c/:token  -> página pública de reservas (liviana, sin login
 *                            ni supabase-js: habla con /api por fetch)
 *   el resto              -> app del dueño (auth + suscripción + agenda)
 * Así la página que usan los clientes del negocio carga rápido en 4G.
 */
import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Logo } from './saas/Logo'

const BookingPage = lazy(() => import('./booking/BookingPage'))
const ManagePage = lazy(() => import('./booking/ManagePage'))
const OwnerRoot = lazy(() => import('./owner/OwnerRoot'))

function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <Logo size={48} />
      <div
        className="size-6 animate-spin rounded-full border-2 border-line border-t-brand"
        role="status"
        aria-label="Cargando"
      />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Splash />}>
        <Routes>
          <Route path="/r/:slug" element={<BookingPage />} />
          <Route path="/c/:token" element={<ManagePage />} />
          <Route path="/*" element={<OwnerRoot />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
