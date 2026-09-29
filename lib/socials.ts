/**
 * Social accounts on an affiliate application.
 *
 * Column naming and shape deliberately mirror `salon_settings` (migration 0007): three nullable
 * `*_url` columns holding full `https://` URLs. Someone reading both tables should not have to
 * learn two conventions for the same three things.
 *
 * Pure functions with no Supabase import, so the public join form, the admin edit modal and the
 * demo store all normalise and validate identically — and so anything the form accepts is certain
 * to satisfy the CHECK constraints in migration 0017.
 *
 * The forms render `SOCIAL_FIELDS` rather than hand-writing three near-identical blocks, so a
 * change to the rule lives in exactly one place.
 */

export interface SocialAccounts {
  facebook_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
}

/** Instagram and TikTok usernames: letters, digits, dots, underscores. Matches the DB constraint. */
const HANDLE_PATTERN = /^[A-Za-z0-9._]{2,40}$/;

const URL_PATTERNS = {
  facebook: /^https:\/\/(?:www\.|m\.|web\.)?(?:facebook\.com|fb\.com|fb\.me)\/\S+$/i,
  instagram: /^https:\/\/(?:www\.)?instagram\.com\/\S+$/i,
  tiktok: /^https:\/\/(?:www\.)?tiktok\.com\/@?\S+$/i,
} as const;

/**
 * Pulls the username out of whatever was typed or pasted.
 *
 * Accepts `@nirmala.k`, `nirmala.k`, `https://instagram.com/nirmala.k/` and
 * `instagram.com/nirmala.k?igsh=…` — all things people really paste.
 */
function extractHandle(raw: string): string | null {
  let value = (raw ?? '').trim();
  if (!value) return null;

  // Any pasted profile URL collapses to its first path segment, whichever network it belongs to.
  const fromUrl = value.match(/^(?:https?:\/\/)?(?:www\.|m\.)?[^/\s]*\.(?:com|me|org|net|np)\/([^/?#\s]+)/i);
  if (fromUrl) value = fromUrl[1];

  value = value
    .replace(/^@+/, '')
    .replace(/\s+/g, '')
    // Anything outside the permitted set is dropped rather than rejected: a typo like
    // "nirmala k" should become "nirmalak", not block the application.
    .replace(/[^A-Za-z0-9._]/g, '');

  return value || null;
}

/**
 * Normalises one account to a canonical `https://` URL.
 *
 * Facebook is the exception: a link already on a Facebook host is kept exactly as supplied,
 * because real profile links such as `facebook.com/share/1Dgw2YFiiZ/` have a two-segment path
 * that must not be truncated to `share`. Instagram and TikTok are always rebuilt from the handle,
 * so `https://instagram.com/x/` and `@x` both store the same canonical `https://www.instagram.com/x`
 * — two applicants describing the same profile must not produce two different strings.
 */
function normalizeProfileUrl(
  raw: string,
  network: 'facebook' | 'instagram' | 'tiktok'
): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;

  if (network === 'facebook' && /^https?:\/\//i.test(value)) {
    const upgraded = value.replace(/^http:\/\//i, 'https://');
    if (URL_PATTERNS.facebook.test(upgraded)) return upgraded.length <= 200 ? upgraded : null;
  }

  const handle = extractHandle(value);
  if (!handle) return null;

  if (network === 'tiktok') return `https://www.tiktok.com/@${handle}`;
  if (network === 'instagram') return `https://www.instagram.com/${handle}`;
  return `https://www.facebook.com/${handle}`;
}

export const normalizeFacebookUrl = (raw: string) => normalizeProfileUrl(raw, 'facebook');
export const normalizeInstagramUrl = (raw: string) => normalizeProfileUrl(raw, 'instagram');
export const normalizeTikTokUrl = (raw: string) => normalizeProfileUrl(raw, 'tiktok');

export function isValidSocialUrl(url: string | null, network: keyof typeof URL_PATTERNS): boolean {
  return url !== null && url.length <= 200 && URL_PATTERNS[network].test(url);
}

/** Wraps whatever was submitted in one normalising pass, so callers cannot forget a step. */
export function normalizeSocialAccounts(input: Partial<SocialAccounts>): SocialAccounts {
  return {
    facebook_url: normalizeFacebookUrl(input.facebook_url ?? ''),
    instagram_url: normalizeInstagramUrl(input.instagram_url ?? ''),
    tiktok_url: normalizeTikTokUrl(input.tiktok_url ?? ''),
  };
}

/** True when at least one account was supplied — required for an application to be reviewable. */
export function hasAnySocial(accounts: SocialAccounts): boolean {
  return Boolean(accounts.facebook_url || accounts.instagram_url || accounts.tiktok_url);
}

/** One row per supplied account, ready to render as a link. */
export function socialProfileLinks(accounts: SocialAccounts): { label: string; href: string }[] {
  const links: { label: string; href: string }[] = [];

  if (accounts.facebook_url) links.push({ label: 'Facebook', href: accounts.facebook_url });
  if (accounts.instagram_url) links.push({ label: 'Instagram', href: accounts.instagram_url });
  if (accounts.tiktok_url) links.push({ label: 'TikTok', href: accounts.tiktok_url });

  return links;
}

/**
 * The three account fields, in display order.
 *
 * The join form and the admin modal both map over this, so the labels, the hints and the rules
 * stay identical between what an applicant fills in and what staff later edit.
 */
export const SOCIAL_FIELDS = [
  {
    key: 'facebook_url',
    label: 'Facebook profile',
    placeholder: 'facebook.com/yourname',
    hint: 'Paste your profile link.',
    normalize: normalizeFacebookUrl,
    isValid: (url: string | null) => isValidSocialUrl(url, 'facebook'),
    invalidMessage: 'Enter a Facebook profile link, e.g. facebook.com/yourname.',
  },
  {
    key: 'instagram_url',
    label: 'Instagram',
    placeholder: '@yourname',
    hint: 'Your username or profile link.',
    normalize: normalizeInstagramUrl,
    isValid: (url: string | null) => isValidSocialUrl(url, 'instagram'),
    invalidMessage: 'Enter an Instagram username or profile link.',
  },
  {
    key: 'tiktok_url',
    label: 'TikTok',
    placeholder: '@yourname',
    hint: 'Your username or profile link.',
    normalize: normalizeTikTokUrl,
    isValid: (url: string | null) => isValidSocialUrl(url, 'tiktok'),
    invalidMessage: 'Enter a TikTok username or profile link.',
  },
] as const;

export type SocialFieldKey = (typeof SOCIAL_FIELDS)[number]['key'];
