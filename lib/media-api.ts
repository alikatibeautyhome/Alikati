'use client';

/**
 * Client-side access for the admin media library.
 *
 * Staff-only, enforced in the database: `media_categories` and `media_assets` grant nothing to
 * `anon` and gate every write on `is_staff()`. There is no public read here because the storefront
 * embeds asset URLs directly and never queries these tables.
 *
 * Uploads themselves go through `uploadMediaAsset` in `lib/api-client`, which owns the bucket; this
 * module only records what was uploaded.
 */

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { isDemoMode } from '@/lib/supabase/config';
import type { MediaAsset, MediaCategory } from '@/types/media.types';

function db() {
  return getSupabaseBrowserClient();
}

/** Turns a PostgREST error into something a shopkeeper can act on. */
function fail(operation: string, error: { message: string } | null): never {
  throw new Error(`${operation}: ${error?.message ?? 'unknown error'}`);
}

/** The library's folders, seeded defaults first. */
export async function getMediaCategories(): Promise<MediaCategory[]> {
  if (isDemoMode()) return [];

  const { data, error } = await db()
    .from('media_categories')
    .select('*')
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) fail('getMediaCategories', error);
  return (data ?? []) as MediaCategory[];
}

/**
 * Add a custom folder.
 *
 * The slug is derived from the name rather than asked for separately: it is also the storage folder,
 * so a free-text field would let two spellings of one category produce two folders. Uniqueness is
 * enforced by the table, and a duplicate is reported as such rather than silently merged.
 */
export async function createMediaCategory(name: string): Promise<MediaCategory> {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!slug) throw new Error('Give the category a name containing at least one letter or number.');
  if (isDemoMode()) {
    return { id: crypto.randomUUID(), slug, name: name.trim(), is_system: false, display_order: 99, created_at: new Date().toISOString() };
  }

  const { data, error } = await db()
    .from('media_categories')
    .insert({ slug, name: name.trim(), is_system: false, display_order: 99 })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new Error(`A category named "${name.trim()}" already exists.`);
    fail('createMediaCategory', error);
  }
  return data as MediaCategory;
}

/**
 * Delete a custom folder. Seeded ones are refused by a database trigger, which is the boundary that
 * matters; this only surfaces the reason.
 */
export async function deleteMediaCategory(id: string): Promise<void> {
  if (isDemoMode()) return;

  const { error } = await db().from('media_categories').delete().eq('id', id);
  if (error) fail('deleteMediaCategory', error);
}

/** Everything in the library, newest first, optionally narrowed to one folder. */
export async function getMediaAssets(categoryId?: string): Promise<MediaAsset[]> {
  if (isDemoMode()) return [];

  let query = db().from('media_assets').select('*').order('created_at', { ascending: false });
  if (categoryId) query = query.eq('category_id', categoryId);

  const { data, error } = await query;
  if (error) fail('getMediaAssets', error);
  return (data ?? []) as MediaAsset[];
}

/**
 * Record an uploaded file.
 *
 * `path` is stored as well as `url` so the object can be removed later without parsing a URL back
 * into a storage path.
 */
export async function recordMediaAsset(input: {
  categoryId: string | null;
  path: string;
  url: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<MediaAsset> {
  if (isDemoMode()) {
    return {
      id: crypto.randomUUID(),
      category_id: input.categoryId,
      path: input.path,
      url: input.url,
      filename: input.filename,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      created_at: new Date().toISOString(),
    };
  }

  const { data, error } = await db()
    .from('media_assets')
    .insert({
      category_id: input.categoryId,
      path: input.path,
      url: input.url,
      filename: input.filename,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
    })
    .select()
    .single();

  if (error) fail('recordMediaAsset', error);
  return data as MediaAsset;
}

export async function deleteMediaAsset(id: string): Promise<void> {
  if (isDemoMode()) return;

  const { error } = await db().from('media_assets').delete().eq('id', id);
  if (error) fail('deleteMediaAsset', error);
}

/** Move an asset to a different folder. */
export async function setMediaAssetCategory(id: string, categoryId: string | null): Promise<void> {
  if (isDemoMode()) return;

  const { error } = await db().from('media_assets').update({ category_id: categoryId }).eq('id', id);
  if (error) fail('setMediaAssetCategory', error);
}
