/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Lint is run explicitly via `npm run lint`, not as a build gate.
  eslint: { ignoreDuringBuilds: true },

  images: {
    remotePatterns: [
      // Supabase Storage public CDN objects (your own product photography).
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.in' },
      // Supplier catalogue images imported by scripts/import-supplier-catalog.mjs.
      // Replace these with your own photography before launch — see the README.
      { protocol: 'https', hostname: 'colorpluscosmetics.com' },
      { protocol: 'https', hostname: 'www.colorpluscosmetics.com' },
      { protocol: 'https', hostname: 'welltencosmetic.com' },
      { protocol: 'https', hostname: 'www.welltencosmetic.com' },
    ],
    // SVG placeholders are used for seeded/demo media. Only trusted, repository-owned
    // assets should ever be served through this path.
    dangerouslyAllowSVG: true,
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
};

export default nextConfig;
