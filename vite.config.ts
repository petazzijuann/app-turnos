import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Build 100% estático -> carpeta `dist` (output de Cloudflare Pages).
// Las rutas /api/* las atienden las Pages Functions de /functions.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-32.png', 'apple-touch-icon.png', 'brand/*.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,woff2}'],
        // La API y la página pública de reservas siempre van a la red.
        navigateFallbackDenylist: [/^\/api\//, /^\/r\//, /^\/c\//],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        name: 'Turnos · Futurislabs',
        short_name: 'Turnos',
        description:
          'Tu agenda y tu página de reservas online. Tus clientes reservan solos; tú recordás por WhatsApp en un toque.',
        lang: 'es',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#080c14',
        theme_color: '#080c14',
        categories: ['business', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // La página pública tiene que cargar liviana en 4G: separamos las
        // librerías grandes para que /r/:slug no arrastre el código del dueño.
        manualChunks(id: string) {
          if (id.includes('node_modules/@supabase')) return 'supabase'
          if (/node_modules\/(react|react-dom|react-router)/.test(id)) return 'react'
          return undefined
        },
      },
    },
  },
})
