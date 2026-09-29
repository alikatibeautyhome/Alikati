/**
 * Demo-mode seed catalogue and in-memory order book.
 *
 * Used automatically whenever Supabase is not configured, so the storefront and the whole
 * admin panel can be reviewed — including placing orders and moving them through the
 * fulfilment pipeline — before a database exists. Nothing here is persisted.
 *
 * This mirrors the semantics of `place_order()` in SQL: prices come from the catalogue (not
 * the client), stock is validated and reserved, and shipping follows the settings threshold.
 */
import type {
  CustomerSummary,
  Order,
  OrderItem,
  OrderQuery,
  OrderStatus,
  PaymentMethod,
  Product,
  ProductCategory,
  ProductQuery,
  ShopKpis,
} from '@/types/commerce.types';
import type { SalonSettings } from '@/types/database.types';
import type {
  Affiliate,
  AffiliateApplication,
  AffiliateStatus,
  Coupon,
  CouponPreview,
  CouponQuery,
  DiscountType,
} from '@/types/marketing.types';
import { addDaysISO, effectivePrice, todayISO } from '@/lib/utils';
import { cartTotals, formatOrderReference, groupCustomers, isLowStock } from '@/lib/commerce';
import { demoDb } from '@/lib/demo-data';
import importedCatalog from '@/data/demo-catalog.json';

/* ------------------------------------------------------------- timestamps */

