import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, Truck } from 'lucide-react';
import { getRelatedProducts, getProductBySlug } from '@/lib/shop-api';
import { getSalonSettings } from '@/lib/api';
import { AddToCartPanel } from '@/components/shop/AddToCartPanel';
import { ProductCard } from '@/components/shop/ProductCard';
import { productImageSrc, productImageSrcAbsolute } from '@/lib/product-image';
import { Badge } from '@/components/ui/badge';
import {
  isLowStock,
  isOutOfStock,
  productDiscountPercent,
  productPrice,
  stockLabel,
} from '@/lib/commerce';
import { cn, formatNPR } from '@/lib/utils';

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    return { title: 'Product not found', robots: { index: false, follow: true } };
  }

  const description =
    product.short_description ??
    product.description?.split(/\n\s*\n/)[0]?.trim() ??
    `${product.name} — available in NPR at Alikati Beauty Home, Attariya Chowk.`;

  return {
    title: product.name,
    description,
    alternates: { canonical: `/shop/${product.slug}` },
    openGraph: {
      title: product.name,
      description,
      // The processed image, as PNG: a shared product link then previews with the salon's mark on
      // it instead of the supplier's unbranded photograph and their watermark. PNG rather than the
      // default WebP because some social scrapers still will not render a WebP preview.
      images: [{ url: productImageSrcAbsolute(product.image_url), alt: product.name }],
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product || product.is_active === false) notFound();

  const [settings, related] = await Promise.all([
    getSalonSettings(),
    getRelatedProducts(product, 4),
  ]);

  const discount = productDiscountPercent(product);
  const price = productPrice(product);
  const imageSrc = productImageSrc(product.image_url);
  const outOfStock = isOutOfStock(product);
  const lowStock = isLowStock(product);

  const paragraphs = (product.description ?? '')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <div className="section pb-28 pt-8 lg:pb-20">
      <div className="container space-y-12">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-charcoal-soft">
          <Link href="/" className="hover:text-rose-gold">
            Home
          </Link>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
          <Link href="/shop" className="hover:text-rose-gold">
            Shop
          </Link>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
          <span className="min-w-0 break-words text-charcoal">{product.name}</span>
        </nav>

        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          {/* Square frame, square photos: `contain` fits them exactly, so nothing is cropped and
              the white canvas is the photo's own background. See ProductCard for why the colour
              is a literal white rather than `bg-white`. */}
          <div className="product-media relative aspect-square w-full overflow-hidden rounded-2xl border border-charcoal/10 bg-[#ffffff]">
            <Image
              src={imageSrc}
              alt={product.name}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              priority
              className="object-contain"
            />
            {discount !== null && (
              <span className="absolute left-4 top-4 rounded-full bg-sale px-3 py-1 text-sm font-semibold text-white shadow-soft">
                -{discount}%
              </span>
            )}
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              {product.brand && (
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-gold">
                  {product.brand}
                </p>
              )}
              <h1 className="break-words font-display text-3xl text-charcoal sm:text-4xl">
                {product.name}
              </h1>
              {product.category && (
                <Link
                  href={`/shop?category=${product.category.slug}`}
                  className="inline-block text-sm text-rose-gold hover:underline"
                >
                  {product.category.name}
                </Link>
              )}
            </div>

            <div className="flex flex-wrap items-baseline gap-3">
              {discount !== null ? (
                <>
                  <span className="text-base text-charcoal-soft line-through">
                    {formatNPR(product.price_npr)}
                  </span>
                  <span className="font-display text-3xl text-price">{formatNPR(price)}</span>
                </>
              ) : (
                <span className="font-display text-3xl text-price">{formatNPR(price)}</span>
              )}
            </div>

            <p
              className={cn(
                'text-sm font-medium',
                outOfStock ? 'text-danger' : lowStock ? 'text-warn' : 'text-success'
              )}
            >
              {stockLabel(product)}
            </p>

            {product.short_description && (
              <p className="text-charcoal-soft">{product.short_description}</p>
            )}

            {product.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {product.tags.map((tag) => (
                  <Badge key={tag} className="bg-blush-100 text-charcoal ring-blush-300">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            <AddToCartPanel product={product} whatsappNumber={settings.whatsapp_number} />

            {settings.delivery_note && (
              <div className="flex items-start gap-3 rounded-2xl bg-blush-50 p-4 text-sm text-charcoal-soft">
                <Truck className="mt-0.5 h-5 w-5 shrink-0 text-rose-gold" aria-hidden="true" />
                <p className="whitespace-pre-line">{settings.delivery_note}</p>
              </div>
            )}
          </div>
        </div>

        {paragraphs.length > 0 && (
          <section className="max-w-3xl space-y-4">
            <h2 className="font-display text-2xl text-charcoal">Product details</h2>
            {paragraphs.map((paragraph, index) => (
              <p key={index} className="text-charcoal-soft">
                {paragraph}
              </p>
            ))}
          </section>
        )}

        {related.length > 0 && (
          <section className="space-y-6">
            <h2 className="font-display text-2xl text-charcoal">You may also like</h2>
            <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
              {related.map((item) => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
