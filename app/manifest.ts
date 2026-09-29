import type { MetadataRoute } from 'next';

/**
 * Web app manifest — this is what makes "Add to Home Screen" produce a real app icon, a
 * standalone window with no browser chrome, and the brand splash colour.
 *
 * Icons are generated from the logo by `scripts/generate-pwa-icons.mjs`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Alikati Beauty Home — Salon & Shop',
    short_name: 'Alikati',
    description:
      'Book salon and bridal services, shop beauty products and follow the academy — from Alikati Beauty Home, Attariya Chowk, Kailali.',
    id: '/',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'portrait',
    background_color: '#FDFBF8',
    theme_color: '#D54167',
    lang: 'en',
    dir: 'ltr',
    categories: ['shopping', 'beauty', 'lifestyle'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Shop products', short_name: 'Shop', url: '/shop' },
      { name: 'Book a service', short_name: 'Book', url: '/services' },
      { name: 'My orders', short_name: 'Orders', url: '/account' },
      { name: 'Track an order', short_name: 'Track', url: '/track-order' },
    ],
  };
}
