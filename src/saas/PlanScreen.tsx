/** SAAS · "Mi plan": estado, prueba, renovación y portal de Lemon. */
import { useAuth } from './auth'
import { config } from './config'
import { useSubscription } from './subscription'
import { Banner, Button, Card, LinkButton } from './ui'
import { longDayTime } from '../shared/time'

const ESTADOS: Record<string, string> = {
  on_trial: 'En prueba gratis',
  active: 'Activo',
  past_due: 'Pago pendiente',
  cancelled: 'Cancelado (activo hasta el fin del período)',
  expired: 'Vencido',
  unpaid: 'Impago',
  paused: 'Pausado',
  none: 'Sin plan',
}

export function PlanScreen() {
  const { user, signOut } = useAuth()
  const { row, access, checkoutUrl, refresh } = useSubscription()
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

  return (
    <div className="space-y-4">
      <Card
        title="Mi plan"
        subtitle={`${config.appName} · ${config.brand}`}
        actions={
          <Button size="sm" onClick={() => void refresh()}>
            Actualizar
          </Button>
        }
      >
        {access.notice ? (
          <Banner tone={access.needsCard ? 'danger' : 'warn'} className="mb-4">
            {access.notice}
          </Banner>
        ) : null}

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="fl-label">Estado</dt>
            <dd className="font-medium">{ESTADOS[access.status] ?? access.status}</dd>
          </div>
          <div>
            <dt className="fl-label">Precio</dt>
            <dd className="font-medium">{config.price}</dd>
          </div>
          {access.trialDaysLeft != null ? (
            <div>
              <dt className="fl-label">Prueba gratis</dt>
              <dd className="font-medium">
                {access.trialDaysLeft === 0
                  ? 'Termina hoy'
                  : `${access.trialDaysLeft} día${access.trialDaysLeft === 1 ? '' : 's'} restantes`}
              </dd>
            </div>
          ) : null}
          {row?.renews_at && access.status !== 'cancelled' ? (
            <div>
              <dt className="fl-label">Próxima renovación</dt>
              <dd className="font-medium">{longDayTime(row.renews_at, tz)}</dd>
            </div>
          ) : null}
          {row?.ends_at ? (
            <div>
              <dt className="fl-label">Acceso hasta</dt>
              <dd className="font-medium">{longDayTime(row.ends_at, tz)}</dd>
            </div>
          ) : null}
          <div>
            <dt className="fl-label">Cuenta</dt>
            <dd className="break-all font-medium">{user?.email}</dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-wrap gap-2">
          {row?.customer_portal_url ? (
            <LinkButton
              href={row.customer_portal_url}
              target="_blank"
              rel="noopener"
              variant="primary"
            >
              Cambiar tarjeta o cancelar ↗
            </LinkButton>
          ) : null}
          {access.needsCard && row?.update_payment_url ? (
            <LinkButton href={row.update_payment_url} target="_blank" rel="noopener" variant="primary">
              Actualizar tarjeta ↗
            </LinkButton>
          ) : null}
          {access.level !== 'full' && config.checkoutUrl ? (
            <LinkButton href={checkoutUrl} variant="primary">
              {access.level === 'none' ? 'Activar mi prueba' : 'Reactivar mi plan'}
            </LinkButton>
          ) : null}
          <LinkButton href={`mailto:${config.supportEmail}`} variant="secondary">
            Escribirnos
          </LinkButton>
        </div>
      </Card>

      <Card title="Cuenta">
        <p className="text-sm text-muted">
          Tus datos quedan en tu cuenta: si entrás desde otro celular o computadora con el mismo
          mail, vas a ver la misma agenda.
        </p>
        <div className="mt-4">
          <Button variant="danger" onClick={() => void signOut()}>
            Cerrar sesión
          </Button>
        </div>
      </Card>
    </div>
  )
}
