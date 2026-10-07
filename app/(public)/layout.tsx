import { getSalonSettings } from '@/lib/api';
import { siteUrl } from '@/lib/supabase/config';
import { AnnouncementBanner } from '@/components/public/AnnouncementBanner';
import { SiteHeader } from '@/components/public/SiteHeader';
import { SiteFooter } from '@/components/public/SiteFooter';
import { WhatsAppFloatingButton } from '@/components/public/WhatsAppFloatingButton';
import { CartProvider } from '@/components/shop/CartProvider';
import { WatermarkProvider } from '@/components/shop/WatermarkProvider';
import { watermarkConfigFromSettings } from '@/lib/watermark';
import { CookieConsent } from '@/components/site/CookieConsent';
import { TrafficBeacon } from '@/components/site/TrafficBeacon';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';
import { AuthProvider } from '@/components/account/AuthProvider';
import { serializeJsonLd } from '@/lib/security/json-ld';

/**
 * Public shell for the storefront and marketing site.
 *
 * Settings are read once, server-side, and shared with the header, footer, banner, the
 * floating WhatsApp button and the cart (which needs the shipping rules to show totals).
 * A settings-driven `BeautySalon` schema is emitted here so structured data always reflects
 * the real phone number and opening hours.
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSalonSettings();

  const businessSchema = {
    '@context': 'https://schema.org',
    '@type': 'BeautySalon',
    // A stable identifier, so other markup on the site can *reference* this business instead of
    // restating it and risking two conflicting descriptions of the same salon. The #salon fragment
    // is the convention Google's own local-business examples use.
    '@id': `${siteUrl()}/#salon`,
    name: 'Alikati Beauty Home',
    description:
      'Salon, bridal studio, beautician academy and beauty shop at Mahendranagar Road, Attariya Chowk, Kailali, Nepal.',
    url: siteUrl(),
    telephone: settings.phone,
    email: settings.email ?? undefined,
    image: `${siteUrl()}/media/og-image.png`,
    logo: `${siteUrl()}/media/logo.jpg`,
    sameAs: [settings.facebook_url, settings.instagram_url, settings.tiktok_url].filter(
      (url): url is string => Boolean(url)
    ),
    /*
      Was 'रूरू' — a doubled currency glyph, which is not a valid price range and conveyed nothing.
      This band is derived from the live catalogue rather than invented: across 68 active products
      the cheapest is रू 135 and the dearest रू 12,500.
    */
    priceRange: 'रू 135–12,500',
    currenciesAccepted: 'NPR',
    address: {
      '@type': 'PostalAddress',
      streetAddress: settings.address,
      addressLocality: 'Attariya Chowk',
      addressRegion: 'Kailali, Sudurpashchim',
      addressCountry: 'NP',
    },
    /*
      Coordinates verified against OpenStreetMap rather than accepted from the brief, which placed
      the salon roughly 1.8 km north of the town. Attariya, Kailali resolves to 28.8029, 80.5510.

      Note this is the settlement centroid, not the shop's front door — there is no geocoded record
      of Alikati Beauty Home itself. Confirm the exact pin from Google Maps and tighten these numbers,
      because a wrong coordinate in LocalBusiness markup sends people to the wrong place.
    */
    geo: {
      '@type': 'GeoCoordinates',
      latitude: 28.8029161,
      longitude: 80.5510167,
    },
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: [
          'Sunday',
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
        ],
        opens: settings.opening_time,
        closes: settings.closing_time,
      },
    ],
  };

  return (
    <CartProvider settings={settings}>
      {/* Customer session (optional — the storefront works fine without one). */}
      <AuthProvider>
        {settings.announcement_active && settings.announcement_text ? (
          <AnnouncementBanner settings={settings} />
        ) : null}

        <SiteHeader settings={settings} />

        {/* The product-image badge: the settings are read once here and handed to every card, so no
            card has to fetch anything of its own just to draw a logo. Scoped to the page content
            because that is the only place product imagery appears. */}
        <WatermarkProvider value={watermarkConfigFromSettings(settings)}>
          <main id="main-content">{children}</main>
        </WatermarkProvider>

        <SiteFooter settings={settings} />
        <WhatsAppFloatingButton settings={settings} />

        {/* Consent first, then the install offer: they share the bottom of the screen, and the
            install prompt stays hidden until a consent choice has been made. */}
        <CookieConsent enabled={settings.cookie_notice_enabled} text={settings.cookie_notice_text} />

        {/* Records a page view — but only once the visitor has accepted cookies, which is the
            promise the consent banner makes. Mounted here because this layout renders on every
            public page, and the public pages are exactly what is being measured. */}
        <TrafficBeacon />

        <InstallPrompt enabled={settings.app_prompt_enabled} text={settings.app_prompt_text} />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(businessSchema) }}
        />
      </AuthProvider>
    </CartProvider>
  );
}
