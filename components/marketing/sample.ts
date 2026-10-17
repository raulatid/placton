import { SERIES } from '@/components/ui'

// Marcas del ejemplo de la portada (bloques de funciones). Conocidas para que
// se entienda de un vistazo; las cifras son de ejemplo.

export interface SampleBrand {
  key: string
  name: string
  domain: string
  own: boolean
  direct: number
  indirect: number
  visibility: number
  position: number
  byEngine: Record<string, number>
  color: string
}

export const SAMPLE_BRANDS: SampleBrand[] = [
  {
    key: 'asana',
    name: 'Asana',
    domain: 'asana.com',
    own: true,
    direct: 215,
    indirect: 72,
    visibility: 41,
    position: 2.1,
    byEngine: { chatgpt: 52, claude: 44, google: 58, perplexity: 76, grok: 57 },
  },
  {
    key: 'notion',
    name: 'Notion',
    domain: 'notion.so',
    own: false,
    direct: 287,
    indirect: 35,
    visibility: 46,
    position: 1.8,
    byEngine: { chatgpt: 72, claude: 58, google: 61, perplexity: 67, grok: 64 },
  },
  {
    key: 'monday',
    name: 'monday.com',
    domain: 'monday.com',
    own: false,
    direct: 164,
    indirect: 25,
    visibility: 27,
    position: 3.2,
    byEngine: { chatgpt: 41, claude: 33, google: 37, perplexity: 40, grok: 38 },
  },
  {
    key: 'clickup',
    name: 'ClickUp',
    domain: 'clickup.com',
    own: false,
    direct: 118,
    indirect: 15,
    visibility: 19,
    position: 3.6,
    byEngine: { chatgpt: 29, claude: 24, google: 26, perplexity: 27, grok: 27 },
  },
  {
    key: 'trello',
    name: 'Trello',
    domain: 'trello.com',
    own: false,
    direct: 70,
    indirect: 7,
    visibility: 11,
    position: 4.4,
    byEngine: { chatgpt: 17, claude: 13, google: 16, perplexity: 16, grok: 15 },
  },
].map((b, i) => ({ ...b, color: SERIES[i] }))

export const OWN_BRAND = SAMPLE_BRANDS[0]
