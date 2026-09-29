'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Trash2 } from 'lucide-react';
import { HeroSlideshowManager } from '@/components/admin/HeroSlideshowManager';
import { ImageUploadDropzone } from '@/components/admin/ImageUploadDropzone';
import { WatermarkSettingsCard } from '@/components/admin/WatermarkSettingsCard';
import { PaymentQR } from '@/components/shop/PaymentQR';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getSalonSettings, updateSalonSettings } from '@/lib/api-client';
import { formatBsDate } from '@/lib/nepali-date';
import { cn, formatNPR, formatPhoneDisplay } from '@/lib/utils';
import { HOME_SECTION_KEYS, HOME_SECTION_LABELS } from '@/types/marketing.types';
import type { HomeSectionKey } from '@/types/marketing.types';

interface SettingsForm {
  phone: string;
  whatsapp_number: string;
  address: string;
  opening_time: string;
  closing_time: string;
  announcement_text: string;
  announcement_active: boolean;
  /* ── Store & checkout ─────────────────────────────────────────────── */
  store_enabled: boolean;
  shipping_fee_npr: string;
  free_shipping_threshold_npr: string;
  cod_enabled: boolean;
  bank_transfer_enabled: boolean;
  payment_instructions: string;
  support_email: string;
  delivery_note: string;
  /* ── Payments & QR, coupons and Nepali dates (migration 0011) ─────── */
  payment_qr_enabled: boolean;
  payment_qr_content: string;
  payment_qr_image_url: string;
  payment_note: string;
  coupon_default_days: string;
  nepali_dates: boolean;
  /* ── Landing-page hero (migration 0013) ───────────────────────────── */
  hero_image_url: string;
  hero_heading: string;
  hero_subheading: string;
  hero_badge_text: string;
  /* ── Owner-controlled site settings ───────────────────────────────── */
  affiliate_enabled: boolean;
  affiliate_commission_rate: string;
  affiliate_terms: string;
  cookie_notice_enabled: boolean;
  cookie_notice_text: string;
  app_prompt_enabled: boolean;
  app_prompt_text: string;
  home_section_order: HomeSectionKey[];
  /* ── Public contact details and social profiles ───────────────────── */
  email: string;
  facebook_url: string;
  instagram_url: string;
  tiktok_url: string;
  /* ── Landing-page promo band ──────────────────────────────────────── */
  promo_enabled: boolean;
  promo_eyebrow: string;
  promo_headline: string;
  promo_subheadline: string;
  promo_cta_label: string;
  promo_href: string;
}

type FieldErrors = Partial<Record<keyof SettingsForm, string>>;

const EMPTY_FORM: SettingsForm = {
  phone: '',
  whatsapp_number: '',
  address: '',
  opening_time: '08:00',
  closing_time: '19:00',
  announcement_text: '',
  announcement_active: false,
  store_enabled: true,
  shipping_fee_npr: '0',
  free_shipping_threshold_npr: '0',
  cod_enabled: true,
  bank_transfer_enabled: false,
  payment_instructions: '',
  support_email: '',
  delivery_note: '',
  payment_qr_enabled: false,
  payment_qr_content: '',
  payment_qr_image_url: '',
  payment_note: '',
  coupon_default_days: '7',
  nepali_dates: true,
  hero_image_url: '',
  hero_heading: '',
  hero_subheading: '',
  hero_badge_text: '',
  affiliate_enabled: true,
  affiliate_commission_rate: '10',
  affiliate_terms: '',
  cookie_notice_enabled: true,
  cookie_notice_text: '',
  app_prompt_enabled: true,
  app_prompt_text: '',
  home_section_order: [...HOME_SECTION_KEYS],
  email: '',
  facebook_url: '',
  instagram_url: '',
  tiktok_url: '',
  promo_enabled: false,
  promo_eyebrow: '',
  promo_headline: '',
  promo_subheadline: '',
  promo_cta_label: '',
  promo_href: '',
};

/**
 * Sections the owner has chosen to show, in display order. Unknown or duplicate keys are dropped
 * and any key missing from the saved array is appended, so a malformed value degrades to the
 * full default order rather than hiding a section by accident.
 */
function normalizeSections(value: string[] | null | undefined): HomeSectionKey[] {
  const known = new Set<string>(HOME_SECTION_KEYS);
  const seen = new Set<string>();
  const ordered: HomeSectionKey[] = [];

  for (const key of value ?? []) {
    if (typeof key === 'string' && known.has(key) && !seen.has(key)) {
      seen.add(key);
      ordered.push(key as HomeSectionKey);
    }
  }
  for (const key of HOME_SECTION_KEYS) {
    if (!seen.has(key)) ordered.push(key);
  }
  return ordered;
}

/** Keeps the affiliate rate a real number inside 0–50, whatever the input contained. */
function clampRate(raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 0;
  return Math.min(50, Math.max(0, value));
}

