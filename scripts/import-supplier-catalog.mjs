#!/usr/bin/env node
/**
 * Import the product catalogue from the two supplier storefronts into Alikati Beauty Home.
 *
 *   node scripts/import-supplier-catalog.mjs                 # default limits
 *   node scripts/import-supplier-catalog.mjs --refresh       # re-fetch and overwrite
 *   node scripts/import-supplier-catalog.mjs --colorplus=400 --wellten=200
 *
 * Sources
 *   • colorpluscosmetics.com — WooCommerce. Uses the public Store API, which returns
 *     everything needed (name, prices, images, categories, stock) with no key. Prices come
 *     back in minor units in NPR, so they are divided by 10^currency_minor_unit.
 *   • welltencosmetic.com — OpenCart. No public product API, so product cards are parsed from
 *     the category listings and each imported product page is read for its description and
 *     full image set.
 *
 * Both suppliers price in NPR, so no currency conversion is applied. If a source ever returns a
 * different currency the importer refuses to guess and prints a warning instead.
 *
 * Outputs
 *   data/imported-catalog.json   full normalised catalogue (for the SQL seed / audit)
 *   data/demo-catalog.json       a small slice the demo store loads in the browser
 *   supabase/seed-catalog.sql    idempotent INSERTs, safe to re-run
 *
 * Product ids are deterministic (UUIDv5-style, derived from the source and the source id), so
 * re-running produces the same ids and the SQL stays idempotent on `slug`.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

/* ─────────────────────────────────────────────────────────────── arguments */

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? 'true'];
  })
);

const LIMITS = {
  colorplus: Number(args.get('colorplus') ?? 150),
  wellten: Number(args.get('wellten') ?? 80),
};
const DEMO_LIMIT_PER_SOURCE = Number(args.get('demo-limit') ?? 30);
const REFRESH = args.has('refresh');
const DELAY_MS = 250;

/* ─────────────────────────────────────────────────────────────── utilities */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, { asJson = false, attempts = 3 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: asJson ? 'application/json' : 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return asJson ? await response.json() : await response.text();
    } catch (error) {
      if (attempt === attempts) throw error;
      await sleep(600 * attempt);
    }
  }
  throw new Error('unreachable');
}

