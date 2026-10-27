# Turnos · Futurislabs

Turnero online por suscripción para peluquerías, barberías, centros de estética,
uñas, masajes y consultorios chicos.

- **Página pública de reservas:** `turnos.futurislabs.net/r/tu-negocio` (sin login, rápida en 4G)
- **Página del cliente:** `/c/:token` (ver, confirmar o cancelar su turno)
- **App del dueño:** el resto del dominio, con login por mail y suscripción
- **Precio:** USD 15/mes con 14 días de prueba gratis (Lemon Squeezy)

Es la **primera app de suscripción de la marca**: todo lo reutilizable vive en
`src/saas/` para que la próxima app arranque de ahí (ver el final de este
documento).

---

## 1. Cómo está armado

```
src/
  saas/          ← PLANTILLA reutilizable: auth, suscripción, layout, PWA, UI
  shared/        ← lógica pura compartida front + Functions (con tests)
    slots.ts       disponibilidad (la parte más delicada de todo el sistema)
    access.ts      estado de suscripción -> permisos
    lemon.ts       firma del webhook + lectura del evento
    time.ts        fechas en la zona del negocio
    phone.ts       teléfonos y links de wa.me
    whatsapp.ts    plantillas con {variables}
    ics.ts         archivo de calendario
  booking/       ← página PÚBLICA de reservas (/r/:slug y /c/:token)
  owner/         ← app del dueño (agenda, recordatorios, clientes, ajustes)
functions/       ← Pages Functions (/api/*)
  _lib/            db (PostgREST), rate limit, Turnstile, Resend, disponibilidad
  api/public/      datos del negocio, horarios, reserva, gestión del cliente
  api/lemon/       webhook de suscripciones
supabase/
  migrations/      SQL numerado (se pega a mano en el SQL Editor)
  seed_demo.sql    "Barbería Demo" opcional, para capturas y /r/demo
```

**Dos bundles a propósito:** `/r/:slug` no carga `supabase-js` ni el código del
dueño (habla con `/api` por `fetch`). Es la página que ven los clientes del
negocio y tiene que abrir rápido con datos móviles.

### Comandos

```bash
npm install
npm run dev          # front en Vite (sin Functions)
npm run build        # tsc -b + vite build -> dist/
npm run pages:dev    # build + wrangler pages dev dist (Functions + .dev.vars)
npm test             # Vitest (50 tests de la lógica pura)
```

---

## 2. Qué te queda por hacer (en orden)

### 2.1 Migraciones de Supabase

Proyecto compartido **futurislabs** (São Paulo). Pegá cada archivo en el
**SQL Editor** y ejecutalo **en este orden**. Todos son idempotentes: podés
volver a correrlos sin romper nada.

| # | Archivo | Qué hace |
|---|---------|----------|
| 1 | `supabase/migrations/001_common.sql` | `btree_gist`, `profiles` (+ trigger al registrarse), `subscriptions` (única por `user_id`+`app`), RLS de ambas |
| 2 | `supabase/migrations/002_turnos_schema.sql` | tablas `turnos_*` + índices + restricción `EXCLUDE` que impide turnos superpuestos |
| 3 | `supabase/migrations/003_turnos_rls.sql` | RLS de todas las `turnos_*` + alta en la publicación de Realtime |
| 4 | `supabase/migrations/004_storage.sql` | bucket público `turnos-public` (2 MB, solo imágenes) + políticas por carpeta |
| 5 | `supabase/seed_demo.sql` | **opcional**: "Barbería Demo" (`/r/demo`). Cambiá `v_email` por el tuyo y corrélo *después* de haberte registrado en la app |

Las tablas comunes (`profiles`, `subscriptions`) no llevan prefijo porque las
van a compartir todas las apps de suscripción; las de esta app llevan `turnos_`.

### 2.2 Auth de Supabase

- **Authentication → Providers → Email**: activado, "Confirm email" activado.
- El SMTP ya apunta a Resend, así que los mails de login los manda Supabase.
- **Authentication → URL Configuration**:
  - Site URL: `https://turnos.futurislabs.net`
  - Redirect URLs: `https://turnos.futurislabs.net/**` y `http://localhost:5173/**`
- Para que llegue el **código de 6 dígitos** (además del link), el template
  "Magic Link" tiene que incluir `{{ .Token }}`. Por ejemplo:

  ```
  Tu código para entrar a Turnos es: {{ .Token }}
  O entrá directo con este link: {{ .ConfirmationURL }}
  ```

### 2.3 Variables en Cloudflare Pages

Proyecto `app-turnos` → **Settings → Variables and Secrets**. Las de la primera
tabla se compilan dentro del bundle (son públicas por definición); las de la
segunda **van como Secret**.

**Variables de build (texto normal, tipo "Plaintext"):**

