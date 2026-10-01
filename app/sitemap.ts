import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/supabase/config';
import { getProducts } from '@/lib/shop-api';

/**
 * Nothing here is cached for long: a sitemap that lags a week behind the catalogue is how a new
 * product stays invisible to search for a week.
 */
export const revalidate = 3600;

/**
 * The sitemap.
 *
 * Previously a hand-written list of five routes, which meant **not one product page was in it** —
 * on a shop whose entire reason to be indexed is its catalogue. It now derives the product URLs
 * from the same query the storefront uses, so a product added in the console is advertised without
 * anyone remembering to edit this file.
 *
 * Only public pages belong here. `/account/*`, `/cart`, `/checkout`, `/track-order` and `/login`
 * are either personal or empty shells, and `/admin` is disallowed in robots.txt; listing any of
 * them would advertise a page that has nothing to rank for. The three routes that return 404
 * (`/about`, `/gallery`, `/reviews` are not pages in this app) are deliberately absent too — a
 * sitemap must never name a dead URL.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();

  const staticRoutes: Array<{
    path: string;
    priority: number;
    changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  }> = [
    { path: '/', priority: 1, changeFrequency: 'weekly' },
    { path: '/shop', priority: 0.95, changeFrequency: 'daily' },
    { path: '/services', priority: 0.9, changeFrequency: 'weekly' },
    { path: '/academy', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/portfolio', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/contact', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
  ];

  /*
    `getProducts` already degrades to an empty list rather than throwing, so a database that is
    unreachable while this runs costs the product URLs but does not fail the build — a sitemap
    missing its catalogue is bad, a build that will not start is worse.
  */
  const products = await getProducts({});
  const activeProducts = products.filter((product) => product.is_active);

  return [
    ...staticRoutes.map((route) => ({
      url: `${base}${route.path}`,
      lastModified: now,
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    })),
    ...activeProducts.map((product) => ({
      url: `${base}/shop/${product.slug}`,
      // The product's own timestamp, so a genuine edit is what moves the date.
      lastModified: product.updated_at ? new Date(product.updated_at) : now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ];
}
