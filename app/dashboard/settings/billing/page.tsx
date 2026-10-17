import type { Metadata } from 'next'
import { urlMessage } from '@/components/panel/format'
import { btnClass, ButtonLink, Card, CardHeader, fmtDate, Notice } from '@/components/ui'
import { canManage, requireCtx } from '@/lib/auth'
import { getT, pick } from '@/lib/i18n'
import { agencyQuote, euros, planName, PLANS, priceFor } from '@/lib/plans'
import * as repo from '@/lib/repo'
import { confirmCheckout, listInvoices, stripeMode } from '@/lib/stripe'
import { cancelSubscriptionAction, portalAction } from '../../actions'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT()
  return { title: t('Billing', 'Suscripción') }
}

export default async function SubscriptionPage({ searchParams }: { searchParams: Promise<{ pago?: string; cambio?: string; error?: string }> }) {
  const sp = await searchParams
  let { workspace: ws } = await requireCtx()
  const { role } = await requireCtx()
  const { lang, t } = await getT()
  // Un cliente de agencia ve la suscripción de la agencia que lo paga.
  const viewing = ws
  let paid = false
  const payerId = (repo.agencyOwnerOf(ws) ?? ws).id
  if (sp.pago) paid = await confirmCheckout(sp.pago, payerId)
  ws = repo.workspaceById(payerId) ?? ws
  // Se gestiona desde el espacio que paga (la agencia, en un cliente): el papel cuenta ahí.
  const payerRole = ws.id === viewing.id ? role : repo.roleIn(ws.id, (await requireCtx()).user.id)
  const manage = Boolean(payerRole && canManage(payerRole))
  const access = repo.accessOf(ws)
  const plan = PLANS[ws.plan]
  const agency = ws.plan === 'agencia'
  const used = agency ? repo.agencyPromptsUsed(ws.id) : repo.activePromptCount(viewing.id)
  const promptCap = agency ? ws.promptPool : plan.prompts
  const clientsUsed = agency ? repo.agencyClients(ws.id).length : 0
  const members = repo.membersOf(viewing.id).length
  const agencyPrice = agency ? agencyQuote(ws.seats, ws.promptPool, ws.billingInterval).total : 0
  const mode = stripeMode()
  const name = planName(ws.plan, lang)
  const invoices = manage ? await listInvoices(ws) : []

  return (
    <div className="space-y-4">
      {paid && (
        <Notice tone="good">
          {t(`Payment received. Your ${name} plan is now active. Thanks for choosing Placton.`, `Pago recibido. Tu plan ${name} ya está activo. Gracias por confiar en Placton.`)}
        </Notice>
      )}
      {sp.cambio && <Notice tone="good">{t('Plan changed. Stripe will prorate the difference on your next invoice.', 'Plan cambiado. Stripe prorratea la diferencia en tu próxima factura.')}</Notice>}
      {sp.error && <Notice tone="bad">{urlMessage(sp.error, lang)}</Notice>}
      {mode === 'test' && (
        <Notice tone="warn">
          {t(
            'Payments are in test mode: use card 4242 4242 4242 4242 with any future date and any CVC.',
            'Pagos en modo de prueba: usa la tarjeta 4242 4242 4242 4242 con cualquier fecha futura y cualquier CVC.',
          )}
        </Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader title={ws.plan === 'trial' ? t('Free trial', 'Prueba gratuita') : t(`${name} plan`, `Plan ${name}`)} hint={pick(plan.tagline, lang)} />
          <div className="space-y-4 px-6 pb-6">
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-[12px] font-semibold text-mute">{t('Status', 'Estado')}</dt>
                <dd className="font-bold">
                  {ws.plan === 'trial'
                    ? access.ok
                      ? t(`${repo.trialDaysLeft(ws)} days left`, `${repo.trialDaysLeft(ws)} días restantes`)
                      : t('Ended', 'Terminada')
                    : access.reason === 'past_due'
                      ? t('Payment pending', 'Pago pendiente')
                      : access.ok
                        ? ws.cancelAtPeriodEnd
                          ? t('Canceling', 'Se cancela')
                          : t('Active', 'Activa')
                        : t('Canceled', 'Cancelada')}
                </dd>
              </div>
              <div>
                <dt className="text-[12px] font-semibold text-mute">{t('Price', 'Precio')}</dt>
                <dd className="font-bold num">
                  {ws.plan === 'trial'
                    ? t('Free', 'Gratis')
                    : `${euros(agency ? agencyPrice : priceFor(ws.plan, ws.billingInterval), lang)}/${ws.billingInterval === 'year' ? t('year', 'año') : t('month', 'mes')}`}
                </dd>
              </div>
              <div>
                <dt className="text-[12px] font-semibold text-mute">Prompts</dt>
                <dd className="font-bold num">
                  {t(`${used} of ${promptCap}`, `${used} de ${promptCap}`)}
                </dd>
              </div>
              {agency ? (
                <div>
                  <dt className="text-[12px] font-semibold text-mute">{t('Client brands', 'Marcas cliente')}</dt>
                  <dd className="font-bold num">{t(`${clientsUsed} of ${ws.seats}`, `${clientsUsed} de ${ws.seats}`)}</dd>
                </div>
              ) : (
                <div>
                  <dt className="text-[12px] font-semibold text-mute">{t('Members', 'Miembros')}</dt>
                  <dd className="font-bold num">
                    {t(`${members} of ${plan.members ?? 'unlimited'}`, `${members} de ${plan.members ?? 'ilimitados'}`)}
                  </dd>
                </div>
              )}
            </dl>
            {ws.plan !== 'trial' && ws.currentPeriodEnd && (
              <p className="text-sm text-ink-2">
                {ws.cancelAtPeriodEnd ? t('Your plan ends on ', 'Tu plan termina el ') : t('Next renewal: ', 'Próxima renovación: ')}
                <strong>{fmtDate(ws.currentPeriodEnd, lang)}</strong>.
              </p>
            )}
            {ws.plan === 'trial' && ws.trialEndsAt && (
              <p className="text-sm text-ink-2">
                {access.ok ? t('The trial ends on ', 'La prueba termina el ') : t('The trial ended on ', 'La prueba terminó el ')}
                <strong>{fmtDate(ws.trialEndsAt, lang)}</strong>.{' '}
                {t("We won't charge you anything unless you choose a plan.", 'No te cobraremos nada si no eliges un plan.')}
              </p>
            )}
            {manage ? (
              <div className="flex flex-wrap gap-2">
                <ButtonLink href="/dashboard/plans">
                  {ws.plan === 'trial' || !access.ok ? t('Choose a plan', 'Elegir plan') : agency ? t('Change clients or prompts', 'Cambiar clientes o prompts') : t('Change plan', 'Cambiar de plan')}
                </ButtonLink>
                {ws.stripeCustomerId && (
                  <form action={portalAction}>
                    <button className={btnClass('secondary')}>{t('Invoices and payment method', 'Facturas y método de pago')}</button>
                  </form>
                )}
              </div>
            ) : (
              <p className="text-sm text-mute">{t('Only workspace admins can change the plan.', 'Solo quien administra el espacio puede cambiar el plan.')}</p>
            )}
          </div>
        </Card>

        {manage && ws.plan !== 'trial' && ws.stripeSubscriptionId && access.ok && (
          <Card>
            <CardHeader title={ws.cancelAtPeriodEnd ? t('Reactivate', 'Reactivar') : t('Cancel subscription', 'Cancelar suscripción')} />
            <div className="space-y-3 px-6 pb-6">
              <p className="text-sm text-ink-2">
                {ws.cancelAtPeriodEnd
                  ? t("Your plan won't renew. If you change your mind, reactivate it and everything stays as it is.", 'Tu plan dejará de renovarse. Si cambias de opinión, reactívalo y todo sigue igual.')
                  : t(
                      "You'll keep access until the end of the paid period. After that we'll stop tracking, but your data stays saved.",
                      'Seguirás teniendo acceso hasta el final del periodo pagado. Después dejaremos de medir, pero tus datos se quedan guardados.',
                    )}
              </p>
              <form action={cancelSubscriptionAction}>
                {ws.cancelAtPeriodEnd && <input type="hidden" name="undo" value="1" />}
                <button className={btnClass(ws.cancelAtPeriodEnd ? 'primary' : 'danger')}>{ws.cancelAtPeriodEnd ? t('Reactivate plan', 'Reactivar plan') : t('Cancel at the end of the period', 'Cancelar al final del periodo')}</button>
              </form>
            </div>
          </Card>
        )}
      </div>

      {invoices.length > 0 && (
        <Card>
          <CardHeader title={t('Invoices', 'Facturas')} hint={t('Issued automatically with every payment. Taxes are calculated from your billing country and VAT number.', 'Se emiten solas con cada cobro. Los impuestos se calculan según tu país de facturación y tu NIF-IVA.')} />
          <ul className="divide-y divide-line-2 border-t border-line-2">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 text-[14px]">
                <div className="min-w-0">
                  <div className="font-semibold text-ink num">{inv.number || t('Invoice', 'Factura')}</div>
                  <div className="text-[12.5px] text-mute">
                    {fmtDate(new Date(inv.date * 1000).toISOString(), lang)} ·{' '}
                    {inv.status === 'paid' ? t('Paid', 'Pagada') : inv.status === 'open' ? t('Pending', 'Pendiente') : inv.status === 'void' ? t('Voided', 'Anulada') : inv.status}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-bold text-ink num">{inv.total.toLocaleString(lang === 'es' ? 'es-ES' : 'en-US', { style: 'currency', currency: inv.currency.toUpperCase() })}</span>
                  {inv.pdf && (
                    <a href={inv.pdf} className="text-[13px] font-semibold text-ink-2 underline decoration-line underline-offset-4 hover:decoration-ink">
                      {t('Download PDF', 'Descargar PDF')}
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
