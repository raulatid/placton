import 'server-only'
import { createHash } from 'node:crypto'
import { headers } from 'next/headers'
import { all, nowIso, one, run } from './db'
import type { Workspace } from './types'

// Freno a quien encadena pruebas gratis (cada una cuesta dinero en API):
// - como mucho 3 cuentas nuevas por conexión (IP) cada 24 horas;
// - una sola prueba por web: si otra cuenta ya probó ese dominio, la nueva
//   empieza sin prueba y tiene que elegir un plan.
// La IP no se guarda: solo su huella con un secreto, para poder contar.

const MAX_SIGNUPS_PER_IP_DAY = 3

/** IP real: la última entrada de X-Forwarded-For la pone el proxy de Railway; las anteriores las puede inventar quien llama. */
export function ipFrom(h: Headers): string {
  const chain = (h.get('x-forwarded-for') ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  return chain[chain.length - 1] || h.get('x-real-ip') || 'local'
}

export async function clientIp(): Promise<string> {
  return ipFrom(await headers())
}

export function ipHash(ip: string): string {
  return createHash('sha256').update(`${process.env.CRON_SECRET ?? 'placton'}:${ip}`).digest('hex').slice(0, 32)
}

export function signupAllowed(ip: string): boolean {
  if (ip === 'local') return true
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const n = one<{ n: number }>('SELECT COUNT(*) AS n FROM signup_log WHERE ipHash = ? AND createdAt > ?', [ipHash(ip), since])?.n ?? 0
  return n < MAX_SIGNUPS_PER_IP_DAY
}

export function recordSignup(ip: string) {
  run('INSERT INTO signup_log (ipHash, createdAt) VALUES (?, ?)', [ipHash(ip), nowIso()])
}

/** Dominio comparable: sin «www.», «m.» ni punto final. */
export function trialDomain(domain: string): string {
  return domain.toLowerCase().trim().replace(/\.$/, '').replace(/^(www|m)\./, '')
}

/** Apunta una prueba gratis como usada, para siempre (aunque luego se borre el espacio o la cuenta). */
export function recordTrial(ws: Workspace) {
  run('INSERT OR IGNORE INTO trial_log (workspaceId, userId, domain, createdAt) VALUES (?, ?, ?, ?)', [ws.id, ws.createdBy, trialDomain(ws.domain), nowIso()])
}

/** ¿Otra prueba (de cualquier cuenta, aunque ya no exista) usó esta web? */
export function domainTrialUsed(domain: string, exceptWorkspaceId: number): boolean {
  const d = trialDomain(domain)
  return Boolean(d && one('SELECT 1 AS x FROM trial_log WHERE domain = ? AND workspaceId <> ? LIMIT 1', [d, exceptWorkspaceId]))
}

/**
 * Por qué un espacio no estrena prueba gratis: «persona» si quien lo crea ya
 * usó una prueba, «web» si otra cuenta ya probó ese dominio. Cuenta también lo
 * borrado (registro permanente). Las cuentas de administración siempre la tienen.
 */
export function trialBlockReason(ws: Workspace): 'persona' | 'web' | null {
  if (ws.createdBy) {
    const creator = one<{ email: string; googleId: string | null }>('SELECT email, googleId FROM users WHERE id = ?', [ws.createdBy])
    const admins = (process.env.PLACTON_ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
    if (creator?.googleId && admins.includes(creator.email.toLowerCase())) return null
    if (one('SELECT 1 AS x FROM trial_log WHERE userId = ? AND workspaceId <> ? LIMIT 1', [ws.createdBy, ws.id])) return 'persona'
    if (
      all<{ id: number }>(
        "SELECT w.id FROM workspaces w JOIN members m ON m.workspaceId = w.id AND m.userId = ? AND m.role = 'owner' WHERE w.id <> ? AND w.onboarded = 1 AND w.billingOwnerId IS NULL LIMIT 1",
        [ws.createdBy, ws.id],
      ).length
    )
      return 'persona'
  }
  if (ws.domain && domainTrialUsed(ws.domain, ws.id)) return 'web'
  if (ws.domain && all<{ id: number }>('SELECT id FROM workspaces WHERE domain = ? AND id <> ? AND onboarded = 1 LIMIT 1', [ws.domain, ws.id]).length) return 'web'
  return null
}

export function trialAlreadyUsed(ws: Workspace): boolean {
  return trialBlockReason(ws) !== null
}

/* ───────────── Correos desechables ───────────── */

// Buzones de usar y tirar: con ellos cualquiera encadena pruebas gratis sin dar un
// correo de verdad. Lista integrada de los más usados (sin dependencias); vale
// también para sus subdominios (p. ej. «abc.mailinator.com»). Los alias de
// privacidad (Apple, DuckDuckGo, Firefox Relay, SimpleLogin) NO están: son de
// personas reales que reciben el correo.
const DISPOSABLE_DOMAINS = new Set(
  `
0-mail.com 0815.ru 0clickemail.com 10mail.org 10minemail.com 10minutemail.co.uk 10minutemail.com 10minutemail.de
10minutemail.net 10minutemail.org 1secmail.com 1secmail.net 1secmail.org 20minutemail.com 20minutemail.it
30minutemail.com 33mail.com 4warding.com 6paq.com 7tags.com 9ox.net a-bc.net afrobacon.com amilegit.com
anonbox.net anonymbox.com antichef.com antichef.net antispam.de any.pink armyspy.com beefmilk.com binkmail.com
bobmail.info bofthew.com brefmail.com bsnow.net bugmenot.com bumpymail.com burnermail.io byom.de
centermail.com centermail.net chammy.info chitthi.in cool.fr.nf correo.blogos.net courriel.fr.nf crazymailing.com
cuvox.de dayrep.com deadaddress.com deadspam.com despam.it despammed.com devnullmail.com dfgh.net discard.email
discardmail.com discardmail.de disposableaddress.com disposableemailaddresses.com disposableinbox.com dispose.it
disposeamail.com dispostable.com dodgeit.com dodgit.com dontreg.com dontsendmespam.de dropmail.me dump-email.info
dumpandjunk.com dumpmail.de dumpyemail.com e4ward.com easytrashmail.com einrot.com email60.com emailfake.com
emailgo.de emailias.com emailinfive.com emailisvalid.com emailnator.com emailondeck.com emailsensei.com
emailtemporanea.com emailtemporanea.net emailtemporar.ro emailtemporario.com.br emailthe.net emailtmp.com
emailwarden.com emailxfer.com emltmp.com ephemail.net esiix.com explodemail.com ezztt.com fakeinbox.com
fakemail.fr fakemail.net fakemailgenerator.com fakermail.com fastacura.com fexbox.org fexpost.com fextemp.com
filzmail.com fizmail.com fleckens.hu fr33mail.info frapmail.com garliclife.com get1mail.com get2mail.fr
getairmail.com getnada.com getonemail.com getonemail.net ghosttexter.de gishpuppy.com grr.la guerrillamail.biz
guerrillamail.com guerrillamail.de guerrillamail.info guerrillamail.net guerrillamail.org guerrillamailblock.com
gustr.com haltospam.com harakirimail.com hidemail.de hmamail.com hulapla.de ieatspam.eu ieatspam.info
imails.info inboxalias.com inboxbear.com inboxclean.com inboxclean.org inboxkitten.com incognitomail.com
incognitomail.org jetable.com jetable.fr.nf jetable.net jetable.org jnxjn.com jourrapide.com kasmail.com
klassmaster.com koszmail.pl kurzepost.de kzccv.com laafd.com letthemeatspam.com link2mail.net litedrop.com
lookugly.com lortemail.dk lroid.com mail-temp.com mail.gw mail.tm mail4trash.com mail7.io mailbox.in.ua
mailcatch.com maildrop.cc mailexpire.com mailforspam.com mailhazard.com mailin8r.com mailinater.com
mailinator.com mailinator.net mailinator.org mailinator2.com mailme24.com mailmetrash.com mailmoat.com
mailnesia.com mailnull.com mailpoof.com mailsac.com mailscrap.com mailslurp.com mailtemporaire.com
mailtemporaire.fr mailto.plus mailtothis.com mailtrash.net mailzilla.com mailzilla.org makemetheking.com
mbx.cc meltmail.com merepost.com messagebeamer.de mierdamail.com minuteinbox.com mintemail.com moakt.cc
moakt.com moakt.ws mohmal.com mohmal.im mohmal.in mohmal.tech moncourrier.fr.nf monemail.fr.nf monmail.fr.nf
mt2014.com mt2015.com mvrht.com mvrht.net mytemp.email mytempemail.com mytrashmail.com nada.email nada.ltd
netzidiot.de no-spam.ws nobulk.com noclickemail.com nogmailspam.info nomail.xl.cx nomail2me.com nospam.ze.tc
nospamfor.us notmailinator.com nowmymail.com nurfuerspam.de nwldx.com objectmail.com oneoffemail.com
onewaymail.com pjjkp.com pokemail.net politikerclub.de pookmail.com proxymail.eu punkass.com put2.net qiott.com
quickinbox.com rcpt.at reallymymail.com rhyta.com rmqkr.net rover.info rppkn.com rtrtr.com s0ny.net
safetymail.info schafmail.de selfdestructingmail.com sendspamhere.com sharklasers.com shiftmail.com shitmail.me
skeefmail.com slopsbox.com smailpro.com smashmail.de sneakemail.com snakemail.com sofimail.com sogetthis.com
soodonims.com spam.la spam.su spam4.me spamavert.com spambog.com spambog.de spambog.ru spambox.us spamcero.com
spamcorptastic.com spamday.com spamdecoy.net spamex.com spamfree24.com spamfree24.org spamgourmet.com
spamgourmet.net spamgourmet.org spamherelots.com spamhole.com spamify.com spaminator.de spamkill.info spaml.com
spamobox.com spamslicer.com spamspot.com spamthis.co.uk spamtrail.com speed.1s.fr spoofmail.de super-auswahl.de
superrito.com suremail.info teleworm.us tempail.com tempemail.co tempemail.net tempinbox.co.uk tempinbox.com
tempmail.com tempmail.de tempmail.dev tempmail.lol tempmail.net tempmail.ninja tempmail.plus tempmail.us.com
tempmailaddress.com tempmailo.com tempomail.fr temporary-mail.net temporaryemail.net temporaryforwarding.com
temporaryinbox.com temporarymail.com tempr.email temp-mail.io temp-mail.org temp-mail.ru thankyou2010.com
thanksnospam.info thisisnotmyrealemail.com throwam.com throwawayemailaddress.com throwawaymail.com tmail.ws
tmails.net tmpeml.com tmpmail.net tmpmail.org tradermail.info trash-mail.com trash-mail.de trash-me.com
trash2009.com trashdevil.com trashdevil.de trashemail.de trashinbox.com trashmail.at trashmail.com trashmail.de
trashmail.io trashmail.me trashmail.net trashmail.org trashmail.ws trashmailer.com trashymail.com trbvm.com
twinmail.de txcct.com tyldd.com uggsrock.com veryrealemail.com vjuum.com vomoto.com wegwerf-email.de
wegwerfemail.de wegwerfmail.de wegwerfmail.net wegwerfmail.org wh4f.org whyspam.me willselfdestruct.com
wuzup.net wwjmp.com xagloo.com xemaps.com xents.com xmaily.com xojxe.com xoxy.net yep.it yoggm.com yopmail.com
yopmail.fr yopmail.net yuurok.com zehnminutenmail.de zippymail.info zoaxe.com zoemail.org
`
    .split(/\s+/)
    .filter(Boolean),
)

/** ¿El correo es de un buzón desechable? Mira el dominio y todos sus dominios padre. */
export function isDisposableEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@').pop()?.replace(/\.$/, '') ?? ''
  const labels = domain.split('.').filter(Boolean)
  for (let i = 0; i < labels.length - 1; i++) if (DISPOSABLE_DOMAINS.has(labels.slice(i).join('.'))) return true
  return false
}

