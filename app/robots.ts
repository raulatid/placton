import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/email'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/dashboard', '/onboarding', '/admin', '/api/', '/invite', '/reset-password'] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  }
}
