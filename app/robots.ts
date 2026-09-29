import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/supabase/config';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Nothing under /admin or the staff login is public; keep them out of every index.
        disallow: ['/admin', '/admin/', '/login', '/api/'],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