| Variable | Qué es |
|----------|--------|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | clave publicable (`sb_publishable_…`) |
| `VITE_TURNSTILE_SITE_KEY` | site key de Turnstile (`0x4AAA…`) |
| `VITE_LS_CHECKOUT_URL` | link del checkout de Lemon Squeezy |
| `VITE_APP_ORIGIN` | `https://turnos.futurislabs.net` (opcional; por defecto usa el dominio donde está corriendo) |

**Secrets (marcar "Secret" / "Encrypt"):**

| Variable | Qué es |
|----------|--------|
| `SUPABASE_URL` | la misma URL, para las Functions |
| `SUPABASE_SERVICE_ROLE_KEY` | clave secreta (`sb_secret_…`). **Saltea RLS: nunca en el front** |
| `TURNSTILE_SECRET` | secreto de Turnstile |
| `LEMON_WEBHOOK_SECRET` | secreto de firma del webhook |
| `RESEND_API_KEY` | API key de Resend (mail de confirmación al cliente) |

**Ya están en `wrangler.toml` (no hace falta cargarlas a mano):**
`APP_ORIGIN` y `MAIL_FROM` (`Futurislabs <hola@futurislabs.net>`).

> Ojo: si cambiás una variable `VITE_*` hay que **volver a deployar**, porque se
> compilan en el bundle. Los secrets se leen en cada request.

### 2.4 Build de Pages

- Framework preset: **None**
- Build command: `npm run build`
- Output directory: `dist`
- Dominio: `turnos.futurislabs.net`

### 2.5 Turnstile

Cloudflare → **Turnstile** → widget para `turnos.futurislabs.net`
(agregá `localhost` y `127.0.0.1` para probar en local). Modo **Managed**.
La site key va en `VITE_TURNSTILE_SITE_KEY` y el secreto en `TURNSTILE_SECRET`.

Si `TURNSTILE_SECRET` **no** está cargado, las Functions **no** validan el
captcha (cómodo en local, peligroso en producción): cargalo siempre en Pages.

### 2.6 Lemon Squeezy

1. Producto **"Turnos — Futurislabs"**, variante USD 15/mes con **14 días de
   prueba gratis** (tarjeta pedida en el checkout).
2. El link del checkout va en `VITE_LS_CHECKOUT_URL`. La app le agrega sola:
   `?checkout[email]=…&checkout[custom][user_id]=…&checkout[success_url]=…`
3. **Settings → Webhooks → +**
   - URL: `https://turnos.futurislabs.net/api/lemon/webhook`
   - Signing secret: el mismo valor que `LEMON_WEBHOOK_SECRET`
   - Eventos:
     `subscription_created`, `subscription_updated`, `subscription_cancelled`,
     `subscription_resumed`, `subscription_expired`, `subscription_paused`,
     `subscription_unpaused`, `subscription_payment_success`,
     `subscription_payment_failed`
4. En **Settings → General** dejá habilitado el *customer portal*: la pantalla
   "Mi plan" lleva ahí para cambiar la tarjeta o cancelar.

Cómo se traduce el estado a permisos (`src/shared/access.ts`, con tests):

| Estado de Lemon | Acceso a la app | Página `/r/:slug` |
|---|---|---|
| `on_trial`, `active` | completo | toma reservas |
| `past_due` | completo + aviso "actualiza tu tarjeta" | toma reservas |
| `cancelled` | completo hasta `ends_at` | hasta `ends_at` |
| `expired`, `unpaid`, `paused` | solo lectura + "Reactiva tu plan" | pausada |
| sin suscripción | pantalla de prueba gratis | pausada |

### 2.7 Rate limit (KV) — opcional

Las rutas públicas tienen rate limit por IP. Sin configurar nada usa un
contador en memoria por isolate (frena lo obvio). Para que sea global:

```bash
npx wrangler kv namespace create TURNOS_RATE
```

Copiá el `id` que devuelve, descomentá el bloque `[[kv_namespaces]]` de
`wrangler.toml` y además agregá el binding en
**Pages → Settings → Bindings → KV namespace** con el nombre **`RATE`**.

### 2.8 Resend

El dominio `futurislabs.net` ya está verificado (lo usa el SMTP de Supabase).
Las Functions mandan el mail de confirmación desde
`Futurislabs <hola@futurislabs.net>` con *reply-to* al mail del dueño.

---

## 3. Probar en local

```bash
cp .env.example .env     # completá los valores (el .env NO se sube)
npm install
npm run pages:dev        # http://127.0.0.1:8788 con Functions reales
```

Los secretos de las Functions en local se leen de `.dev.vars` (ya generado a
partir del `.env`, y también ignorado por git). Si agregás una variable nueva,
agregala en los tres lugares: `.env`, `.env.example` y `.dev.vars`.

Chequeos rápidos:

```bash
curl -s "http://127.0.0.1:8788/api/public/slug-free?slug=demo"
curl -s "http://127.0.0.1:8788/api/public/demo" | head -c 300
curl -s -X POST -d '{}' "http://127.0.0.1:8788/api/lemon/webhook"   # -> firma inválida
```

