import type { Metadata } from 'next'
import { libMessage } from '@/components/panel/format'
import { AgencyCalculator } from '@/components/AgencyCalculator'
import { PlanPicker } from '@/components/panel/PlanPicker'
import { Notice, PageHeader } from '@/components/ui'
import { canManage, requireCtx } from '@/lib/auth'
import { getT } from '@/lib/i18n'
import * as repo from '@/lib/repo'
import { stripeReady } from '@/lib/stripe'
import { checkoutAction } from '../actions'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT()
  return { title: t('Plans', 'Planes') }
}

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ error?: string; cancelado?: string }> }) {
  const sp = await searchParams
  const { workspace: ws, role } = await requireCtx()
  const { lang, t } = await getT()
  // Un cliente de agencia contrata y cambia a través del espacio que paga.
  const payer = repo.agencyOwnerOf(ws) ?? ws
  const access = repo.accessOf(payer)
  const current = payer.plan !== 'trial' && access.ok ? { plan: payer.plan, interval: payer.billingInterval } : null
  const agencyNow = payer.plan === 'agencia' && access.ok ? { clients: payer.seats, prompts: payer.promptPool } : null
  return (
    <>
      <PageHeader
        title={t('Choose your plan', 'Elige tu plan')}
        hint={
          access.reason === 'trial_ended'
            ? t(
                "Your trial has ended. Your data is still here: choose a plan and we'll start tracking again tomorrow.",
                'Tu prueba ha terminado. Tus datos siguen aquí: elige un plan y volvemos a medir mañana mismo.',
              )
            : t(
                'Every plan includes weekly tracking on all platforms, weekly insights and site audits. Change or cancel anytime.',
                'Todos los planes incluyen seguimiento semanal en todas las plataformas, ideas semanales y auditorías. Cambia o cancela cuando quieras.',
              )
        }
      />
      {sp.error && (
        <div className="mb-4">
          <Notice tone="bad">{sp.error === 'permiso' ? t('Only workspace admins can subscribe.', 'Solo quien administra el espacio puede contratar.') : libMessage(sp.error, lang)}</Notice>
        </div>
      )}
      {sp.cancelado && (
        <div className="mb-4">
          <Notice tone="info">{t("You left checkout without finishing. You haven't been charged.", 'Has salido del pago sin completarlo. No se ha cobrado nada.')}</Notice>
        </div>
      )}
      {!stripeReady() && (
        <div className="mb-4">
          <Notice tone="warn">
            {t(
              "Payments aren't configured in this environment yet (STRIPE_SECRET_KEY is missing).",
              'Los pagos todavía no están configurados en este entorno (falta STRIPE_SECRET_KEY).',
            )}
          </Notice>
        </div>
      )}
      {payer.plan !== 'agencia' && <PlanPicker action={checkoutAction} current={current} canBuy={canManage(role)} usedPrompts={repo.activePromptCount(ws.id)} />}
      <div className="anim-rise mt-6" style={{ '--i': 2 } as React.CSSProperties}>
        <AgencyCalculator
          mode="dashboard"
          action={checkoutAction}
          current={agencyNow}
          usedClients={payer.plan === 'agencia' ? repo.agencyClients(payer.id).length : 1}
          usedPrompts={payer.plan === 'agencia' ? repo.agencyPromptsUsed(payer.id) : repo.activePromptCount(ws.id)}
          canBuy={canManage(role)}
        />
      </div>
      <p className="mt-6 text-center text-[13px] text-mute">
        {t(
          'Secure payment with Stripe. Prices in US dollars; taxes may apply depending on your country. An invoice is issued with every charge.',
          'Pago seguro con Stripe. Precios en dólares (USD); pueden aplicarse impuestos según tu país. Factura en cada cobro.',
        )}
      </p>
    </>
  )
}
