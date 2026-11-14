import type { MetadataRoute } from 'next';
import { getSettings } from '@/lib/settings';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const entity = await getSettings('entity');
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/admin', '/dashboard', '/api'] },
    ],
    sitemap: `${entity.website.replace(/\/$/, '')}/sitemap.xml`,
  };
}
