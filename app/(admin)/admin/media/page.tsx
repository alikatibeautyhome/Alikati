import type { Metadata } from 'next';
import { MediaLibrary } from '@/components/admin/MediaLibrary';

export const metadata: Metadata = {
  title: 'Media library — Alikati Beauty Home',
};

/**
 * The admin media library.
 *
 * A thin server shell: everything interactive is in `MediaLibrary`, because the library is filters,
 * uploads and copy-to-clipboard, all of which need the browser.
 *
 * Distinct from `/admin/gallery`, which curates the photos shown on the public portfolio page. This
 * page is the catalogue of what has been uploaded — banners, product photos, logos, gallery images —
 * filed by category and reusable by URL. Payment QRs are intentionally not listed here; they are
 * managed where they are used, on the payment card in settings.
 */
export default function AdminMediaPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Content</p>
          <h1 className="mt-1 font-display text-2xl text-charcoal">Media library</h1>
          <p className="text-sm text-charcoal-soft">
            Everything you have uploaded, filed by category. Copy a URL to reuse it anywhere on the
            site.
          </p>
        </div>
      </div>

      <MediaLibrary />
    </div>
  );
}
