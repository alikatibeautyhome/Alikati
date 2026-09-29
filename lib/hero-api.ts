/**
 * Hero slideshow management (admin console, browser-side).
 *
 * Slides are stored in the `hero_slides` table (migration 0014) and read publicly through
 * `getHeroSlides()` in `lib/api.ts`. In demo mode this module keeps them in memory so the
 * slideshow can be reviewed without a database.
 *
 * Images reuse the existing public `gallery` bucket via `uploadGalleryImage`, so no new bucket
 * or storage policy is involved.
 */
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { isDemoMode } from '@/lib/supabase/config';
// The existing public `gallery` bucket helper — no new bucket or policy is needed.
import { uploadGalleryImage } from '@/lib/api-client';
import { demoHeroSlides, demoHeroSlidesStore } from '@/lib/demo-data';
import type { HeroSlide } from '@/types/database.types';

export { demoHeroSlides };

export interface HeroSlideInput {
  id?: string;
  image_url: string;
  alt_text?: string | null;
  heading?: string | null;
  subheading?: string | null;
  display_order?: number;
  is_active?: boolean;
}

/* ── demo store lives in lib/demo-data.ts so the public read and this manager agree ── */

function db() {
  return getSupabaseBrowserClient();
}

/* ── reads ──────────────────────────────────────────────────────────────────── */

/** Every slide, including hidden ones — for the admin manager. */
export async function getAllHeroSlides(): Promise<HeroSlide[]> {
  if (isDemoMode()) {
    return [...demoHeroSlidesStore].sort((a, b) => a.display_order - b.display_order);
  }

  const { data, error } = await db()
    .from('hero_slides')
    .select('*')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[hero-api] could not load slides:', error.message);
    return [];
  }
  return (data ?? []) as HeroSlide[];
}

/* ── writes ─────────────────────────────────────────────────────────────────── */

export async function upsertHeroSlide(input: HeroSlideInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  const image_url = input.image_url.trim();
  if (!image_url) return { ok: false, error: 'Choose an image first.' };

  const payload = {
    image_url,
    alt_text: input.alt_text?.trim() || null,
    heading: input.heading?.trim() || null,
    subheading: input.subheading?.trim() || null,
    is_active: input.is_active ?? true,
  };

  if (isDemoMode()) {
    if (input.id) {
      const existing = demoHeroSlidesStore.find((slide) => slide.id === input.id);
      if (!existing) return { ok: false, error: 'That slide no longer exists.' };
      Object.assign(existing, payload, { updated_at: new Date().toISOString() });
      return { ok: true, id: existing.id };
    }
    const created: HeroSlide = {
      ...payload,
      id: `demo-hero-${Date.now()}`,
      display_order: input.display_order ?? demoHeroSlidesStore.length,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    demoHeroSlidesStore.push(created);
    return { ok: true, id: created.id };
  }

  const client = db();

  if (input.id) {
    const { error } = await client.from('hero_slides').update(payload).eq('id', input.id);
    if (error) {
      console.error('[hero-api] update failed:', error.message);
      return { ok: false, error: 'Could not save the slide.' };
    }
    return { ok: true, id: input.id };
  }

  // Append: the next order slot is one past the current highest.
  const { data: last } = await client
    .from('hero_slides')
    .select('display_order')
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await client
    .from('hero_slides')
    .insert({ ...payload, display_order: input.display_order ?? (last?.display_order ?? -1) + 1 })
    .select('id')
    .single();

  if (error) {
    console.error('[hero-api] insert failed:', error.message);
    return { ok: false, error: 'Could not add the slide.' };
  }
  return { ok: true, id: data?.id };
}

export async function setHeroSlideActive(id: string, isActive: boolean): Promise<boolean> {
  if (isDemoMode()) {
    const slide = demoHeroSlidesStore.find((item) => item.id === id);
    if (slide) slide.is_active = isActive;
    return true;
  }
  const { error } = await db().from('hero_slides').update({ is_active: isActive }).eq('id', id);
  if (error) {
    console.error('[hero-api] visibility toggle failed:', error.message);
    return false;
  }
  return true;
}

export async function deleteHeroSlide(id: string): Promise<boolean> {
  if (isDemoMode()) {
    const index = demoHeroSlidesStore.findIndex((slide) => slide.id === id);
    if (index !== -1) demoHeroSlidesStore.splice(index, 1);
    return true;
  }
  const { error } = await db().from('hero_slides').delete().eq('id', id);
  if (error) {
    console.error('[hero-api] delete failed:', error.message);
    return false;
  }
  return true;
}

/**
 * Swaps a slide with its neighbour.
 *
 * Ordering is persisted as a full rewrite of `display_order` rather than a swap of two values,
 * so a list that has drifted (duplicates from earlier manual edits) is normalised on every move.
 */
export async function moveHeroSlide(id: string, direction: 'up' | 'down'): Promise<boolean> {
  const slides = await getAllHeroSlides();
  const index = slides.findIndex((slide) => slide.id === id);
  if (index === -1) return false;

  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= slides.length) return false;

  const reordered = [...slides];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

  if (isDemoMode()) {
    reordered.forEach((slide, position) => {
      slide.display_order = position;
    });
    // Keep the demo array in the new order too.
    demoHeroSlidesStore.sort((a, b) => a.display_order - b.display_order);
    return true;
  }

  const client = db();
  const results = await Promise.all(
    reordered.map((slide, position) =>
      client.from('hero_slides').update({ display_order: position }).eq('id', slide.id)
    )
  );

  const failure = results.find((result) => result.error);
  if (failure?.error) {
    console.error('[hero-api] reorder failed:', failure.error.message);
    return false;
  }
  return true;
}

/** Uploads a hero photograph and returns its public URL. */
export async function uploadHeroImage(file: File): Promise<string | null> {
  return uploadGalleryImage(file);
}