/** Keeps the coupon default a whole number of days inside 1–365. */
function clampCouponDays(raw: string): number {
  const value = Math.round(Number(raw));
  if (!Number.isFinite(value)) return 7;
  return Math.min(365, Math.max(1, value));
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

export default function AdminSettingsPage() {
  const [form, setForm] = useState<SettingsForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof SettingsForm, string>>>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const settings = await getSalonSettings();
      setForm({
        phone: settings.phone,
        whatsapp_number: settings.whatsapp_number,
        address: settings.address,
        opening_time: settings.opening_time,
        closing_time: settings.closing_time,
        announcement_text: settings.announcement_text,
        announcement_active: settings.announcement_active,
        store_enabled: settings.store_enabled,
        shipping_fee_npr: String(settings.shipping_fee_npr),
        free_shipping_threshold_npr: String(settings.free_shipping_threshold_npr),
        cod_enabled: settings.cod_enabled,
        bank_transfer_enabled: settings.bank_transfer_enabled,
        payment_instructions: settings.payment_instructions,
        support_email: settings.support_email ?? '',
        delivery_note: settings.delivery_note ?? '',
        payment_qr_enabled: settings.payment_qr_enabled,
        payment_qr_content: settings.payment_qr_content ?? '',
        payment_qr_image_url: settings.payment_qr_image_url ?? '',
        payment_note: settings.payment_note ?? '',
        coupon_default_days: String(settings.coupon_default_days ?? 7),
        nepali_dates: settings.nepali_dates,
        hero_image_url: settings.hero_image_url ?? '',
        hero_heading: settings.hero_heading ?? '',
        hero_subheading: settings.hero_subheading ?? '',
        hero_badge_text: settings.hero_badge_text ?? '',
        affiliate_enabled: settings.affiliate_enabled,
        affiliate_commission_rate: String(settings.affiliate_commission_rate ?? 0),
        affiliate_terms: settings.affiliate_terms ?? '',
        cookie_notice_enabled: settings.cookie_notice_enabled,
        cookie_notice_text: settings.cookie_notice_text ?? '',
        app_prompt_enabled: settings.app_prompt_enabled,
        app_prompt_text: settings.app_prompt_text ?? '',
        home_section_order: normalizeSections(settings.home_section_order),
        email: settings.email ?? '',
        facebook_url: settings.facebook_url ?? '',
        instagram_url: settings.instagram_url ?? '',
        tiktok_url: settings.tiktok_url ?? '',
        promo_enabled: settings.promo_enabled,
        promo_eyebrow: settings.promo_eyebrow ?? '',
        promo_headline: settings.promo_headline ?? '',
        promo_subheadline: settings.promo_subheadline ?? '',
        promo_cta_label: settings.promo_cta_label ?? '',
        promo_href: settings.promo_href ?? '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the business settings.');
    }
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void load().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [load]);

  function patch<K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validateSalon(values: SettingsForm): FieldErrors {
    const nextErrors: FieldErrors = {};
    if (!values.phone.trim()) nextErrors.phone = 'Phone number is required.';
    if (!values.whatsapp_number.trim()) nextErrors.whatsapp_number = 'WhatsApp number is required.';
    if (!values.address.trim()) nextErrors.address = 'Address is required.';
    if (!values.opening_time) nextErrors.opening_time = 'Opening time is required.';
    if (!values.closing_time) nextErrors.closing_time = 'Closing time is required.';
    if (values.opening_time && values.closing_time && values.opening_time >= values.closing_time) {
      nextErrors.closing_time = 'Closing time must be after opening time.';
    }
    if (values.announcement_active && !values.announcement_text.trim()) {
      nextErrors.announcement_text = 'Add announcement text, or turn the banner off.';
    }
    return nextErrors;
  }

  function validateStore(values: SettingsForm): FieldErrors {
    const nextErrors: FieldErrors = {};
    const fee = Number(values.shipping_fee_npr);
    const threshold = Number(values.free_shipping_threshold_npr);

    if (!Number.isFinite(fee) || fee < 0) nextErrors.shipping_fee_npr = 'Shipping fee must be 0 or more.';
    if (!Number.isFinite(threshold) || threshold < 0) {
      nextErrors.free_shipping_threshold_npr = 'Free-shipping threshold must be 0 or more.';
    }
    if (values.support_email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.support_email.trim())) {
      nextErrors.support_email = 'Enter a valid email address, or leave it blank.';
    }
    if (values.store_enabled && !values.cod_enabled && !values.bank_transfer_enabled) {
      nextErrors.cod_enabled = 'Enable at least one payment method while the store is live.';
    }
    return nextErrors;
  }

  function validatePayments(values: SettingsForm): FieldErrors {
    const nextErrors: FieldErrors = {};
    const days = Number(values.coupon_default_days);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      nextErrors.coupon_default_days = 'Enter a whole number of days between 1 and 365.';
    }
    if (
      values.payment_qr_enabled &&
      !values.payment_qr_image_url.trim() &&
      !values.payment_qr_content.trim()
    ) {
      nextErrors.payment_qr_content = 'Add the QR text or upload an image, or switch the QR off.';
    }
    return nextErrors;
  }

  function validateAffiliate(values: SettingsForm): FieldErrors {
    const nextErrors: FieldErrors = {};
    const rate = Number(values.affiliate_commission_rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 50) {
      nextErrors.affiliate_commission_rate = 'Enter a rate between 0 and 50.';
    }
    return nextErrors;
  }

  function validateNotices(values: SettingsForm): FieldErrors {
    const nextErrors: FieldErrors = {};
    if (values.cookie_notice_enabled && !values.cookie_notice_text.trim()) {
      nextErrors.cookie_notice_text = 'Add the notice text, or switch the notice off.';
    }
    if (values.app_prompt_enabled && !values.app_prompt_text.trim()) {
      nextErrors.app_prompt_text = 'Add the prompt text, or switch the prompt off.';
    }
    return nextErrors;
  }

  function validateLanding(values: SettingsForm): FieldErrors {
    const nextErrors: FieldErrors = {};
    if (values.home_section_order.length === 0) {
      nextErrors.home_section_order = 'Keep at least one section visible on the landing page.';
    }
    return nextErrors;
  }

  /**
   * Mirrors the `maxLength` on the three hero text inputs. The inputs already stop typing past the
   * limit; this guard catches a value that arrives some other way (autofill, a pasted draft) so the
   * save still fails loudly instead of silently truncating the owner's words.
   */
  function validateHero(values: SettingsForm): FieldErrors {
    const nextErrors: FieldErrors = {};
    if (values.hero_heading.trim().length > 120) {
      nextErrors.hero_heading = 'Keep the heading to 120 characters or fewer.';
    }
    if (values.hero_subheading.trim().length > 200) {
      nextErrors.hero_subheading = 'Keep the subheading to 200 characters or fewer.';
    }
    if (values.hero_badge_text.trim().length > 40) {
      nextErrors.hero_badge_text = 'Keep the badge text to 40 characters or fewer.';
    }
    return nextErrors;
  }

  /**
   * Promo band guard. The button label has a hard 40-character ceiling, and the link is an
   * in-app path so the band never points at an arbitrary external site.
   */
  function validatePromo(values: SettingsForm): FieldErrors {
    const nextErrors: FieldErrors = {};
    if (values.promo_cta_label.trim().length > 40) {
      nextErrors.promo_cta_label = 'Keep the button label to 40 characters or fewer.';
    }
    const href = values.promo_href.trim();
    if (href && !href.startsWith('/')) {
      nextErrors.promo_href = 'Enter an internal link that starts with / (for example /shop).';
    }
    return nextErrors;
  }

  function validateSocial(values: SettingsForm): FieldErrors {
    const nextErrors: FieldErrors = {};
    const email = values.email.trim();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      nextErrors.email = 'Enter a valid email address, or leave it blank.';
    }
    if (values.facebook_url.trim() && !isHttpUrl(values.facebook_url)) {
      nextErrors.facebook_url = 'Enter a full link starting with https://';
    }
    if (values.instagram_url.trim() && !isHttpUrl(values.instagram_url)) {
      nextErrors.instagram_url = 'Enter a full link starting with https://';
    }
    if (values.tiktok_url.trim() && !isHttpUrl(values.tiktok_url)) {
      nextErrors.tiktok_url = 'Enter a full link starting with https://';
    }
    return nextErrors;
  }

  /** Single write path shared by every section — same success/error feedback everywhere. */
  async function persist() {
    setSaving(true);
    try {
      await updateSalonSettings({
        phone: form.phone.trim(),
        whatsapp_number: form.whatsapp_number.trim(),
        address: form.address.trim(),
        opening_time: form.opening_time,
        closing_time: form.closing_time,
        announcement_text: form.announcement_text.trim(),
        announcement_active: form.announcement_active,
        store_enabled: form.store_enabled,
        shipping_fee_npr: Number(form.shipping_fee_npr),
        free_shipping_threshold_npr: Number(form.free_shipping_threshold_npr),
        cod_enabled: form.cod_enabled,
        bank_transfer_enabled: form.bank_transfer_enabled,
        payment_instructions: form.payment_instructions.trim(),
        support_email: form.support_email.trim() || null,
        delivery_note: form.delivery_note.trim() || null,
        payment_qr_enabled: form.payment_qr_enabled,
        payment_qr_content: form.payment_qr_content.trim() || null,
        payment_qr_image_url: form.payment_qr_image_url.trim() || null,
        payment_note: form.payment_note.trim() || null,
        coupon_default_days: clampCouponDays(form.coupon_default_days),
        nepali_dates: form.nepali_dates,
        hero_image_url: form.hero_image_url.trim() || null,
        hero_heading: form.hero_heading.trim() || null,
        hero_subheading: form.hero_subheading.trim() || null,
        hero_badge_text: form.hero_badge_text.trim() || null,
        affiliate_enabled: form.affiliate_enabled,
        affiliate_commission_rate: clampRate(form.affiliate_commission_rate),
        affiliate_terms: form.affiliate_terms.trim() || null,
        cookie_notice_enabled: form.cookie_notice_enabled,
        cookie_notice_text: form.cookie_notice_text.trim() || null,
        app_prompt_enabled: form.app_prompt_enabled,
        app_prompt_text: form.app_prompt_text.trim() || null,
        home_section_order: [...form.home_section_order],
        email: form.email.trim() || null,
        facebook_url: form.facebook_url.trim() || null,
        instagram_url: form.instagram_url.trim() || null,
        tiktok_url: form.tiktok_url.trim() || null,
        promo_enabled: form.promo_enabled,
        promo_eyebrow: form.promo_eyebrow.trim() || null,
        promo_headline: form.promo_headline.trim() || null,
        promo_subheadline: form.promo_subheadline.trim() || null,
        promo_cta_label: form.promo_cta_label.trim() || null,
        promo_href: form.promo_href.trim() || null,
      });
      setSuccess('Settings saved. The public site is up to date.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the settings.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSalonSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess(null);
    setError(null);
    const nextErrors = validateSalon(form);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    await persist();
  }

  async function handleStoreSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess(null);
    setError(null);
    const nextErrors = validateStore(form);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    await persist();
  }

  /** Shared validate-then-save used by the owner-control sections. */
  async function submitWith(
    event: React.FormEvent<HTMLFormElement>,
    validate: (values: SettingsForm) => FieldErrors
  ) {
    event.preventDefault();
    setSuccess(null);
    setError(null);
    const nextErrors = validate(form);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    await persist();
  }

  function moveSection(index: number, delta: number) {
    setForm((prev) => {
      const next = [...prev.home_section_order];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return { ...prev, home_section_order: next };
    });
  }

  function hideSection(key: HomeSectionKey) {
    setForm((prev) => ({
      ...prev,
      home_section_order: prev.home_section_order.filter((item) => item !== key),
    }));
  }

  function showSection(key: HomeSectionKey) {
    setForm((prev) =>
      prev.home_section_order.includes(key)
        ? prev
        : { ...prev, home_section_order: [...prev.home_section_order, key] }
    );
  }

  const hiddenSections = HOME_SECTION_KEYS.filter((key) => !form.home_section_order.includes(key));

  /* ── Customer-facing shipping preview ─────────────────────────────────── */
  const shippingFee = Number(form.shipping_fee_npr);
  const shippingThreshold = Number(form.free_shipping_threshold_npr);
  let shippingPreview: string;
  if (!form.store_enabled) {
    shippingPreview = 'The shop is switched off — customers cannot place orders right now.';
  } else if (!Number.isFinite(shippingFee) || shippingFee <= 0) {
    shippingPreview = 'Free delivery on every order.';
  } else if (!Number.isFinite(shippingThreshold) || shippingThreshold <= 0) {
    shippingPreview = 'Threshold is 0 — free delivery on every order.';
  } else {
    shippingPreview = `Orders below ${formatNPR(shippingThreshold)} pay ${formatNPR(
      shippingFee
    )} delivery. Orders of ${formatNPR(shippingThreshold)} and above ship free.`;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Settings</p>
        <h1 className="mt-1 font-display text-2xl text-charcoal">Business configuration</h1>
        <p className="text-sm text-charcoal-soft">
          These values drive the public site header, footer, booking slots and WhatsApp links.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="rounded-xl bg-success/10 px-4 py-3 text-sm font-medium text-success">
          {success}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Salon details</CardTitle>
            <CardDescription>
              Changes are applied to the live site as soon as you save.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="h-11 animate-pulse-soft rounded-xl bg-charcoal/5" />
                ))}
              </div>
            ) : (
              <form onSubmit={handleSalonSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Phone" htmlFor="settings-phone" error={fieldErrors.phone ?? null}>
                    <Input
                      id="settings-phone"
                      value={form.phone}
                      onChange={(event) => patch('phone', event.target.value)}
                      placeholder="+977-9800000000"
                      inputMode="tel"
                      aria-invalid={Boolean(fieldErrors.phone)}
                    />
                  </Field>
                  <Field
                    label="WhatsApp number"
                    htmlFor="settings-whatsapp"
                    error={fieldErrors.whatsapp_number ?? null}
                    hint="Digits only, country code first."
                  >
                    <Input
                      id="settings-whatsapp"
                      value={form.whatsapp_number}
                      onChange={(event) => patch('whatsapp_number', event.target.value)}
                      placeholder="9779800000000"
                      inputMode="tel"
                      aria-invalid={Boolean(fieldErrors.whatsapp_number)}
                    />
                  </Field>
                </div>

                <Field label="Address" htmlFor="settings-address" error={fieldErrors.address ?? null}>
                  <Input
                    id="settings-address"
                    value={form.address}
                    onChange={(event) => patch('address', event.target.value)}
                    placeholder="Mahendranagar Road, Attariya Chowk, Kailali, Nepal"
                    aria-invalid={Boolean(fieldErrors.address)}
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Opening time" htmlFor="settings-open" error={fieldErrors.opening_time ?? null}>
                    <Input
                      id="settings-open"
                      type="time"
                      value={form.opening_time}
                      onChange={(event) => patch('opening_time', event.target.value)}
                      aria-invalid={Boolean(fieldErrors.opening_time)}
                    />
                  </Field>
                  <Field label="Closing time" htmlFor="settings-close" error={fieldErrors.closing_time ?? null}>
                    <Input
                      id="settings-close"
                      type="time"
                      value={form.closing_time}
                      onChange={(event) => patch('closing_time', event.target.value)}
                      aria-invalid={Boolean(fieldErrors.closing_time)}
                    />
                  </Field>
                </div>

                <Field
                  label="Announcement text"
                  htmlFor="settings-announcement"
                  error={fieldErrors.announcement_text ?? null}
                  hint="Shown across the top of the public site when the banner is on."
                >
                  <Textarea
                    id="settings-announcement"
                    rows={2}
                    value={form.announcement_text}
                    onChange={(event) => patch('announcement_text', event.target.value)}
                    placeholder="Dashain & Tihar offer: 10% off all hair treatments."
                    aria-invalid={Boolean(fieldErrors.announcement_text)}
                  />
                </Field>

                <label className="flex items-center gap-2 text-sm text-charcoal">
                  <input
                    type="checkbox"
                    checked={form.announcement_active}
                    onChange={(event) => patch('announcement_active', event.target.checked)}
                    className="h-4 w-4 rounded border-charcoal/30 text-rose-gold focus-visible:ring-rose-gold"
                  />
                  Show the announcement banner on the public site
                </label>

                <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
                  <Button type="submit" loading={saving} className="w-full sm:w-auto">
                    Save settings
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Banner preview</CardTitle>
              <CardDescription>How the announcement appears on the public site.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div
                className={cn(
                  'gradient-rose rounded-xl px-4 py-3 text-center text-sm font-medium text-white',
                  !form.announcement_active && 'opacity-50'
                )}
              >
                {form.announcement_text.trim() || 'Your announcement text will appear here.'}
              </div>
              <p className="text-xs text-charcoal-soft">
                {form.announcement_active
                  ? 'Banner is ON — visitors will see this message.'
                  : 'Banner is OFF — the message is hidden but kept for later.'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contact preview</CardTitle>
              <CardDescription>Used by the header, footer and WhatsApp deep links.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-charcoal">
                <span className="text-charcoal-soft">Phone: </span>
                {form.phone ? formatPhoneDisplay(form.phone) : '—'}
              </p>
              <p className="text-charcoal">
                <span className="text-charcoal-soft">WhatsApp: </span>
                {form.whatsapp_number ? formatPhoneDisplay(form.whatsapp_number) : '—'}
              </p>
              <p className="text-charcoal">
                <span className="text-charcoal-soft">Hours: </span>
                {form.opening_time} – {form.closing_time}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Store &amp; checkout</CardTitle>
          <CardDescription>
            Controls the shop: delivery pricing, payment options and the messages customers see at
            checkout. Saved with the same button flow as the salon details above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-11 animate-pulse-soft rounded-xl bg-charcoal/5" />
              ))}
            </div>
          ) : (
            <form onSubmit={handleStoreSubmit} className="space-y-4">
              <label className="flex items-center gap-2 text-sm text-charcoal">
                <input
                  type="checkbox"
                  checked={form.store_enabled}
                  onChange={(event) => patch('store_enabled', event.target.checked)}
                  className="h-4 w-4 rounded border-charcoal/30 text-rose-gold focus-visible:ring-rose-gold"
                />
                Store is open — customers can browse and order
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Shipping fee (NPR)"
                  htmlFor="settings-shipping-fee"
                  error={fieldErrors.shipping_fee_npr ?? null}
                  hint="Charged on orders below the free-shipping threshold."
                >
                  <Input
                    id="settings-shipping-fee"
                    type="number"
                    min={0}
                    value={form.shipping_fee_npr}
                    onChange={(event) => patch('shipping_fee_npr', event.target.value)}
                    aria-invalid={Boolean(fieldErrors.shipping_fee_npr)}
                  />
                </Field>

                <Field
                  label="Free shipping over (NPR)"
                  htmlFor="settings-shipping-threshold"
                  error={fieldErrors.free_shipping_threshold_npr ?? null}
                  hint="0 = always free delivery."
                >
                  <Input
                    id="settings-shipping-threshold"
                    type="number"
                    min={0}
                    value={form.free_shipping_threshold_npr}
                    onChange={(event) => patch('free_shipping_threshold_npr', event.target.value)}
                    aria-invalid={Boolean(fieldErrors.free_shipping_threshold_npr)}
                  />
                </Field>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-charcoal">Payment methods</p>
                <div className="flex flex-wrap items-center gap-6">
                  <label className="flex items-center gap-2 text-sm text-charcoal">
                    <input
                      type="checkbox"
                      checked={form.cod_enabled}
                      onChange={(event) => patch('cod_enabled', event.target.checked)}
                      className="h-4 w-4 rounded border-charcoal/30 text-rose-gold focus-visible:ring-rose-gold"
                    />
                    Cash on delivery
                  </label>
                  <label className="flex items-center gap-2 text-sm text-charcoal">
                    <input
                      type="checkbox"
                      checked={form.bank_transfer_enabled}
                      onChange={(event) => patch('bank_transfer_enabled', event.target.checked)}
                      className="h-4 w-4 rounded border-charcoal/30 text-rose-gold focus-visible:ring-rose-gold"
                    />
                    Bank transfer
                  </label>
                </div>
                {fieldErrors.cod_enabled ? (
                  <p role="alert" className="text-xs font-medium text-danger">
                    {fieldErrors.cod_enabled}
                  </p>
                ) : null}
              </div>

              <Field
                label="Payment instructions"
                htmlFor="settings-payment-instructions"
                hint="Shown to customers who choose bank transfer, eSewa or Khalti."
              >
                <Textarea
                  id="settings-payment-instructions"
                  rows={3}
                  value={form.payment_instructions}
                  onChange={(event) => patch('payment_instructions', event.target.value)}
                  placeholder="Transfer to Alikati Beauty Home, Nabil Bank, A/C 0123456789. Send the screenshot on WhatsApp."
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Support email"
                  htmlFor="settings-support-email"
                  error={fieldErrors.support_email ?? null}
                  hint="Optional. Shown on order confirmations."
                >
                  <Input
                    id="settings-support-email"
                    type="email"
                    value={form.support_email}
                    onChange={(event) => patch('support_email', event.target.value)}
                    placeholder="hello@alikatibeauty.com.np"
                    autoComplete="off"
                    aria-invalid={Boolean(fieldErrors.support_email)}
                  />
                </Field>

                <Field
                  label="Delivery note"
                  htmlFor="settings-delivery-note"
                  hint="Optional. A short note shown at checkout."
                >
                  <Input
                    id="settings-delivery-note"
                    value={form.delivery_note}
                    onChange={(event) => patch('delivery_note', event.target.value)}
                    placeholder="We deliver across Kailali within 1–2 days."
                    autoComplete="off"
                  />
                </Field>
              </div>

              <div className="rounded-xl bg-cream-100 px-4 py-3">
                <p className="eyebrow">Shipping preview</p>
                <p className="mt-1 text-sm text-charcoal">{shippingPreview}</p>
              </div>

              <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
                <Button type="submit" loading={saving} className="w-full sm:w-auto">
                  Save store settings
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payments &amp; QR</CardTitle>
          <CardDescription>
            What customers see when they pay by eSewa, Khalti or bank transfer. An uploaded QR image
            wins over the generated one — export your own receive-QR from the payment app for the
            surest scan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-11 animate-pulse-soft rounded-xl bg-charcoal/5" />
              ))}
            </div>
          ) : (
            <form
              onSubmit={(event) => void submitWith(event, validatePayments)}
              className="grid gap-6 lg:grid-cols-[1.6fr_1fr]"
            >
              <div className="space-y-4">
                <label className="flex items-center gap-2 text-sm text-charcoal">
                  <input
                    type="checkbox"
                    checked={form.payment_qr_enabled}
                    onChange={(event) => patch('payment_qr_enabled', event.target.checked)}
                    className="h-4 w-4 rounded border-charcoal/30 text-rose-gold focus-visible:ring-rose-gold"
                  />
                  Show a payment QR at checkout
                </label>

                <Field
                  label="QR text"
                  htmlFor="settings-qr-content"
                  error={fieldErrors.payment_qr_content ?? null}
                  hint="Encoded into a QR when no image is uploaded — e.g. esewa:9869512756"
                >
                  <Input
                    id="settings-qr-content"
                    value={form.payment_qr_content}
                    onChange={(event) => patch('payment_qr_content', event.target.value)}
                    placeholder="esewa:9869512756"
                    autoComplete="off"
                    aria-invalid={Boolean(fieldErrors.payment_qr_content)}
                  />
                  <p className="pt-1 text-xs text-charcoal-soft">
                    You can add the token{' '}
                    <code className="rounded bg-charcoal/5 px-1 font-mono text-[11px]">
                      {'{amount}'}
                    </code>{' '}
                    anywhere in the text — at checkout it is swapped for the customer&apos;s order
                    total, so{' '}
                    <span className="font-mono">esewa:9869512756?amount={'{amount}'}</span> becomes
                    the exact amount due. Whether the wallet pre-fills that amount depends on the
                    provider&apos;s QR format; the amount is also printed beside the code, so the
                    customer can always see what to pay.
                  </p>
                </Field>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-charcoal">QR image</p>
                  {form.payment_qr_image_url ? (
                    <div className="flex items-center gap-3 rounded-xl border border-charcoal/10 bg-white p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={form.payment_qr_image_url}
                        alt="Uploaded payment QR"
                        className="h-16 w-16 rounded-lg object-contain ring-1 ring-charcoal/10"
                      />
                      <span className="min-w-0 flex-1 text-xs text-charcoal-soft">
                        An uploaded image overrides the generated QR.
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => patch('payment_qr_image_url', '')}
                        className="h-10 shrink-0 px-2 text-danger hover:bg-danger/10 sm:h-8"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="hidden sm:inline">Remove</span>
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-charcoal-soft">
                      No image uploaded — the QR is generated from the text above.
                    </p>
                  )}
                  {/* The public `gallery` bucket is the project's shared image store. The folder is
                      cosmetic, and gallery items are database rows — not storage objects — so a QR
                      uploaded here never appears in the media library. */}
                  <ImageUploadDropzone
                    category="packages"
                    onUploaded={(url) => patch('payment_qr_image_url', url)}
                  />
                </div>

                <Field
                  label="Payment note"
                  htmlFor="settings-payment-note"
                  hint="Shown under the QR, e.g. “Send the screenshot on WhatsApp.”"
                >
                  <Textarea
                    id="settings-payment-note"
                    rows={2}
                    value={form.payment_note}
                    onChange={(event) => patch('payment_note', event.target.value)}
                    placeholder="After paying, send the screenshot on WhatsApp so we can confirm quickly."
                  />
                </Field>

                <Field
                  label="Default coupon length (days)"
                  htmlFor="settings-coupon-days"
                  error={fieldErrors.coupon_default_days ?? null}
                  hint="Pre-fills new coupons. 1–365 days."
                >
                  <Input
                    id="settings-coupon-days"
                    type="number"
                    min={1}
                    max={365}
                    value={form.coupon_default_days}
                    onChange={(event) => patch('coupon_default_days', event.target.value)}
                    aria-invalid={Boolean(fieldErrors.coupon_default_days)}
                  />
                </Field>

                <div className="rounded-xl bg-cream-100 px-4 py-3">
                  <label className="flex items-center gap-2 text-sm text-charcoal">
                    <input
                      type="checkbox"
                      checked={form.nepali_dates}
                      onChange={(event) => patch('nepali_dates', event.target.checked)}
                      className="h-4 w-4 rounded border-charcoal/30 text-rose-gold focus-visible:ring-rose-gold"
                    />
                    Show Nepali (Bikram Sambat) dates
                  </label>
                  <p className="mt-1 text-xs text-charcoal-soft">
                    Dates show as BS with the AD day alongside — today is{' '}
                    {formatBsDate(new Date(), { withAd: true })}. Switch off to show English (AD) dates
                    only.
                  </p>
                </div>

                <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
                  <Button type="submit" loading={saving} className="w-full sm:w-auto">
                    Save payment settings
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <p className="eyebrow">Live preview</p>
                <div className="rounded-2xl border border-charcoal/10 bg-white p-4 shadow-soft">
                  {form.payment_qr_enabled ? (
                    <PaymentQR
                      enabled={form.payment_qr_enabled}
                      content={form.payment_qr_content}
                      imageUrl={form.payment_qr_image_url}
                      note={form.payment_note}
                    />
                  ) : (
                    <p className="text-sm text-charcoal-soft">
                      The QR is switched off — customers see the payment instructions instead.
                    </p>
                  )}
                </div>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Saves itself: deliberately outside the form above, so an unrelated Save cannot revert a logo. */}
      <WatermarkSettingsCard />

      <Card>
        <CardHeader>
          <CardTitle>Landing page hero</CardTitle>
          <CardDescription>
            The photo and wording at the very top of the home page. The hero image appears at the top
            of the home page on phones and desktop; clear the image to bring back the bundled
            placeholder.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-11 animate-pulse-soft rounded-xl bg-charcoal/5" />
              ))}
            </div>
          ) : (
            <form
              onSubmit={(event) => void submitWith(event, validateHero)}
              className="grid gap-6 lg:grid-cols-[1.6fr_1fr]"
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-charcoal">Hero image</p>
                  {form.hero_image_url ? (
                    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-charcoal/10 bg-white p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={form.hero_image_url}
                        alt="Uploaded hero"
                        className="h-20 w-32 rounded-lg object-cover ring-1 ring-charcoal/10"
                      />
                      <span className="min-w-0 flex-1 text-xs text-charcoal-soft">
                        This photo is shown at the top of the home page instead of the placeholder.
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => patch('hero_image_url', '')}
                        className="h-10 shrink-0 px-2 text-danger hover:bg-danger/10 sm:h-8"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="hidden sm:inline">Remove</span>
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-charcoal-soft">
                      No image uploaded — the bundled placeholder photo is shown. Upload a real salon
                      photo to replace it.
                    </p>
                  )}
                  {/* Reuses the shared `gallery` bucket via the same dropzone as the QR image. */}
                  <ImageUploadDropzone
                    category="packages"
                    onUploaded={(url) => patch('hero_image_url', url)}
                  />
                </div>

                <Field
                  label="Heading"
                  htmlFor="settings-hero-heading"
                  error={fieldErrors.hero_heading ?? null}
                  hint="Up to 120 characters. The main line on the hero."
                >
                  <Input
                    id="settings-hero-heading"
                    value={form.hero_heading}
                    onChange={(event) => patch('hero_heading', event.target.value)}
                    placeholder="Salon, bridal studio and shop in Attariya Chowk"
                    maxLength={120}
                    autoComplete="off"
                    aria-invalid={Boolean(fieldErrors.hero_heading)}
                  />
                </Field>

                <Field
                  label="Subheading"
                  htmlFor="settings-hero-subheading"
                  error={fieldErrors.hero_subheading ?? null}
                  hint="Up to 200 characters. Sits under the heading."
                >
                  <Textarea
                    id="settings-hero-subheading"
                    rows={2}
                    value={form.hero_subheading}
                    onChange={(event) => patch('hero_subheading', event.target.value)}
                    placeholder="Book hair, skin, bridal and nail services, or order the products our stylists use — delivered across Kailali."
                    maxLength={200}
                    aria-invalid={Boolean(fieldErrors.hero_subheading)}
                  />
                </Field>

                <Field
                  label="Badge text"
                  htmlFor="settings-hero-badge"
                  error={fieldErrors.hero_badge_text ?? null}
                  hint="Optional. A short label shown on the hero image, up to 40 characters."
                >
                  <Input
                    id="settings-hero-badge"
                    value={form.hero_badge_text}
                    onChange={(event) => patch('hero_badge_text', event.target.value)}
                    placeholder="12+ years in Attariya"
                    maxLength={40}
                    autoComplete="off"
                    aria-invalid={Boolean(fieldErrors.hero_badge_text)}
                  />
                </Field>

                <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
                  <Button type="submit" loading={saving} className="w-full sm:w-auto">
                    Save hero
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <p className="eyebrow">Live preview</p>
                <div className="rounded-2xl border border-charcoal/10 bg-white p-4 shadow-soft">
                  <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-charcoal/10 bg-cream-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={form.hero_image_url || '/media/placeholder-salon.svg'}
                      alt="Hero preview"
                      className="h-full w-full object-cover"
                    />
                    {form.hero_badge_text.trim() ? (
                      <span className="absolute left-3 top-3 max-w-[80%] truncate rounded-full bg-white/85 px-2.5 py-1 text-xs font-medium text-charcoal shadow-soft">
                        {form.hero_badge_text.trim()}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 font-display text-lg leading-snug text-charcoal">
                    {form.hero_heading.trim() || 'Your hero heading will appear here.'}
                  </p>
                  <p className="mt-1 text-sm text-charcoal-soft">
                    {form.hero_subheading.trim() ||
                      'Your hero subheading will appear here, just under the heading.'}
                  </p>
                </div>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Multi-photo slideshow that drives the home-page hero (migration 0014). Lives beside the
          single "Landing page hero" image above, which stays as the no-slides fallback. */}
      <HeroSlideshowManager />

      {loading ? (
        <Card>
          <CardContent className="space-y-3 pt-5">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-11 animate-pulse-soft rounded-xl bg-charcoal/5" />
            ))}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Landing page promo band</CardTitle>
              <CardDescription>
                This is the coloured banner on the landing page; it hides when disabled, and you write
                the offer text yourself — the site never invents a discount claim.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(event) => void submitWith(event, validatePromo)}
                className="grid gap-6 lg:grid-cols-[1.6fr_1fr]"
              >
                <div className="space-y-4">
                  <label className="flex items-center gap-2 text-sm text-charcoal">
                    <input
                      type="checkbox"
                      checked={form.promo_enabled}
                      onChange={(event) => patch('promo_enabled', event.target.checked)}
                      className="h-4 w-4 rounded border-charcoal/30 text-rose-gold focus-visible:ring-rose-gold"
                    />
                    Show the promo band on the landing page
                  </label>

                  <Field
                    label="Eyebrow"
                    htmlFor="settings-promo-eyebrow"
                    hint="Optional. A short label above the headline."
                  >
                    <Input
                      id="settings-promo-eyebrow"
                      value={form.promo_eyebrow}
                      onChange={(event) => patch('promo_eyebrow', event.target.value)}
                      placeholder="Limited time offer"
                      autoComplete="off"
                    />
                  </Field>

                  <Field
                    label="Headline"
                    htmlFor="settings-promo-headline"
                    hint="The main line of the band."
                  >
                    <Input
                      id="settings-promo-headline"
                      value={form.promo_headline}
                      onChange={(event) => patch('promo_headline', event.target.value)}
                      placeholder="Festival offers are live"
                      autoComplete="off"
                    />
                  </Field>

                  <Field
                    label="Subheadline"
                    htmlFor="settings-promo-subheadline"
                    hint="Optional supporting line."
                  >
                    <Textarea
                      id="settings-promo-subheadline"
                      rows={2}
                      value={form.promo_subheadline}
                      onChange={(event) => patch('promo_subheadline', event.target.value)}
                      placeholder="See everything currently reduced across the shop."
                    />
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Button label"
                      htmlFor="settings-promo-cta"
                      error={fieldErrors.promo_cta_label ?? null}
                      hint="Up to 40 characters."
                    >
                      <Input
                        id="settings-promo-cta"
                        value={form.promo_cta_label}
                        onChange={(event) => patch('promo_cta_label', event.target.value)}
                        placeholder="Shop the offers"
                        maxLength={40}
                        autoComplete="off"
                        aria-invalid={Boolean(fieldErrors.promo_cta_label)}
                      />
                    </Field>

                    <Field
                      label="Button link"
                      htmlFor="settings-promo-href"
                      error={fieldErrors.promo_href ?? null}
                      hint="An internal path starting with / — for example /shop."
                    >
                      <Input
                        id="settings-promo-href"
                        value={form.promo_href}
                        onChange={(event) => patch('promo_href', event.target.value)}
                        placeholder="/shop"
                        autoComplete="off"
                        aria-invalid={Boolean(fieldErrors.promo_href)}
                      />
                    </Field>
                  </div>

                  <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
                    <Button type="submit" loading={saving} className="w-full sm:w-auto">
                      Save promo band
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="eyebrow">Live preview</p>
                  <div
                    className={cn(
                      'gradient-sale rounded-2xl p-5 text-center text-white',
                      !form.promo_enabled && 'opacity-50'
                    )}
                  >
                    {form.promo_eyebrow.trim() ? (
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
                        {form.promo_eyebrow.trim()}
                      </p>
                    ) : null}
                    <p className="mt-3 break-words font-display text-xl leading-tight">
                      {form.promo_headline.trim() || 'Your promo headline will appear here.'}
                    </p>
                    <p className="mx-auto mt-3 max-w-md break-words text-sm text-white/90">
                      {form.promo_subheadline.trim() || 'Add a supporting line for the offer.'}
                    </p>
                    {form.promo_cta_label.trim() ? (
                      <span className="mt-5 inline-flex min-h-11 items-center rounded-full bg-white px-5 text-sm font-semibold text-rose-600 shadow-soft">
                        {form.promo_cta_label.trim()}
                      </span>
                    ) : null}
                  </div>
                  {!form.promo_enabled ? (
                    <p className="text-xs text-charcoal-soft">
                      The band is turned off, so visitors will not see it.
                    </p>
                  ) : null}
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Affiliate programme</CardTitle>
              <CardDescription>
                Turn referrals on and set the default commission. Applicants apply on the public
                /affiliate page and appear in the console as pending until you approve them.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(event) => void submitWith(event, validateAffiliate)}
                className="space-y-4"
              >
                <label className="flex items-center gap-2 text-sm text-charcoal">
                  <input
                    type="checkbox"
                    checked={form.affiliate_enabled}
                    onChange={(event) => patch('affiliate_enabled', event.target.checked)}
                    className="h-4 w-4 rounded border-charcoal/30 text-rose-gold focus-visible:ring-rose-gold"
                  />
                  Affiliate programme is open to new applicants
                </label>

                <Field
                  label="Default commission rate (%)"
                  htmlFor="settings-affiliate-rate"
                  error={fieldErrors.affiliate_commission_rate ?? null}
                  hint="Between 0 and 50. Applied when you add an affiliate by hand."
                >
                  <Input
                    id="settings-affiliate-rate"
                    type="number"
                    min={0}
                    max={50}
                    step={0.5}
                    value={form.affiliate_commission_rate}
                    onChange={(event) => patch('affiliate_commission_rate', event.target.value)}
                    aria-invalid={Boolean(fieldErrors.affiliate_commission_rate)}
                  />
                </Field>

                <Field
                  label="Programme terms"
                  htmlFor="settings-affiliate-terms"
                  hint="Shown on the public affiliate page so applicants know the deal."
                >
                  <Textarea
                    id="settings-affiliate-terms"
                    rows={3}
                    value={form.affiliate_terms}
                    onChange={(event) => patch('affiliate_terms', event.target.value)}
                    placeholder="Earn 10% of every order you refer. Commission is paid on delivered orders."
                  />
                </Field>

                <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
                  <Button type="submit" loading={saving} className="w-full sm:w-auto">
                    Save affiliate settings
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cookie notice</CardTitle>
              <CardDescription>
                A small banner on the public site that explains cookies. It offers an “Essential only”
                choice so visitors can decline the optional ones.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(event) => void submitWith(event, validateNotices)}
                className="space-y-4"
              >
                <label className="flex items-center gap-2 text-sm text-charcoal">
                  <input
                    type="checkbox"
                    checked={form.cookie_notice_enabled}
                    onChange={(event) => patch('cookie_notice_enabled', event.target.checked)}
                    className="h-4 w-4 rounded border-charcoal/30 text-rose-gold focus-visible:ring-rose-gold"
                  />
                  Show the cookie notice on the public site
                </label>

                <Field
                  label="Notice text"
                  htmlFor="settings-cookie-text"
                  error={fieldErrors.cookie_notice_text ?? null}
                  hint="Plain language works best — it appears at the bottom of every page."
                >
                  <Textarea
                    id="settings-cookie-text"
                    rows={3}
                    value={form.cookie_notice_text}
                    onChange={(event) => patch('cookie_notice_text', event.target.value)}
                    placeholder="We use cookies to remember your cart and improve your visit. Choose Essential only to decline the rest."
                    aria-invalid={Boolean(fieldErrors.cookie_notice_text)}
                  />
                </Field>

                <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
                  <Button type="submit" loading={saving} className="w-full sm:w-auto">
                    Save cookie notice
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Install prompt</CardTitle>
              <CardDescription>
                A gentle banner on phones inviting visitors to add the site to their home screen. It
                offers the install — it cannot be forced automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(event) => void submitWith(event, validateNotices)}
                className="space-y-4"
              >
                <label className="flex items-center gap-2 text-sm text-charcoal">
                  <input
                    type="checkbox"
                    checked={form.app_prompt_enabled}
                    onChange={(event) => patch('app_prompt_enabled', event.target.checked)}
                    className="h-4 w-4 rounded border-charcoal/30 text-rose-gold focus-visible:ring-rose-gold"
                  />
                  Offer the home-screen install on phones
                </label>

                <Field
                  label="Prompt text"
                  htmlFor="settings-app-prompt"
                  error={fieldErrors.app_prompt_text ?? null}
                  hint="Keep it short — it is shown in a small banner."
                >
                  <Textarea
                    id="settings-app-prompt"
                    rows={2}
                    value={form.app_prompt_text}
                    onChange={(event) => patch('app_prompt_text', event.target.value)}
                    placeholder="Add Alikati to your home screen for faster bookings."
                    aria-invalid={Boolean(fieldErrors.app_prompt_text)}
                  />
                </Field>

                <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
                  <Button type="submit" loading={saving} className="w-full sm:w-auto">
                    Save install prompt
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Landing page sections</CardTitle>
              <CardDescription>
                Choose what the home page shows and in what order. Hidden sections stay saved but are
                not displayed to visitors.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(event) => void submitWith(event, validateLanding)}
                className="space-y-4"
              >
                <div>
                  <p className="text-sm font-medium text-charcoal">Visible sections</p>
                  {form.home_section_order.length === 0 ? (
                    <p className="mt-2 rounded-xl border border-dashed border-charcoal/15 bg-cream-100/50 px-3 py-4 text-center text-sm text-charcoal-soft">
                      No sections are visible. Show at least one below.
                    </p>
                  ) : (
                    <ol className="mt-2 space-y-2">
                      {form.home_section_order.map((key, index) => (
                        <li
                          key={key}
                          className="flex items-center gap-2 rounded-xl border border-charcoal/10 bg-surface px-3 py-2"
                        >
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-charcoal">
                            {HOME_SECTION_LABELS[key]}
                          </span>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-10 w-10 px-0 sm:h-8 sm:w-8"
                              disabled={index === 0}
                              onClick={() => moveSection(index, -1)}
                              aria-label={`Move ${HOME_SECTION_LABELS[key]} up`}
                            >
                              <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-10 w-10 px-0 sm:h-8 sm:w-8"
                              disabled={index === form.home_section_order.length - 1}
                              onClick={() => moveSection(index, 1)}
                              aria-label={`Move ${HOME_SECTION_LABELS[key]} down`}
                            >
                              <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-10 px-2 text-charcoal-soft sm:h-8"
                              onClick={() => hideSection(key)}
                              aria-label={`Hide ${HOME_SECTION_LABELS[key]}`}
                            >
                              <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                              <span className="hidden sm:inline">Hide</span>
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>

                {hiddenSections.length > 0 ? (
                  <div>
                    <p className="text-sm font-medium text-charcoal">Hidden sections</p>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {hiddenSections.map((key) => (
                        <li key={key}>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-10 sm:h-8"
                            onClick={() => showSection(key)}
                            aria-label={`Show ${HOME_SECTION_LABELS[key]}`}
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                            {HOME_SECTION_LABELS[key]}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="rounded-xl bg-cream-100 px-4 py-3">
                  <p className="eyebrow">Public order</p>
                  <p className="mt-1 text-sm text-charcoal">
                    {form.home_section_order.length > 0
                      ? form.home_section_order.map((key) => HOME_SECTION_LABELS[key]).join(' → ')
                      : 'Nothing is shown on the landing page.'}
                  </p>
                </div>

                {fieldErrors.home_section_order ? (
                  <p role="alert" className="text-xs font-medium text-danger">
                    {fieldErrors.home_section_order}
                  </p>
                ) : null}

                <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
                  <Button type="submit" loading={saving} className="w-full sm:w-auto">
                    Save section order
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Social &amp; contact</CardTitle>
              <CardDescription>
                These links appear in the public footer and feed the structured data search engines
                read.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(event) => void submitWith(event, validateSocial)} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Public email"
                    htmlFor="settings-email"
                    error={fieldErrors.email ?? null}
                    hint="Optional. Shown in the footer."
                  >
                    <Input
                      id="settings-email"
                      type="email"
                      value={form.email}
                      onChange={(event) => patch('email', event.target.value)}
                      placeholder="hello@alikatibeauty.com.np"
                      autoComplete="off"
                      aria-invalid={Boolean(fieldErrors.email)}
                    />
                  </Field>

                  <Field label="Facebook" htmlFor="settings-facebook" error={fieldErrors.facebook_url ?? null}>
                    <Input
                      id="settings-facebook"
                      type="url"
                      value={form.facebook_url}
                      onChange={(event) => patch('facebook_url', event.target.value)}
                      placeholder="https://facebook.com/…"
                      autoComplete="off"
                      aria-invalid={Boolean(fieldErrors.facebook_url)}
                    />
                  </Field>

                  <Field
                    label="Instagram"
                    htmlFor="settings-instagram"
                    error={fieldErrors.instagram_url ?? null}
                  >
                    <Input
                      id="settings-instagram"
                      type="url"
                      value={form.instagram_url}
                      onChange={(event) => patch('instagram_url', event.target.value)}
                      placeholder="https://instagram.com/…"
                      autoComplete="off"
                      aria-invalid={Boolean(fieldErrors.instagram_url)}
                    />
                  </Field>

                  <Field label="TikTok" htmlFor="settings-tiktok" error={fieldErrors.tiktok_url ?? null}>
                    <Input
                      id="settings-tiktok"
                      type="url"
                      value={form.tiktok_url}
                      onChange={(event) => patch('tiktok_url', event.target.value)}
                      placeholder="https://tiktok.com/@…"
                      autoComplete="off"
                      aria-invalid={Boolean(fieldErrors.tiktok_url)}
                    />
                  </Field>
                </div>

                <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
                  <Button type="submit" loading={saving} className="w-full sm:w-auto">
                    Save social links
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