/** Stable UUID derived from a source key, so ids survive re-imports. */
function stableUuid(namespace, value) {
  const hex = createHash('sha256').update(`${namespace}:${value}`).digest('hex').slice(0, 32);
  const chars = hex.split('');
  chars[12] = '5'; // version 5 (name-based)
  chars[16] = ((parseInt(chars[16], 16) & 0x3) | 0x8).toString(16); // RFC 4122 variant
  const h = chars.join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function stripHtml(input) {
  if (!input) return '';
  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#038;|&amp;/g, '&')
    .replace(/&#0?39;|&rsquo;|&#8217;/g, '’')
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 170);
}

/* ─────────────────────────────────────────────────────── category mapping */

/** Canonical shop categories, in storefront display order. */
const CATEGORIES = [
  { name: 'Skincare', slug: 'skincare', description: 'Cleansers, toners, serums, moisturisers and sunscreen.', image_url: '/media/placeholder-skin.svg', display_order: 1 },
  { name: 'Makeup', slug: 'makeup', description: 'Complexion, lips, eyes and palettes from the brands we stock.', image_url: '/media/placeholder-makeup.svg', display_order: 2 },
  { name: 'Hair Care', slug: 'hair-care', description: 'Shampoo, conditioner, masks, serums and hair oils.', image_url: '/media/placeholder-hair.svg', display_order: 3 },
  { name: 'Nail Care', slug: 'nail-care', description: 'Polish, treatments and nail tools.', image_url: '/media/placeholder-nails.svg', display_order: 4 },
  { name: 'Fragrance', slug: 'fragrance', description: 'Perfume, body mist and deodorant.', image_url: '/media/placeholder-product.svg', display_order: 5 },
  { name: 'Bath & Body', slug: 'bath-body', description: 'Lotions, soaps, scrubs and body care.', image_url: '/media/placeholder-product.svg', display_order: 6 },
  { name: 'Tools & Accessories', slug: 'tools-accessories', description: 'Brushes, sponges, styling tools and salon accessories.', image_url: '/media/placeholder-product.svg', display_order: 7 },
];

/** First matching rule wins — order matters (nails before makeup, tools before skincare). */
const CATEGORY_RULES = [
  [/nail|manicure|pedicure/i, 'nail-care'],
  [/perfume|fragrance|deodorant|body mist|attar|eau de/i, 'fragrance'],
  [/shampoo|conditioner|hair|scalp|keratin|argan|bhringraj/i, 'hair-care'],
  [/brush|sponge|blender|tool|accessor|pouch|mirror|roller|curler|straighten|dryer|razor|tweezer|scissor/i, 'tools-accessories'],
  [/body lotion|body wash|hand wash|soap|scrub|bath|foot|heel|body butter|coconut oil/i, 'bath-body'],
  [/lip|eye|eyeliner|mascara|kajal|kohl|foundation|concealer|compact|blush|highlighter|contour|primer|palette|makeup|gloss|bb cream|cc cream|setting spray|bindi/i, 'makeup'],
  [/skin|facial|face|serum|toner|moistur|cleanser|sunscreen|spf|acne|mask|peel|cream|lotion|essence|mist|vitamin|retinol|niacinamide|hyaluronic|aloe/i, 'skincare'],
];

function mapCategory(...hints) {
  const haystack = hints.filter(Boolean).join(' ');
  for (const [pattern, slug] of CATEGORY_RULES) {
    if (pattern.test(haystack)) return slug;
  }
  return 'skincare';
}

/* ──────────────────────────────────────── adapter: WooCommerce (colorplus) */

async function fetchWooCommerceBrandNames(base) {
  try {
    const brands = await get(`${base}/wp-json/wp/v2/pwb-brand?per_page=100&_fields=name`, { asJson: true });
    return Array.isArray(brands) ? brands.map((b) => stripHtml(b.name)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function inferBrand(name, brandNames) {
  const lower = name.toLowerCase();
  const matches = brandNames
    .filter((brand) => brand.length > 2 && lower.startsWith(brand.toLowerCase()))
    .sort((a, b) => b.length - a.length);
  if (matches.length > 0) return matches[0];
  // Fall back to the leading token when it looks like a brand rather than a product word.
  const first = name.split(/[\s-]+/)[0];
  const generic = new Set(['the', 'a', 'new', 'well', 'well10', 'wellten', 'glow', 'pure', 'super']);
  return first && first.length > 2 && /^[A-Z]/.test(first) && !generic.has(first.toLowerCase()) ? first : null;
}

async function importWooCommerce(base, limit, warnings) {
  const brandNames = await fetchWooCommerceBrandNames(base);
  console.log(`  ${base}: ${brandNames.length} brand names available for inference`);

  const products = [];
  const perPage = 50;
  let page = 1;

  while (products.length < limit) {
    const url = `${base}/wp-json/wc/store/v1/products?per_page=${perPage}&page=${page}&orderby=date&order=desc&stock_status=instock`;
    let batch;
    try {
      batch = await get(url, { asJson: true });
    } catch (error) {
      warnings.push(`${base}: stopped at page ${page} (${error.message})`);
      break;
    }

    if (!Array.isArray(batch) || batch.length === 0) break;

    for (const raw of batch) {
      if (products.length >= limit) break;

      const currency = raw.prices?.currency_code ?? 'NPR';
      if (currency !== 'NPR') {
        warnings.push(`Skipped "${raw.name}" — price is in ${currency}, not NPR.`);
        continue;
      }

      const minorUnit = Number(raw.prices?.currency_minor_unit ?? 2);
      const divisor = 10 ** minorUnit;
      const price = Number(raw.prices?.price ?? 0) / divisor;
      const regular = Number(raw.prices?.regular_price ?? 0) / divisor;
      const sale = Number(raw.prices?.sale_price ?? 0) / divisor;

      if (!Number.isFinite(price) || price <= 0) continue;

      const name = stripHtml(raw.name);
      const images = (raw.images ?? []).map((image) => image.src).filter(Boolean);
      const primaryCategory = (raw.categories ?? []).find((c) => !c.name.includes('&amp;')) ?? raw.categories?.[0];

      products.push({
        source: 'colorpluscosmetics.com',
        source_id: String(raw.id),
        source_url: raw.permalink,
        name,
        slug: raw.slug || slugify(name),
        brand: inferBrand(name, brandNames),
        category_slug: mapCategory(primaryCategory?.name, (raw.categories ?? []).map((c) => c.name).join(' '), name),
        short_description: stripHtml(raw.short_description).slice(0, 240) || null,
        description: stripHtml(raw.description) || null,
        price,
        // Only treat it as a promotion when the sale price is a genuine reduction.
        discount_price: sale > 0 && sale < regular ? sale : null,
        in_stock: Boolean(raw.is_in_stock),
        stock_qty: Number(raw.low_stock_remaining ?? 0) || null,
        images,
        sku: raw.sku || null,
        variant_label: raw.attributes?.[0]?.name ?? null,
        variant_options: raw.attributes?.[0]?.terms?.map((t) => t.name).slice(0, 12) ?? [],
        tags: (raw.tags ?? []).map((t) => stripHtml(t.name)).slice(0, 6),
      });
    }

    console.log(`  ${base}: page ${page} → ${products.length} products`);
    page += 1;
    if (page > 40) break;
    await sleep(DELAY_MS);
  }

  return products;
}

/* ─────────────────────────────────────────── adapter: OpenCart (wellten) */

function parseOpenCartCards(html) {
  // Each card is a <div class="product-thumb"> … </div> block; split on the class marker and
  // parse each chunk independently so a malformed card cannot poison the rest.
  const chunks = html.split(/class="product-thumb/).slice(1);
  const cards = [];

  for (const chunk of chunks) {
    // Cards run long: the theme emits srcset plus a second hover image before the text.
    const body = chunk.slice(0, 9000);
    const link = /href="([^"]*route=product\/product[^"]*product_id=(\d+)[^"]*)"/.exec(body);
    if (!link) continue;

    // The name lives in <div class="name"><a>…</a></div>; the first image's alt/title carries
    // the same text and is used as a fallback when the markup shifts.
    const nameMatch =
      /class="name"[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/.exec(body) ||
      /<img[^>]+(?:alt|title)="([^"]{3,140})"/.exec(body);
    const name = stripHtml(nameMatch?.[1] ?? '');
    if (!name || /^quickview$/i.test(name)) continue;

    const priceMatch = /<span class="price-new">([^<]+)<\/span>/.exec(body) || /class="price"[^>]*>\s*([^<]+)/.exec(body);
    const priceText = stripHtml(priceMatch?.[1] ?? '');

    const imgMatch = /<img[^>]+src="([^"]+)"/.exec(body);

    cards.push({
      product_id: link[2],
      url: link[1].replace(/&amp;/g, '&'),
      name,
      price_text: priceText,
      image: imgMatch?.[1] ?? null,
    });
  }

  return cards;
}