function iso(dayOffset: number, hour = 11, minute = 20): string {
  const date = addDaysISO(todayISO(), dayOffset);
  return `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;
}

/* ----------------------------------------------------------- categories */

const CATEGORY_IDS = [
  'cc00dd11-ee22-4f33-8a44-000000000001',
  'cc00dd11-ee22-4f33-8a44-000000000002',
  'cc00dd11-ee22-4f33-8a44-000000000003',
  'cc00dd11-ee22-4f33-8a44-000000000004',
  'cc00dd11-ee22-4f33-8a44-000000000005',
  'cc00dd11-ee22-4f33-8a44-000000000006',
] as const;

export const demoCategories: ProductCategory[] = [
  {
    id: CATEGORY_IDS[0], name: 'Skincare', slug: 'skincare',
    description: 'Serums, moisturisers, sunscreen and cleansers for daily routines.',
    image_url: '/media/placeholder-skin.svg', display_order: 1, is_active: true,
    created_at: iso(-120), updated_at: iso(-20),
  },
  {
    id: CATEGORY_IDS[1], name: 'Makeup', slug: 'makeup',
    description: 'Lipsticks, complexion, eye makeup and palettes used in our studio.',
    image_url: '/media/placeholder-makeup.svg', display_order: 2, is_active: true,
    created_at: iso(-120), updated_at: iso(-18),
  },
  {
    id: CATEGORY_IDS[2], name: 'Hair Care', slug: 'hair-care',
    description: 'Salon-grade shampoo, masks, serums and oils.',
    image_url: '/media/placeholder-hair.svg', display_order: 3, is_active: true,
    created_at: iso(-120), updated_at: iso(-15),
  },
  {
    id: CATEGORY_IDS[3], name: 'Nail Care', slug: 'nail-care',
    description: 'Gel polish, treatments and nail tools.',
    image_url: '/media/placeholder-nails.svg', display_order: 4, is_active: true,
    created_at: iso(-120), updated_at: iso(-12),
  },
  {
    id: CATEGORY_IDS[4], name: 'Fragrance', slug: 'fragrance',
    description: 'Eau de parfum and everyday body mists.',
    image_url: '/media/placeholder-product.svg', display_order: 5, is_active: true,
    created_at: iso(-120), updated_at: iso(-10),
  },
  {
    id: CATEGORY_IDS[5], name: 'Tools & Accessories', slug: 'tools-accessories',
    description: 'Brushes, styling tools and salon accessories.',
    image_url: '/media/placeholder-product.svg', display_order: 6, is_active: true,
    created_at: iso(-120), updated_at: iso(-9),
  },
];

/* ------------------------------------------------------------- products */

type ProductSeed = {
  n: string; name: string; slug: string; sku: string; cat: number;
  price: number; discount?: number | null; cost?: number | null;
  stock: number; low?: number; featured?: boolean; short: string; image: string;
  variantLabel?: string; options?: string[]; tags?: string[]; active?: boolean;
};

function makeProduct(s: ProductSeed): Product {
  return {
    id: `aa11bb22-cc33-4d44-8e55-0000000000${s.n}`,
    name: s.name,
    slug: s.slug,
    sku: s.sku,
    category_id: CATEGORY_IDS[s.cat],
    brand: 'Alikati',
    short_description: s.short,
    description: `${s.short}\n\nSold and used by the team at Alikati Beauty Home, Attariya Chowk. Store in a cool, dry place away from direct sunlight. Check the label for full ingredients before first use.`,
    price_npr: s.price,
    discount_price_npr: s.discount ?? null,
    cost_price_npr: s.cost ?? null,
    stock_qty: s.stock,
    low_stock_threshold: s.low ?? 5,
    image_url: s.image,
    images: [s.image],
    variant_label: s.variantLabel ?? null,
    variant_options: s.options ?? [],
    tags: s.tags ?? [],
    is_active: s.active ?? true,
    is_featured: s.featured ?? false,
    created_at: iso(-90),
    updated_at: iso(-4),
  };
}

const SEED_PRODUCTS: ProductSeed[] = [
  { n: '01', name: 'Radiance Vitamin C Serum 30ml', slug: 'radiance-vitamin-c-serum-30ml', sku: 'ABH-SK-001', cat: 0, price: 1850, cost: 980, stock: 24, featured: true, image: '/media/placeholder-skin.svg',
    short: '10% stabilised vitamin C to brighten dull skin and even out tone.', tags: ['brightening', 'day use'] },
  { n: '02', name: 'Hydrating Rose Face Mist 100ml', slug: 'hydrating-rose-face-mist-100ml', sku: 'ABH-SK-002', cat: 0, price: 950, discount: 799, cost: 460, stock: 3, featured: true, image: '/media/placeholder-skin.svg',
    short: 'Rose water and glycerin mist for a quick refresh through the day.', tags: ['hydration'] },
  { n: '03', name: 'Niacinamide 10% Serum 30ml', slug: 'niacinamide-10-serum-30ml', sku: 'ABH-SK-003', cat: 0, price: 1650, cost: 850, stock: 18, image: '/media/placeholder-skin.svg',
    short: 'Controls oil and minimises the look of pores over 8 weeks.', tags: ['oily skin', 'pores'] },
  { n: '04', name: 'Daily Sunscreen SPF50 PA+++ 50ml', slug: 'daily-sunscreen-spf50-50ml', sku: 'ABH-SK-004', cat: 0, price: 1250, cost: 640, stock: 0, image: '/media/placeholder-skin.svg',
    short: 'Lightweight, no white cast, made for humid Terai weather.', tags: ['spf', 'daily'] },
  { n: '05', name: 'Gentle Foaming Face Wash 150ml', slug: 'gentle-foaming-face-wash-150ml', sku: 'ABH-SK-005', cat: 0, price: 750, cost: 380, stock: 32, image: '/media/placeholder-skin.svg',
    short: 'Sulphate-free cleanser suitable for daily morning and evening use.', tags: ['cleanser'] },

  { n: '06', name: 'Velvet Matte Lipstick', slug: 'velvet-matte-lipstick', sku: 'ABH-MU-001', cat: 1, price: 950, cost: 420, stock: 40, featured: true, image: '/media/placeholder-makeup.svg',
    variantLabel: 'Shade', options: ['Rosewood', 'Coral', 'Brick', 'Plum'],
    short: 'Eight-hour matte colour with vitamin E, non-drying on Nepali skin tones.', tags: ['bestseller'] },
  { n: '07', name: 'Liquid Concealer', slug: 'liquid-concealer', sku: 'ABH-MU-002', cat: 1, price: 1100, discount: 899, cost: 520, stock: 15, image: '/media/placeholder-makeup.svg',
    variantLabel: 'Shade', options: ['Light', 'Medium', 'Tan', 'Deep'],
    short: 'Medium coverage with a natural finish for under-eyes and blemishes.' },
  { n: '08', name: 'HD Compact Powder', slug: 'hd-compact-powder', sku: 'ABH-MU-003', cat: 1, price: 1350, cost: 600, stock: 12, image: '/media/placeholder-makeup.svg',
    short: 'Blurring pressed powder that holds up through long wedding functions.' },
  { n: '09', name: 'Kajal & Eyeliner Duo', slug: 'kajal-eyeliner-duo', sku: 'ABH-MU-004', cat: 1, price: 650, cost: 260, stock: 26, image: '/media/placeholder-makeup.svg',
    short: 'Smudge-proof kajal plus a fine-tip liner, tested for humid weather.' },
  { n: '10', name: 'Bridal Glow Palette', slug: 'bridal-glow-palette', sku: 'ABH-MU-005', cat: 1, price: 3200, discount: 2750, cost: 1500, stock: 6, featured: true, image: '/media/placeholder-makeup.svg',
    short: 'Highlighter, blush and bronzer trio used in our signature bridal look.' },

  { n: '11', name: 'Argan Repair Shampoo 300ml', slug: 'argan-repair-shampoo-300ml', sku: 'ABH-HR-001', cat: 2, price: 1450, cost: 780, stock: 22, featured: true, image: '/media/placeholder-hair.svg',
    short: 'Sulphate-free repair shampoo for chemically treated and coloured hair.' },
  { n: '12', name: 'Deep Conditioning Hair Mask 250g', slug: 'deep-conditioning-hair-mask-250g', sku: 'ABH-HR-002', cat: 2, price: 1750, cost: 900, stock: 14, image: '/media/placeholder-hair.svg',
    short: 'Weekly protein mask that pairs with our in-salon hair spa.' },
  { n: '13', name: 'Anti-Frizz Hair Serum 100ml', slug: 'anti-frizz-hair-serum-100ml', sku: 'ABH-HR-003', cat: 2, price: 1350, cost: 700, stock: 9, low: 10, image: '/media/placeholder-hair.svg',
    short: 'Lightweight serum for humidity control between keratin appointments.' },
  { n: '14', name: 'Hair Growth Oil 200ml', slug: 'hair-growth-oil-200ml', sku: 'ABH-HR-004', cat: 2, price: 1150, cost: 560, stock: 30, image: '/media/placeholder-hair.svg',
    short: 'Ayurvedic blend of bhringraj, amla and coconut for scalp massage.' },

  { n: '15', name: 'Gel Nail Polish Set (6 shades)', slug: 'gel-nail-polish-set-6', sku: 'ABH-NL-001', cat: 3, price: 2200, cost: 1100, stock: 8, image: '/media/placeholder-nails.svg',
    short: 'Six salon shades that cure under a standard UV lamp.' },
  { n: '16', name: 'Cuticle Oil Pen', slug: 'cuticle-oil-pen', sku: 'ABH-NL-002', cat: 3, price: 450, cost: 180, stock: 45, image: '/media/placeholder-nails.svg',
    short: 'Jojoba and vitamin E pen for aftercare between nail appointments.' },

  { n: '17', name: 'Rose Oud Eau de Parfum 50ml', slug: 'rose-oud-eau-de-parfum-50ml', sku: 'ABH-FR-001', cat: 4, price: 4500, cost: 2400, stock: 7, featured: true, image: '/media/placeholder-product.svg',
    short: 'Long-wear festive scent — rose, saffron and oud.', tags: ['gifting'] },
  { n: '18', name: 'Jasmine Body Mist 200ml', slug: 'jasmine-body-mist-200ml', sku: 'ABH-FR-002', cat: 4, price: 1250, cost: 600, stock: 20, image: '/media/placeholder-product.svg',
    short: 'Fresh everyday mist, light enough for salon use all day.' },

  { n: '19', name: 'Professional Makeup Brush Set (12)', slug: 'professional-makeup-brush-set-12', sku: 'ABH-TL-001', cat: 5, price: 3800, cost: 1900, stock: 5, image: '/media/placeholder-product.svg',
    short: 'Synthetic 12-piece set with a travel case — the same set we train with.' },
  { n: '20', name: 'Heatless Curling Set', slug: 'heatless-curling-set', sku: 'ABH-TL-002', cat: 5, price: 850, cost: 380, stock: 16, image: '/media/placeholder-product.svg',
    short: 'Silk rod and scrunchies for overnight curls without heat damage.' },

  { n: '21', name: 'Party Glitter Kit (Retired)', slug: 'party-glitter-kit', sku: 'ABH-TL-003', cat: 5, price: 1500, cost: 700, stock: 4, image: '/media/placeholder-product.svg',
    short: 'Discontinued festive glitter kit — kept for order history.', active: false },
];

/* --------------------------------------------------------------- orders */

type OrderSeed = {
  n: string; day: number; status: OrderStatus; name: string; phone: string;
  city: string; address: string; method: PaymentMethod; paid?: boolean;
  lines: Array<{ p: string; qty: number; variant?: string }>;
};

const SEED_ORDERS: OrderSeed[] = [
  { n: '01', day: 0, status: 'pending', name: 'Sita Joshi', phone: '9812345611', city: 'Attariya',
    address: 'Ward 4, near Attariya Chowk, Kailali', method: 'cod',
    lines: [{ p: '06', qty: 2, variant: 'Rosewood' }, { p: '02', qty: 1 }] },
  { n: '02', day: 0, status: 'confirmed', name: 'Anita Pant', phone: '9812345612', city: 'Dhangadhi',
    address: 'Bhanu Chowk, Ward 3, Kailali', method: 'esewa', paid: true,
    lines: [{ p: '10', qty: 1 }, { p: '07', qty: 1, variant: 'Medium' }] },
  { n: '03', day: -1, status: 'packed', name: 'Mina Rana', phone: '9812345613', city: 'Attariya',
    address: 'Mahendranagar Road, Ward 6', method: 'cod',
    lines: [{ p: '11', qty: 1 }, { p: '12', qty: 1 }] },
  { n: '04', day: -2, status: 'shipped', name: 'Bimala Shah', phone: '9812345614', city: 'Tikapur',
    address: 'Tikapur Bazaar, Ward 2', method: 'bank_transfer', paid: true,
    lines: [{ p: '17', qty: 1 }, { p: '16', qty: 2 }] },
  { n: '05', day: -4, status: 'delivered', name: 'Sarita Kumari', phone: '9812345615', city: 'Mahendranagar',
    address: 'Bhansar Road, Ward 8', method: 'cod', paid: true,
    lines: [{ p: '01', qty: 1 }, { p: '05', qty: 2 }] },
  { n: '06', day: -6, status: 'delivered', name: 'Deepa Bhandari', phone: '9812345617', city: 'Godawari',
    address: 'Godawari Chowk, Ward 1', method: 'cod', paid: true,
    lines: [{ p: '19', qty: 1 }] },
  { n: '07', day: -8, status: 'cancelled', name: 'Kamala Rana', phone: '9812345618', city: 'Attariya',
    address: 'Ward 5, Attariya', method: 'cod',
    lines: [{ p: '04', qty: 1 }], },
];

function buildOrders(products: Product[], settings: SalonSettings): Order[] {
  return SEED_ORDERS.map((seed) => {
    const items: OrderItem[] = seed.lines
      .map((line, index): OrderItem | null => {
        const product = products.find((p) => p.id.endsWith(line.p));
        if (!product) return null;
        const unit = effectivePrice(product);
        return {
          id: `bb22cc33-dd44-4e55-9f66-0000${seed.n}000${index}`,
          order_id: `ee11ff22-aa33-4b44-8c55-0000000000${seed.n}`,
          product_id: product.id,
          product_name: product.name,
          product_slug: product.slug,
          image_url: product.image_url,
          variant: line.variant ?? null,
          unit_price_npr: unit,
          quantity: line.qty,
          line_total_npr: unit * line.qty,
          created_at: iso(seed.day),
        };
      })
      .filter((item): item is OrderItem => item !== null);

    const totals = cartTotals(
      items.map((item) => ({
        product_id: item.product_id ?? '',
        slug: item.product_slug ?? '',
        name: item.product_name,
        image_url: item.image_url,
        unit_price_npr: item.unit_price_npr,
        quantity: item.quantity,
        variant: item.variant,
        stock_qty: 0,
      })),
      settings
    );

    return {
      id: `ee11ff22-aa33-4b44-8c55-0000000000${seed.n}`,
      reference: formatOrderReference(`ee11ff22-aa33-4b44-8c55-0000000000${seed.n}`),
      customer_name: seed.name,
      customer_phone: seed.phone,
      customer_email: null,
      delivery_address: seed.address,
      delivery_city: seed.city,
      delivery_landmark: null,
      notes: null,
      status: seed.status,
      payment_method: seed.method,
      payment_status: seed.paid ? 'paid' : 'unpaid',
      subtotal_npr: totals.subtotal,
      shipping_npr: totals.shipping,
      total_npr: totals.total,
      created_at: iso(seed.day, 10 + Number(seed.n), 15),
      updated_at: iso(seed.day, 12, 30),
      items,
    } satisfies Order;
  });
}

/* ---------------------------------------------------------------- store */

export const demoCommerceStore = {
  categories: demoCategories as ProductCategory[],
  products: SEED_PRODUCTS.map(makeProduct) as Product[],
  orders: [] as Order[],
  coupons: [] as Coupon[],
  affiliates: [] as Affiliate[],
};

/* ── Coupons & affiliates ─────────────────────────────────────────────────────
   Seeded so the whole discount and referral path can be exercised in demo mode, including the
   failure cases (an expired code, a code below its minimum spend, a pending affiliate). */
const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

demoCommerceStore.coupons = (
  [
    {
      code: 'WELCOME10',
      description: 'First order — 10% off, up to रू 500',
      discount_type: 'percent',
      discount_value: 10,
      min_order_npr: 1000,
      max_discount_npr: 500,
      usage_limit: null,
      used_count: 34,
      per_customer_limit: 1,
      starts_at: null,
      ends_at: null,
      is_active: true,
    },
    {
      code: 'DASHAIN20',
      description: 'Dashain & Tihar festival offer — 20% off, up to रू 1,500',
      discount_type: 'percent',
      discount_value: 20,
      min_order_npr: 2500,
      max_discount_npr: 1500,
      usage_limit: 100,
      used_count: 12,
      per_customer_limit: 1,
      starts_at: daysFromNow(-5),
      ends_at: daysFromNow(20),
      is_active: true,
    },
    {
      code: 'FLAT200',
      description: 'रू 200 off orders over रू 1,500',
      discount_type: 'fixed',
      discount_value: 200,
      min_order_npr: 1500,
      max_discount_npr: null,
      usage_limit: null,
      used_count: 8,
      per_customer_limit: 2,
      starts_at: null,
      ends_at: null,
      is_active: true,
    },
    {
      code: 'FREESHIP',
      description: 'Delivery on us — रू 150 off',
      discount_type: 'fixed',
      discount_value: 150,
      min_order_npr: 2000,
      max_discount_npr: null,
      usage_limit: 200,
      used_count: 47,
      per_customer_limit: 1,
      starts_at: null,
      ends_at: daysFromNow(45),
      is_active: true,
    },
    {
      code: 'TIHAR5',
      description: 'Ended — kept so the expired-code path stays testable',
      discount_type: 'percent',
      discount_value: 5,
      min_order_npr: 1000,
      max_discount_npr: null,
      usage_limit: null,
      used_count: 3,
      per_customer_limit: 1,
      starts_at: daysFromNow(-40),
      ends_at: daysFromNow(-5),
      is_active: false,
    },
  ] as Omit<Coupon, 'id' | 'created_at' | 'updated_at'>[]
).map((coupon, index) => ({
  ...coupon,
  id: `demo-coupon-${index + 1}`,
  created_at: daysFromNow(-30),
  updated_at: daysFromNow(-2),
}));

demoCommerceStore.affiliates = (
  [
    { name: 'Sita Joshi', phone: '9812345601', email: 'sita.joshi@example.com', code: 'SITAJ-8A', commission_rate: 8, status: 'active', total_earned_npr: 4820, total_paid_npr: 3000, payout_notes: 'Paid रू 3,000 by eSewa on 12 Bhadra.' },
    { name: 'Kamala Bhandari', phone: '9846012345', email: 'kamala.b@example.com', code: 'KAMALAB-10', commission_rate: 10, status: 'active', total_earned_npr: 7150, total_paid_npr: 0, payout_notes: null },
    { name: 'Anita Pant', phone: '9807654321', email: null, code: 'ANITAP-5B', commission_rate: 5, status: 'active', total_earned_npr: 1240, total_paid_npr: 1240, payout_notes: 'Settled in full.' },
    // Socials deliberately left null rather than invented: any plausible Instagram or TikTok URL
    // points at a real stranger's profile. Apply through /affiliate in demo mode and the accounts
    // you enter are stored, which exercises the same review flow honestly.
    {
      name: 'Mina Rana', phone: '9861234567', email: 'mina.rana@example.com', code: 'MINAR-5C',
      commission_rate: 5, status: 'pending', total_earned_npr: 0, total_paid_npr: 0, payout_notes: null,
      facebook_url: null, instagram_url: null, tiktok_url: null,
    },
  ] as Omit<Affiliate, 'id' | 'created_at' | 'updated_at'>[]
).map((affiliate, index) => ({
  ...affiliate,
  id: `demo-affiliate-${index + 1}`,
  created_at: daysFromNow(-20 - index * 4),
  updated_at: daysFromNow(-3),
}));

/* ── Supplier catalogue ──────────────────────────────────────────────────────
   Products imported from colorpluscosmetics.com (WooCommerce Store API) and
   welltencosmetic.com (OpenCart) by `scripts/import-supplier-catalog.mjs`.

   The full catalogue lives in `data/imported-catalog.json` and `supabase/seed-catalog.sql`;
   only a slice is bundled here (`data/demo-catalog.json`) so the browser payload stays small.
   Regenerate both with `npm run import:catalog`.
   ─────────────────────────────────────────────────────────────────────────── */

/** Deterministic id for an imported category (demo mode only — no crypto dependency). */
function importedCategoryId(slug: string): string {
  return `imported-category-${slug}`;
}

function mergeImportedCatalog() {
  const categorySeeds = importedCatalog.categories ?? [];
  const productSeeds = importedCatalog.products ?? [];

  for (const seed of categorySeeds) {
    if (demoCommerceStore.categories.some((category) => category.slug === seed.slug)) continue;

    demoCommerceStore.categories.push({
      id: importedCategoryId(seed.slug),
      name: seed.name,
      slug: seed.slug,
      description: seed.description ?? null,
      image_url: seed.image_url ?? null,
      display_order: seed.display_order ?? demoCommerceStore.categories.length + 1,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } satisfies ProductCategory);
  }

  const categoryIdBySlug = new Map(
    demoCommerceStore.categories.map((category) => [category.slug, category.id])
  );
  const existingSlugs = new Set(demoCommerceStore.products.map((product) => product.slug));

  productSeeds.forEach((seed, index) => {
    // Never shadow a hand-written demo product of the same slug.
    if (existingSlugs.has(seed.slug)) return;

    demoCommerceStore.products.push({
      id: seed.id,
      name: seed.name,
      slug: seed.slug,
      sku: seed.sku ?? null,
      category_id: categoryIdBySlug.get(seed.category_slug) ?? null,
      brand: seed.brand ?? null,
      short_description: seed.short_description ?? null,
      description: seed.description ?? null,
      price_npr: seed.price,
      discount_price_npr: seed.discount_price ?? null,
      cost_price_npr: null,
      // Imported listings rarely expose real quantities; assume a sellable stock level.
      stock_qty: seed.in_stock ? (seed.stock_qty ?? 25) : 0,
      low_stock_threshold: 5,
      image_url: seed.images?.[0] ?? null,
      images: seed.images ?? [],
      variant_label: seed.variant_label ?? null,
      variant_options: seed.variant_options ?? [],
      tags: [...(seed.tags ?? []), seed.source.replace('.com', '')].slice(0, 8),
      is_active: true,
      is_featured: index % 9 === 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } satisfies Product);
  });
}

mergeImportedCatalog();

demoCommerceStore.orders = buildOrders(demoCommerceStore.products, demoDb.getSettings());

/* ------------------------------------------------------------ operations */

function decorate(product: Product): Product {
  const category = demoCommerceStore.categories.find((c) => c.id === product.category_id);
  return category
    ? { ...product, category: { id: category.id, name: category.name, slug: category.slug } }
    : product;
}

export const demoCommerceDb = {
  /* ---------------------------------------------------------- categories */
  getCategories: (includeInactive = false): ProductCategory[] =>
    (includeInactive ? [...demoCommerceStore.categories] : demoCommerceStore.categories.filter((c) => c.is_active))
      .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name)),

  getCategoryBySlug: (slug: string): ProductCategory | null =>
    demoCommerceStore.categories.find((c) => c.slug === slug) ?? null,

  upsertCategory: (input: Partial<ProductCategory> & { name: string; slug: string }): ProductCategory => {
    const existing = input.id ? demoCommerceStore.categories.find((c) => c.id === input.id) : undefined;

    if (existing) {
      const merged = { ...existing, ...input, updated_at: new Date().toISOString() } as ProductCategory;
      demoCommerceStore.categories = demoCommerceStore.categories.map((c) => (c.id === merged.id ? merged : c));
      return merged;
    }

    const created: ProductCategory = {
      id: input.id ?? crypto.randomUUID(),
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      image_url: input.image_url ?? null,
      display_order: input.display_order ?? demoCommerceStore.categories.length + 1,
      is_active: input.is_active ?? true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    demoCommerceStore.categories = [...demoCommerceStore.categories, created];
    return created;
  },

  deleteCategory: (id: string): void => {
    demoCommerceStore.categories = demoCommerceStore.categories.filter((c) => c.id !== id);
    // Mirrors ON DELETE SET NULL on products.category_id.
    demoCommerceStore.products = demoCommerceStore.products.map((p) =>
      p.category_id === id ? { ...p, category_id: null } : p
    );
  },

  /* ------------------------------------------------------------- products */
  getProducts: (query: ProductQuery = {}): Product[] => {
    const { includeInactive = false, categorySlug, search, featuredOnly, sort = 'newest', inStockOnly, limit } = query;

    let rows = includeInactive
      ? [...demoCommerceStore.products]
      : demoCommerceStore.products.filter((p) => p.is_active);

    if (categorySlug) {
      const category = demoCommerceStore.categories.find((c) => c.slug === categorySlug);
      rows = rows.filter((p) => (category ? p.category_id === category.id : false));
    }
    if (featuredOnly) rows = rows.filter((p) => p.is_featured);
    if (inStockOnly) rows = rows.filter((p) => p.stock_qty > 0);
    if (search) {
      const needle = search.trim().toLowerCase();
      rows = rows.filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          (p.brand ?? '').toLowerCase().includes(needle) ||
          (p.short_description ?? '').toLowerCase().includes(needle) ||
          p.tags.some((t) => t.toLowerCase().includes(needle))
      );
    }

    rows.sort((a, b) => {
      switch (sort) {
        case 'price-asc':
          return effectivePrice(a) - effectivePrice(b);
        case 'price-desc':
          return effectivePrice(b) - effectivePrice(a);
        case 'name':
          return a.name.localeCompare(b.name);
        default:
          return b.created_at.localeCompare(a.created_at) || a.name.localeCompare(b.name);
      }
    });

    const decorated = rows.map(decorate);
    return typeof limit === 'number' ? decorated.slice(0, limit) : decorated;
  },

  getProductBySlug: (slug: string): Product | null => {
    const found = demoCommerceStore.products.find((p) => p.slug === slug);
    return found ? decorate(found) : null;
  },

  getProductById: (id: string): Product | null => {
    const found = demoCommerceStore.products.find((p) => p.id === id);
    return found ? decorate(found) : null;
  },

  getRelatedProducts: (product: Product, limit = 4): Product[] =>
    demoCommerceStore.products
      .filter((p) => p.is_active && p.category_id === product.category_id && p.id !== product.id)
      .slice(0, limit)
      .map(decorate),

  upsertProduct: (input: Partial<Product> & { name: string; slug: string }): Product => {
    const existing = input.id ? demoCommerceStore.products.find((p) => p.id === input.id) : undefined;

    if (existing) {
      const merged = { ...existing, ...input, updated_at: new Date().toISOString() } as Product;
      demoCommerceStore.products = demoCommerceStore.products.map((p) => (p.id === merged.id ? merged : p));
      return decorate(merged);
    }

    const created: Product = {
      id: input.id ?? crypto.randomUUID(),
      name: input.name,
      slug: input.slug,
      sku: input.sku ?? null,
      category_id: input.category_id ?? null,
      brand: input.brand ?? 'Alikati',
      short_description: input.short_description ?? null,
      description: input.description ?? null,
      price_npr: input.price_npr ?? 0,
      discount_price_npr: input.discount_price_npr ?? null,
      cost_price_npr: input.cost_price_npr ?? null,
      stock_qty: input.stock_qty ?? 0,
      low_stock_threshold: input.low_stock_threshold ?? 5,
      image_url: input.image_url ?? null,
      images: input.images ?? [],
      variant_label: input.variant_label ?? null,
      variant_options: input.variant_options ?? [],
      tags: input.tags ?? [],
      is_active: input.is_active ?? true,
      is_featured: input.is_featured ?? false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    demoCommerceStore.products = [created, ...demoCommerceStore.products];
    return decorate(created);
  },

  updateProduct: (id: string, patch: Partial<Product>): Product => {
    demoCommerceStore.products = demoCommerceStore.products.map((p) =>
      p.id === id ? { ...p, ...patch, updated_at: new Date().toISOString() } : p
    );
    return decorate(demoCommerceStore.products.find((p) => p.id === id)!);
  },

  adjustStock: (id: string, delta: number): Product => {
    const current = demoCommerceStore.products.find((p) => p.id === id);
    const next = Math.max(0, (current?.stock_qty ?? 0) + delta);
    return demoCommerceDb.updateProduct(id, { stock_qty: next });
  },

  deleteProduct: (id: string): void => {
    demoCommerceStore.products = demoCommerceStore.products.filter((p) => p.id !== id);
  },

  /* --------------------------------------------------------------- orders */
  getOrders: (query: OrderQuery = {}): Order[] => {
    const { status, search, from, to } = query;

    let rows = [...demoCommerceStore.orders];
    if (status) rows = rows.filter((o) => o.status === status);
    if (from) rows = rows.filter((o) => o.created_at.slice(0, 10) >= from);
    if (to) rows = rows.filter((o) => o.created_at.slice(0, 10) <= to);
    if (search) {
      const needle = search.trim().toLowerCase();
      rows = rows.filter(
        (o) =>
          o.reference.toLowerCase().includes(needle) ||
          o.customer_name.toLowerCase().includes(needle) ||
          o.customer_phone.includes(needle)
      );
    }

    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  getOrderById: (id: string): Order | null =>
    demoCommerceStore.orders.find((o) => o.id === id) ?? null,

  getOrderByReference: (reference: string): Order | null =>
    demoCommerceStore.orders.find((o) => o.reference.toLowerCase() === reference.toLowerCase()) ?? null,

  updateOrderStatus: (id: string, status: OrderStatus): Order => {
    const order = demoCommerceStore.orders.find((o) => o.id === id);
    if (!order) throw new Error('Order not found.');

    // Mirrors cancel_order(): cancelling returns the reserved stock to the catalogue.
    if (status === 'cancelled' && order.status !== 'cancelled') {
      for (const item of order.items ?? []) {
        if (item.product_id) demoCommerceDb.adjustStock(item.product_id, item.quantity);
      }
    }

    const updated: Order = {
      ...order,
      status,
      updated_at: new Date().toISOString(),
      payment_status: status === 'delivered' && order.payment_method === 'cod' ? 'paid' : order.payment_status,
    };
    demoCommerceStore.orders = demoCommerceStore.orders.map((o) => (o.id === id ? updated : o));
    return updated;
  },

  updateOrder: (id: string, patch: Partial<Order>): Order => {
    const updated = { ...demoCommerceStore.orders.find((o) => o.id === id)!, ...patch, updated_at: new Date().toISOString() };
    demoCommerceStore.orders = demoCommerceStore.orders.map((o) => (o.id === id ? updated : o));
    return updated;
  },

  /** Mirrors `place_order()`: authoritative pricing, stock validation and reservation. */
  createOrder: (input: {
    customer_name: string;
    customer_phone: string;
    customer_email?: string | null;
    delivery_address: string;
    delivery_city: string;
    delivery_landmark?: string | null;
    notes?: string | null;
    payment_method: PaymentMethod;
    items: Array<{ product_id: string; quantity: number; variant?: string | null }>;
    coupon_code?: string | null;
    affiliate_code?: string | null;
    customer_id?: string | null;
    payment_reference?: string | null;
    payment_proof_url?: string | null;
  }): Order => {
    const settings = demoDb.getSettings();

    const lines = input.items.map((line) => {
      const product = demoCommerceStore.products.find((p) => p.id === line.product_id);
      if (!product) throw new Error(`PRODUCT_NOT_FOUND`);
      if (!product.is_active) throw new Error(`PRODUCT_INACTIVE:${product.name}`);
      if (product.stock_qty < line.quantity) throw new Error(`INSUFFICIENT_STOCK:${product.name}`);
      return { product, quantity: line.quantity, variant: line.variant ?? null };
    });

    const totals = cartTotals(
      lines.map(({ product, quantity, variant }) => ({
        product_id: product.id,
        slug: product.slug,
        name: product.name,
        image_url: product.image_url,
        unit_price_npr: effectivePrice(product),
        quantity,
        variant,
        stock_qty: product.stock_qty,
      })),
      settings
    );

    /* Coupon: re-read from the store and recompute — mirrors place_order(). An unknown or
       invalid code is ignored rather than failing the order, and the response reports it. */
    const requestedCoupon = (input.coupon_code ?? '').trim().toUpperCase();
    let discount = 0;
    let appliedCoupon: string | null = null;

    if (requestedCoupon) {
      const preview = demoCommerceDb.previewCoupon(requestedCoupon, totals.subtotal);
      if (preview.valid) {
        discount = preview.discount_npr;
        appliedCoupon = preview.code;
      }
    }

    /* Affiliate: only an active code earns, and only on the product subtotal. */
    const requestedAffiliate = (input.affiliate_code ?? '').trim().toUpperCase();
    const affiliate = requestedAffiliate
      ? (demoCommerceStore.affiliates.find(
          (candidate) =>
            candidate.code.toUpperCase() === requestedAffiliate && candidate.status === 'active'
        ) ?? null)
      : null;
    const commission = affiliate
      ? Math.round(totals.subtotal * affiliate.commission_rate) / 100
      : 0;

    const id = crypto.randomUUID();
    const order: Order = {
      id,
      reference: formatOrderReference(id),
      customer_name: input.customer_name,
      customer_phone: input.customer_phone,
      customer_email: input.customer_email ?? null,
      delivery_address: input.delivery_address,
      delivery_city: input.delivery_city,
      delivery_landmark: input.delivery_landmark ?? null,
      notes: input.notes ?? null,
      status: 'pending',
      payment_method: input.payment_method,
      payment_status: 'unpaid',
      customer_id: input.customer_id ?? null,
      subtotal_npr: totals.subtotal,
      discount_npr: discount,
      shipping_npr: totals.shipping,
      total_npr: totals.subtotal - discount + totals.shipping,
      coupon_code: appliedCoupon,
      affiliate_code: affiliate?.code ?? null,
      commission_npr: commission,
      payment_reference: input.payment_reference ?? null,
      payment_proof_url: input.payment_proof_url ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items: lines.map(({ product, quantity, variant }, index) => ({
        id: `${id}-${index}`,
        order_id: id,
        product_id: product.id,
        product_name: product.name,
        product_slug: product.slug,
        image_url: product.image_url,
        variant,
        unit_price_npr: effectivePrice(product),
        quantity,
        line_total_npr: effectivePrice(product) * quantity,
        created_at: new Date().toISOString(),
      })),
    };

    // Reserve stock.
    for (const line of lines) demoCommerceDb.adjustStock(line.product.id, -line.quantity);

    // Consume the coupon and credit the affiliate, mirroring place_order().
    if (appliedCoupon && discount > 0) {
      const coupon = demoCommerceStore.coupons.find(
        (candidate) => candidate.code.toUpperCase() === appliedCoupon
      );
      if (coupon) coupon.used_count += 1;
    }
    if (affiliate && commission > 0) {
      affiliate.total_earned_npr += commission;
    }

    demoCommerceStore.orders = [order, ...demoCommerceStore.orders];
    return order;
  },

  /* ------------------------------------------------- coupons & affiliates */

  getCoupons: (query: CouponQuery = {}): Coupon[] => {
    let rows = [...demoCommerceStore.coupons];
    if (query.activeOnly) rows = rows.filter((coupon) => coupon.is_active);
    if (query.search) {
      const needle = query.search.trim().toUpperCase();
      rows = rows.filter((coupon) => coupon.code.includes(needle));
    }
    rows.sort((a, b) => a.code.localeCompare(b.code));
    return query.limit ? rows.slice(0, query.limit) : rows;
  },

  upsertCoupon: (input: {
    id?: string;
    code: string;
    description?: string | null;
    discount_type: DiscountType;
    discount_value: number;
    min_order_npr: number;
    max_discount_npr: number | null;
    usage_limit: number | null;
    per_customer_limit: number;
    starts_at?: string | null;
    ends_at?: string | null;
    is_active: boolean;
  }): Coupon => {
    const code = input.code.trim().toUpperCase();
    const existing = input.id
      ? demoCommerceStore.coupons.find((coupon) => coupon.id === input.id)
      : demoCommerceStore.coupons.find((coupon) => coupon.code.toUpperCase() === code);

    // Field-by-field (rather than a spread) so optionals become explicit nulls and the result
    // satisfies `Coupon` exactly.
    const fields = {
      description: input.description ?? null,
      discount_type: input.discount_type,
      discount_value: input.discount_value,
      min_order_npr: input.min_order_npr,
      max_discount_npr: input.max_discount_npr,
      usage_limit: input.usage_limit,
      per_customer_limit: input.per_customer_limit,
      starts_at: input.starts_at ?? null,
      ends_at: input.ends_at ?? null,
      is_active: input.is_active,
    };

    if (existing) {
      // `used_count` is owned by checkout, never by the editor form.
      Object.assign(existing, { ...fields, code, updated_at: new Date().toISOString() });
      return existing;
    }

    const created: Coupon = {
      ...fields,
      id: crypto.randomUUID(),
      code,
      used_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    demoCommerceStore.coupons = [created, ...demoCommerceStore.coupons];
    return created;
  },

  deleteCoupon: (id: string): void => {
    demoCommerceStore.coupons = demoCommerceStore.coupons.filter((coupon) => coupon.id !== id);
  },

  /** Advisory pre-check mirroring `preview_coupon()` in SQL. */
  previewCoupon: (rawCode: string, subtotal: number): CouponPreview => {
    const code = rawCode.trim().toUpperCase();
    const miss = (reason: string): CouponPreview => ({
      valid: false,
      reason,
      code: null,
      discount_type: null,
      discount_value: null,
      discount_npr: 0,
    });

    if (!code) return miss('Enter a code.');
    if (!Number.isFinite(subtotal) || subtotal <= 0) return miss('Add something to your cart first.');

    const coupon = demoCommerceStore.coupons.find((candidate) => candidate.code.toUpperCase() === code);
    if (!coupon) return miss('That code is not recognised.');
    if (!coupon.is_active) return miss('That offer has ended.');

    const now = Date.now();
    if (coupon.starts_at && now < new Date(coupon.starts_at).getTime()) {
      return miss('That offer has not started yet.');
    }
    if (coupon.ends_at && now > new Date(coupon.ends_at).getTime()) {
      return miss('That code expired.');
    }
    if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) {
      return miss('That offer has been fully claimed.');
    }
    if (subtotal < coupon.min_order_npr) {
      return miss(`Spend at least रू ${coupon.min_order_npr.toLocaleString('en-IN')} to use this code.`);
    }

    let off =
      coupon.discount_type === 'percent'
        ? Math.round(subtotal * coupon.discount_value) / 100
        : coupon.discount_value;

    if (coupon.max_discount_npr !== null) off = Math.min(off, coupon.max_discount_npr);
    off = Math.min(Math.max(off, 0), subtotal);

    return {
      valid: true,
      reason: 'Code applied.',
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      discount_npr: off,
    };
  },

  getAffiliates: (): Affiliate[] =>
    [...demoCommerceStore.affiliates].sort((a, b) => b.total_earned_npr - a.total_earned_npr),

  upsertAffiliate: (input: {
    id?: string;
    name: string;
    phone: string;
    email?: string | null;
    code: string;
    commission_rate: number;
    status: AffiliateStatus;
    notes?: string | null;
    facebook_url?: string | null;
    instagram_url?: string | null;
    tiktok_url?: string | null;
  }): Affiliate => {
    const code = input.code.trim().toUpperCase();
    const existing = input.id
      ? demoCommerceStore.affiliates.find((affiliate) => affiliate.id === input.id)
      : demoCommerceStore.affiliates.find((affiliate) => affiliate.code.toUpperCase() === code);

    const fields = {
      name: input.name,
      phone: input.phone,
      email: input.email ?? null,
      commission_rate: input.commission_rate,
      status: input.status,
      notes: input.notes ?? null,
      facebook_url: input.facebook_url ?? null,
      instagram_url: input.instagram_url ?? null,
      tiktok_url: input.tiktok_url ?? null,
    };

    if (existing) {
      // Earnings and payouts are owned by checkout/admin payouts, never by this form.
      Object.assign(existing, { ...fields, code, updated_at: new Date().toISOString() });
      return existing;
    }

    const created: Affiliate = {
      ...fields,
      id: crypto.randomUUID(),
      code,
      payout_notes: null,
      total_earned_npr: 0,
      total_paid_npr: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    demoCommerceStore.affiliates = [created, ...demoCommerceStore.affiliates];
    return created;
  },

  setAffiliateStatus: (id: string, status: AffiliateStatus): void => {
    const affiliate = demoCommerceStore.affiliates.find((candidate) => candidate.id === id);
    if (affiliate) {
      affiliate.status = status;
      affiliate.updated_at = new Date().toISOString();
    }
  },

  recordAffiliatePayout: (id: string, amount: number, notes?: string): void => {
    const affiliate = demoCommerceStore.affiliates.find((candidate) => candidate.id === id);
    if (!affiliate) return;
    affiliate.total_paid_npr += amount;
    if (notes) {
      affiliate.payout_notes = affiliate.payout_notes ? `${affiliate.payout_notes}\n${notes}` : notes;
    }
    affiliate.updated_at = new Date().toISOString();
  },

  deleteAffiliate: (id: string): void => {
    demoCommerceStore.affiliates = demoCommerceStore.affiliates.filter(
      (affiliate) => affiliate.id !== id
    );
  },

  /** Public application — always lands as `pending`, exactly like the RLS policy allows. */
  applyAffiliate: (application: AffiliateApplication): Affiliate => {
    const code = (application.preferred_code?.trim() || 'ALIKATI').toUpperCase().slice(0, 32);
    const uniqueCode = demoCommerceStore.affiliates.some((a) => a.code.toUpperCase() === code)
      ? `${code}-${Math.random().toString(36).slice(2, 4).toUpperCase()}`
      : code;

    const created: Affiliate = {
      id: crypto.randomUUID(),
      name: application.name,
      phone: application.phone,
      email: application.email ?? null,
      code: uniqueCode,
      commission_rate: demoDb.getSettings().affiliate_commission_rate,
      status: 'pending',
      payout_notes: null,
      total_earned_npr: 0,
      total_paid_npr: 0,
      notes: application.notes ?? null,
      facebook_url: application.facebook_url ?? null,
      instagram_url: application.instagram_url ?? null,
      tiktok_url: application.tiktok_url ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    demoCommerceStore.affiliates = [created, ...demoCommerceStore.affiliates];
    return created;
  },

  /* ------------------------------------------------------------ reporting */
  getCustomers: (): CustomerSummary[] => groupCustomers(demoCommerceStore.orders),

  getShopKpis: (): ShopKpis => {
    const today = todayISO();
    const live = demoCommerceStore.orders.filter((o) => o.status !== 'cancelled');
    const todays = live.filter((o) => o.created_at.slice(0, 10) === today);
    const month = today.slice(0, 7);

    return {
      ordersToday: todays.length,
      revenueToday: todays.reduce((sum, o) => sum + o.total_npr, 0),
      ordersPending: demoCommerceStore.orders.filter((o) => o.status === 'pending').length,
      ordersAwaitingFulfilment: demoCommerceStore.orders.filter((o) => o.status === 'packed' || o.status === 'shipped').length,
      lowStockCount: demoCommerceStore.products.filter((p) => p.is_active && isLowStock(p)).length,
      unitsSoldThisMonth: live
        .filter((o) => o.created_at.slice(0, 7) === month)
        .reduce((sum, o) => sum + (o.items ?? []).reduce((n, item) => n + item.quantity, 0), 0),
    };
  },
};