---

## 4. Endpoints

| Método | Ruta | Para qué |
|---|---|---|
| GET | `/api/public/slug-free?slug=` | ¿está libre este link de reservas? |
| GET | `/api/public/:slug` | datos públicos del negocio (cache 30 s en el borde) |
| GET | `/api/public/:slug/slots?service=&staff=&date=` | horarios libres del día + días con lugar |
| POST | `/api/public/:slug/book` | reservar (Turnstile + recálculo + insert) |
| GET/POST | `/api/public/manage/:token` | el cliente ve, confirma o cancela su turno |
| POST | `/api/lemon/webhook` | suscripciones (firma `X-Signature`) |

La disponibilidad **siempre** se calcula en el servidor: el navegador nunca ve
la agenda completa del negocio, y antes de insertar se vuelve a recalcular. La
última palabra la tiene la restricción `EXCLUDE` de Postgres; si dos personas
reservan el mismo segundo, la segunda recibe *"Ese horario se acaba de ocupar"*
junto con los otros horarios de ese día.

---

## 5. Decisiones que vale la pena conocer

- **Nada de lectura pública directa en la base.** No hay policies `anon` sobre
  las tablas: la página pública pasa por Functions con la clave secreta, que
  arman a mano lo que se expone. Así no se puede enumerar clientes ni turnos.
- **Fechas:** todo se guarda como `timestamptz` (UTC). La zona del negocio solo
  se usa para convertir "los martes de 9 a 13" en instantes reales, así el
  horario de verano no corre los turnos. Hay un test con el cambio de hora.
- **`price` en el turno:** se congela el precio del servicio al reservar, para
  que los ingresos del mes no cambien cuando subís la lista.
- **Rate limit sin KV obligatorio:** ver 2.7.
- **Recordatorios por WhatsApp sin API:** se abre `wa.me` con el mensaje escrito
  y al volver el turno queda marcado (`reminded_at`). Sin costo por mensaje y
  sin aprobación de plantillas de Meta; el precio es que el dueño toca un botón
  por cliente (justamente el flujo que pediste).
- **Un negocio por cuenta** en la interfaz: el modelo de datos soporta varios
  (`turnos_businesses.owner_id`), pero la app usa el primero. Es lo que necesita
  el 99% de los casos y simplifica todas las pantallas.

---

## 6. Reutilizar `src/saas/` en la próxima app de suscripción

`src/saas/` no sabe nada de turnos. Para arrancar otra app:

1. Copiá `src/saas/`, `src/styles/tokens.css`, `src/index.css`, `public/`,
   `scripts/gen-icons.mjs`, `vite.config.ts`, `wrangler.toml`,
   `functions/_lib/{db,env,http,rate}.ts`, `functions/_middleware.ts` y
   `functions/api/lemon/webhook.ts`.
2. Cambiá **`src/saas/config.ts`**: `app` (es el valor de `subscriptions.app`),
   `appName`, `tagline`, `checkoutUrl`, `price`, `storagePrefix`, URLs.
3. Cambiá el `name` de `wrangler.toml`, el `manifest` de `vite.config.ts` y los
   textos de `index.html`.
4. Base de datos: `001_common.sql` se corre **una sola vez** por proyecto
   Supabase (ya está). Agregá solo tu `00X_<app>_schema.sql` con el prefijo de
   tu app y su RLS.
5. Escribí la app nueva en su propia carpeta (acá: `src/owner/`) y armá la
   cáscara como en `src/owner/OwnerRoot.tsx`:

```tsx
<ToastProvider>
  <AuthProvider>
    <SubscriptionProvider>
      {/* sin sesión -> <LoginScreen/>; sin plan -> <SubscribeScreen/> */}
      <AppLayout items={misSecciones}>{misRutas}</AppLayout>
    </SubscriptionProvider>
  </AuthProvider>
</ToastProvider>
```

Lo que ya viene resuelto: login por mail con código, suscripción con prueba
gratis + polling al volver del checkout, mapeo de estados a permisos, pantalla
"Mi plan" con el portal de Lemon, webhook firmado e idempotente, layout mobile
con navegación abajo, aviso de instalación de PWA para iPhone y Android, modo
claro/oscuro y las primitivas de interfaz con el look de la marca.

---

## 7. Seguridad

- `.env`, `.env.*` y `.dev.vars` están en `.gitignore` **desde el primer commit**.
- La clave `sb_secret_…` solo vive en las Functions (nunca en `VITE_*`).
- El webhook compara la firma en tiempo constante y rechaza si falta el secreto.
- `public/_headers` manda `nosniff`, `Referrer-Policy` y `X-Frame-Options`.
- El middleware de Functions convierte cualquier excepción en un JSON genérico:
  nunca sale un stack trace ni un detalle de Postgres al navegador.