function parseOpenCartPrice(priceText, warnings, productName) {
  const cleaned = priceText.replace(/,/g, '').replace(/\s/g, '');
  const match = /(?:Rs\.?|NPR|रू|₹)?([0-9]+(?:\.[0-9]+)?)/i.exec(cleaned);
  if (!match) return null;
  if (/[$€£]/.test(priceText)) {
    warnings.push(`Skipped "${productName}" — price "${priceText}" is not in NPR.`);
    return null;
  }
  return Number(match[1]);
}

async function importOpenCart(base, limit, warnings) {
  // 1. Discover the categories linked from the storefront.
  const home = await get(base);
  const paths = [...new Set([...home.matchAll(/route=product\/category&amp;path=(\d+)/g)].map((m) => m[1]))];
  console.log(`  ${base}: ${paths.length} category paths discovered`);

  // 2. Collect product cards from every category listing.
  const seen = new Map();
  for (const path of paths) {
    for (let page = 1; page <= 12; page += 1) {
      const url = `${base}/index.php?route=product/category&path=${path}&limit=100&page=${page}`;
      let html;
      try {
        html = await get(url);
      } catch (error) {
        warnings.push(`${base}: category ${path} page ${page} failed (${error.message})`);
        break;
      }

      const cards = parseOpenCartCards(html);
      if (cards.length === 0) break;

      let added = 0;
      for (const card of cards) {
        if (!seen.has(card.product_id)) {
          seen.set(card.product_id, { ...card, category_path: path });
          added += 1;
        }
      }
      console.log(`  ${base}: category ${path} page ${page} → +${added} (total ${seen.size})`);
      await sleep(DELAY_MS);
      if (seen.size >= limit) break;
    }
    if (seen.size >= limit) break;
  }

  // 2b. The card markup on this theme is unreliable to parse (nested wrappers, duplicated
  //     anchors, lazy srcset), so census the raw product ids from every listing and read each
  //     product page directly — the product page is a single stable source of truth.
  const census = new Set();
  const collectIds = (html) => {
    for (const match of html.matchAll(/product_id=(\d+)/g)) census.add(match[1]);
  };

  collectIds(home);
  for (const path of paths) {
    try {
      collectIds(await get(`${base}/index.php?route=product/category&path=${path}&limit=100`));
    } catch {
      /* already warned during card discovery */
    }
    await sleep(DELAY_MS);
  }

  for (const id of census) {
    if (!seen.has(id)) {
      seen.set(id, {
        product_id: id,
        url: `${base}/index.php?route=product/product&product_id=${id}`,
        name: '',
        price_text: '',
        image: null,
        category_path: null,
      });
    }
  }
  console.log(`  ${base}: census found ${census.size} product ids (total ${seen.size})`);

  // 3. Read each imported product page for the description, exact name and full image set.
  const products = [];
  for (const card of [...seen.values()].slice(0, limit)) {
    let page = null;
    try {
      page = await get(card.url);
    } catch (error) {
      warnings.push(`${base}: product ${card.product_id} page failed (${error.message})`);
    }
    await sleep(DELAY_MS);

    const h1 = page ? stripHtml(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(page)?.[1] ?? '') : '';
    const name = h1 || card.name;

    const priceText = page
      ? stripHtml(/<div class="price">([\s\S]*?)<\/div>/.exec(page)?.[1] ?? '').split('Ex Tax')[0]
      : card.price_text;
    const price = parseOpenCartPrice(priceText || card.price_text, warnings, name);
    if (!price) continue;

    const description = page
      ? stripHtml(
          /<div id="tab-description"[^>]*>([\s\S]*?)<\/div>/.exec(page)?.[1] ??
            /<div class="tab-content[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(page)?.[1] ??
            ''
        )
      : '';

    const pageImages = page
      ? [...new Set([...page.matchAll(/<img[^>]+src="([^"]*image\/cache\/catalog[^"]+)"/g)].map((m) => m[1]))]
      : [];
    const images = pageImages.length > 0 ? pageImages : card.image ? [card.image] : [];

    const inStock = page ? /In Stock/i.test(page) : true;

    const categoryHint = page
      ? stripHtml([...page.matchAll(/breadcrumb[\s\S]{0,600}?<a[^>]*>([^<]+)<\/a>/g)].map((m) => m[1]).join(' '))
      : '';

    products.push({
      source: 'welltencosmetic.com',
      source_id: card.product_id,
      source_url: card.url,
      name,
      slug: slugify(name),
      brand: /well\s?10|wellten/i.test(name) ? 'Well 10' : null,
      category_slug: mapCategory(categoryHint, name, description.slice(0, 120)),
      short_description: (description.split('\n').find((line) => line.trim().length > 30) ?? '').slice(0, 240) || null,
      description: description || null,
      price,
      discount_price: null,
      in_stock: inStock,
      stock_qty: null,
      images,
      sku: null,
      variant_label: null,
      variant_options: [],
      tags: [],
    });
  }

  return products;
}

