import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/email'

// Páginas públicas de placton.tech (la app vive en app.placton.tech y no se indexa).
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl()
  const pages: { path: string; priority: number; freq: 'weekly' | 'monthly' | 'yearly' }[] = [
    { path: '', priority: 1, freq: 'weekly' },
    { path: '/pricing', priority: 0.9, freq: 'monthly' },
    { path: '/faqs', priority: 0.7, freq: 'monthly' },
    { path: '/contact', priority: 0.5, freq: 'yearly' },
    { path: '/terms', priority: 0.2, freq: 'yearly' },
    { path: '/privacy', priority: 0.2, freq: 'yearly' },
  ]
  return pages.map((p) => ({ url: `${base}${p.path}`, lastModified: new Date(), changeFrequency: p.freq, priority: p.priority }))
}
