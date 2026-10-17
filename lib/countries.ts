// Países en los que se puede medir: nombre guardado (en español), nombre en
// inglés, código ISO y código de ubicación de Google (DataForSEO). Se usa en el
// servidor y en los formularios, así que no lleva nada de servidor.

export interface Country {
  value: string
  en: string
  code: string
  google: number
  aliases?: string[]
}

export const COUNTRIES: Country[] = [
  { value: 'España', en: 'Spain', code: 'ES', google: 2724 },
  { value: 'Estados Unidos', en: 'United States', code: 'US', google: 2840, aliases: ['usa', 'us', 'eeuu', 'ee uu', 'united states of america', 'estados unidos de america'] },
  { value: 'Reino Unido', en: 'United Kingdom', code: 'GB', google: 2826, aliases: ['uk', 'gran bretana', 'great britain', 'england', 'inglaterra'] },
  { value: 'México', en: 'Mexico', code: 'MX', google: 2484 },
  { value: 'Argentina', en: 'Argentina', code: 'AR', google: 2032 },
  { value: 'Colombia', en: 'Colombia', code: 'CO', google: 2170 },
  { value: 'Chile', en: 'Chile', code: 'CL', google: 2152 },
  { value: 'Perú', en: 'Peru', code: 'PE', google: 2604 },
  { value: 'Uruguay', en: 'Uruguay', code: 'UY', google: 2858 },
  { value: 'Paraguay', en: 'Paraguay', code: 'PY', google: 2600 },
  { value: 'Bolivia', en: 'Bolivia', code: 'BO', google: 2068 },
  { value: 'Ecuador', en: 'Ecuador', code: 'EC', google: 2218 },
  { value: 'Venezuela', en: 'Venezuela', code: 'VE', google: 2862 },
  { value: 'Costa Rica', en: 'Costa Rica', code: 'CR', google: 2188 },
  { value: 'Panamá', en: 'Panama', code: 'PA', google: 2591 },
  { value: 'Guatemala', en: 'Guatemala', code: 'GT', google: 2320 },
  { value: 'República Dominicana', en: 'Dominican Republic', code: 'DO', google: 2214 },
  { value: 'Puerto Rico', en: 'Puerto Rico', code: 'PR', google: 2630 },
  { value: 'Canadá', en: 'Canada', code: 'CA', google: 2124 },
  { value: 'Australia', en: 'Australia', code: 'AU', google: 2036 },
  { value: 'Nueva Zelanda', en: 'New Zealand', code: 'NZ', google: 2554 },
  { value: 'Irlanda', en: 'Ireland', code: 'IE', google: 2372 },
  { value: 'Francia', en: 'France', code: 'FR', google: 2250 },
  { value: 'Alemania', en: 'Germany', code: 'DE', google: 2276 },
  { value: 'Italia', en: 'Italy', code: 'IT', google: 2380 },
  { value: 'Portugal', en: 'Portugal', code: 'PT', google: 2620 },
  { value: 'Países Bajos', en: 'Netherlands', code: 'NL', google: 2528, aliases: ['holanda', 'holland', 'the netherlands'] },
  { value: 'Bélgica', en: 'Belgium', code: 'BE', google: 2056 },
  { value: 'Suiza', en: 'Switzerland', code: 'CH', google: 2756 },
  { value: 'Austria', en: 'Austria', code: 'AT', google: 2040 },
  { value: 'Suecia', en: 'Sweden', code: 'SE', google: 2752 },
  { value: 'Dinamarca', en: 'Denmark', code: 'DK', google: 2208 },
  { value: 'Noruega', en: 'Norway', code: 'NO', google: 2578 },
  { value: 'Finlandia', en: 'Finland', code: 'FI', google: 2246 },
  { value: 'Polonia', en: 'Poland', code: 'PL', google: 2616 },
  { value: 'Brasil', en: 'Brazil', code: 'BR', google: 2076 },
  { value: 'India', en: 'India', code: 'IN', google: 2356 },
  { value: 'Singapur', en: 'Singapore', code: 'SG', google: 2702 },
  { value: 'Emiratos Árabes Unidos', en: 'United Arab Emirates', code: 'AE', google: 2784, aliases: ['uae', 'emiratos'] },
  { value: 'Sudáfrica', en: 'South Africa', code: 'ZA', google: 2710 },
]

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const INDEX = new Map<string, Country>()
for (const c of COUNTRIES) for (const k of [c.value, c.en, c.code, ...(c.aliases ?? [])]) INDEX.set(norm(k), c)

/** País de la lista a partir de lo que sea que se haya guardado (nombre en español o inglés, código, alias). */
export function findCountry(name: string | null | undefined): Country | null {
  return name ? (INDEX.get(norm(name)) ?? null) : null
}

/** Nombre canónico (en español) de un país, o null si no está en la lista. */
export function canonicalCountry(name: string | null | undefined): string | null {
  return findCountry(name)?.value ?? null
}

/** País más probable por el dominio (.es, .mx, .co.uk…) o, si no lo dice, por el idioma. */
export function countryFromDomain(domain: string, language = ''): string {
  const d = domain.toLowerCase()
  const tld = d.endsWith('.co.uk') || d.endsWith('.uk') ? 'gb' : (d.split('.').pop() ?? '')
  const hit = COUNTRIES.find((c) => c.code.toLowerCase() === tld)
  if (hit) return hit.value
  return language.startsWith('es') ? 'España' : 'Estados Unidos'
}