/* ─────────────────────────────────────────────────────────────────── main */

async function main() {
  // `--from-cache` re-emits the SQL and demo JSON from data/imported-catalog.json without
  // touching the network. Use it after changing the emitter, so fixing a formatting bug does
  // not mean hammering the suppliers' sites again.
  if (process.argv.includes('--from-cache')) {
    const cachedPath = resolve(ROOT, 'data/imported-catalog.json');
    const cached = JSON.parse(readFileSync(cachedPath, 'utf8'));
    writeFileSync(resolve(ROOT, 'supabase/seed-catalog.sql'), buildSql(cached, []), 'utf8');
    writeFileSync(
      resolve(ROOT, 'data/demo-catalog.json'),
      JSON.stringify(
        {
          generated_at: cached.generated_at,
          categories: cached.categories,
          products: [
            ...cached.products.filter((p) => p.source === 'colorpluscosmetics.com').slice(0, DEMO_LIMIT_PER_SOURCE),
            ...cached.products.filter((p) => p.source === 'welltencosmetic.com').slice(0, DEMO_LIMIT_PER_SOURCE),
          ],
        },
        null,
        2
      )
    );
    console.log(`✔ Rebuilt from cache — ${cached.products.length} products, no network requests.`);
    return;
  }

  console.log('Importing supplier catalogues…\n');
  const warnings = [];
  const started = Date.now();

  console.log('▸ colorpluscosmetics.com (WooCommerce Store API)');
  let colorplus = [];
  try {
    colorplus = await importWooCommerce('https://colorpluscosmetics.com', LIMITS.colorplus, warnings);
  } catch (error) {
    warnings.push(`colorpluscosmetics.com failed entirely: ${error.message}`);
  }

  console.log('\n▸ welltencosmetic.com (OpenCart HTML)');
  let wellten = [];
  try {
    wellten = await importOpenCart('https://welltencosmetic.com', LIMITS.wellten, warnings);
  } catch (error) {
    warnings.push(`welltencosmetic.com failed entirely: ${error.message}`);
  }

  // Normalise: unique ids/slugs, deterministic ids, source-aware slugs on collision.
  const bySlug = new Map();
  for (const product of [...colorplus, ...wellten]) {
    let slug = product.slug || slugify(product.name);
    if (bySlug.has(slug)) slug = `${slug}-${product.source_id}`;
    if (bySlug.has(slug)) continue;

    bySlug.set(slug, {
      ...product,
      slug,
      id: stableUuid('alikati-catalog', `${product.source}/${product.source_id}`),
    });
  }

  const all = [...bySlug.values()];

  mkdirSync(resolve(ROOT, 'data'), { recursive: true });

  const payload = {
    generated_at: new Date().toISOString(),
    sources: [
      { domain: 'colorpluscosmetics.com', platform: 'woocommerce', currency: 'NPR', imported: colorplus.length },
      { domain: 'welltencosmetic.com', platform: 'opencart', currency: 'NPR', imported: wellten.length },
    ],
    categories: CATEGORIES,
    products: all,
  };

  writeFileSync(resolve(ROOT, 'data/imported-catalog.json'), JSON.stringify(payload, null, 2));

  // Small slice for the in-browser demo store, keeping the client bundle reasonable.
  const demo = {
    generated_at: payload.generated_at,
    categories: CATEGORIES,
    products: [
      ...all.filter((p) => p.source === 'colorpluscosmetics.com').slice(0, DEMO_LIMIT_PER_SOURCE),
      ...all.filter((p) => p.source === 'welltencosmetic.com').slice(0, DEMO_LIMIT_PER_SOURCE),
    ],
  };
  writeFileSync(resolve(ROOT, 'data/demo-catalog.json'), JSON.stringify(demo, null, 2));

  writeFileSync(resolve(ROOT, 'supabase/seed-catalog.sql'), buildSql(payload, warnings), 'utf8');

  console.log(`\n✔ ${all.length} products imported (${colorplus.length} colorplus, ${wellten.length} wellten)`);
  console.log(`  data/imported-catalog.json  (full catalogue)`);
  console.log(`  data/demo-catalog.json      (${demo.products.length} products for demo mode)`);
  console.log(`  supabase/seed-catalog.sql   (idempotent inserts)`);
  if (warnings.length > 0) {
    console.log(`\n⚠ ${warnings.length} warning(s):`);
    for (const warning of warnings.slice(0, 12)) console.log(`   • ${warning}`);
    if (warnings.length > 12) console.log(`   … and ${warnings.length - 12} more`);
  }
  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

/* ───────────────────────────────────────────────────────────── SQL emitter */

const q = (value) => (value === null || value === undefined ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`);
const qJson = (value) => `${q(JSON.stringify(value ?? []))}::jsonb`;

/**
 * Truncates to the column's VARCHAR limit. Supplier copy routinely overruns the schema
 * (`short_description` is VARCHAR(240) and several listings are longer), and an over-length
 * value aborts the whole seed transaction with error 22001.
 */
const clip = (value, max) => {
  if (value === null || value === undefined) return value;
  const text = String(value).trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
};

function buildSql(payload, warnings) {
  const lines = [
    '-- ═════════════════════════════════════════════════════════════════════════════',
    '-- Alikati Beauty Home — supplier catalogue seed',
    '--',
    `-- Generated by scripts/import-supplier-catalog.mjs on ${payload.generated_at}.`,
    '-- Sources: colorpluscosmetics.com (WooCommerce), welltencosmetic.com (OpenCart).',
    `-- ${payload.products.length} products. Prices are NPR as published by each supplier.`,
    '--',
    '-- Re-runnable: categories and products are inserted ON CONFLICT DO NOTHING, so running',
    '-- this again will not duplicate rows or overwrite prices you have since edited in admin.',
    '--',
    '-- ⚠ Product images are hot-linked from the supplier CDNs. Before launch, either confirm you',
    '--   have the right to use them or upload your own photography through /admin/products.',
    '-- ═════════════════════════════════════════════════════════════════════════════',
    '',
    '-- 1. CATEGORIES -------------------------------------------------------------',
    'INSERT INTO public.product_categories (name, slug, description, image_url, display_order, is_active) VALUES',
  ];

  lines.push(
    payload.categories
      .map((c) => `    (${q(clip(c.name, 100))}, ${q(clip(c.slug, 120))}, ${q(c.description)}, ${q(c.image_url)}, ${c.display_order}, TRUE)`)
      .join(',\n') + '\nON CONFLICT (slug) DO NOTHING;'
  );

  lines.push('', '-- 2. PRODUCTS ---------------------------------------------------------------');
  lines.push(
    'INSERT INTO public.products (name, slug, sku, category_id, brand, short_description, description,' +
      ' price_npr, discount_price_npr, stock_qty, low_stock_threshold, image_url, images, variant_label,' +
      ' variant_options, tags, is_active, is_featured) VALUES'
  );

  const rows = payload.products.map((p, index) => {
    const stock = p.in_stock ? (p.stock_qty ?? 25) : 0;
    const primaryImage = p.images?.[0] ?? null;
    const featured = index % 11 === 0 ? 'TRUE' : 'FALSE';
    return (
      // Lengths are clipped to the column definitions in migration 0004.
      `    (${q(clip(p.name, 160))}, ${q(clip(p.slug, 180))}, ${q(clip(p.sku, 60))}, ` +
      `(SELECT id FROM public.product_categories WHERE slug = ${q(p.category_slug)}), ` +
      `${q(clip(p.brand, 120))}, ${q(clip(p.short_description, 240))}, ${q(p.description)}, ` +
      `${p.price}, ${p.discount_price ?? 'NULL'}, ${stock}, 5, ${q(primaryImage)}, ` +
      `${qJson(p.images)}, ${q(clip(p.variant_label, 60))}, ${qJson(p.variant_options)}, ${qJson(p.tags)}, ` +
      `TRUE, ${featured})`
    );
  });

  lines.push(rows.join(',\n') + '\nON CONFLICT (slug) DO NOTHING;');
  lines.push(
    '',
    '-- 3. VERIFY -----------------------------------------------------------------',
    "SELECT c.name AS category, count(p.id) AS products",
    'FROM public.product_categories c',
    'LEFT JOIN public.products p ON p.category_id = c.id',
    // display_order must be grouped (or aggregated) before it can be ordered by, otherwise
    // PostgreSQL rejects the statement with 42803 and the whole seed transaction aborts.
    'GROUP BY c.name, c.display_order ORDER BY c.display_order;',
    ''
  );

  if (warnings.length > 0) {
    lines.push('-- Import warnings:');
    for (const warning of warnings) lines.push(`--   • ${warning}`);
  }

  return lines.join('\n');
}

main().catch((error) => {
  console.error('Import failed:', error);
  process.exit(1);
});
