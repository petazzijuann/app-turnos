import { defineConfig } from 'vitest/config'

// Los tests cubren la lógica pura compartida (src/shared): disponibilidad,
// firma del webhook de Lemon, permisos por estado de suscripción, teléfonos.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
