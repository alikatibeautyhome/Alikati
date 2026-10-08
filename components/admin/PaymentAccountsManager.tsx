'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Pencil, Plus, QrCode, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { deletePaymentAccount, getPaymentAccounts, upsertPaymentAccount } from '@/lib/shop-admin-api';
import { deletePaymentQr, uploadPaymentQr } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { paymentAccountName } from '@/components/shop/BankTransferOptions';
import type { PaymentAccount, PaymentProvider } from '@/types/commerce.types';

/**
 * "Payment Accounts & QR Manager" — the destinations the shop accepts money into.
 *
 * One row per wallet or bank account, each with its own uploaded QR. Replaces the single
 * `salon_settings.payment_qr_*` pair, which could describe only one destination; the owner adds a
 * Khalti wallet next to their eSewa one here without a developer.
 *
 * The QR is uploaded, never generated: each provider's app exports the code it expects, and a code
 * invented here could encode a string the provider would refuse. `uploadPaymentQr` files it under
 * `payment-qr/` in the public bucket — deliberately not inside the media library's folders, since
 * this is configuration rather than an editorial asset.
 */

/** Mirrors the table's CHECK constraint and the checkout's tabs. */
const PROVIDER_LABELS: Record<PaymentProvider, string> = {
  esewa: 'eSewa',
  khalti: 'Khalti',
  bank: 'Bank Transfer',
  other: 'Other',
};

/** Mirrors the `gallery` bucket: images only, 8 MB. */
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

interface FormState {
  id?: string;
  provider: PaymentProvider;
  label: string;
  account_name: string;
  account_identifier: string;
  bank_name: string;
  bank_branch: string;
  qr_image_url: string;
  instructions: string;
  display_order: string;
  is_active: boolean;
}

function emptyForm(nextOrder: number): FormState {
  return {
    provider: 'esewa',
    label: '',
    account_name: '',
    account_identifier: '',
    bank_name: '',
    bank_branch: '',
    qr_image_url: '',
    instructions: '',
    display_order: String(nextOrder),
    is_active: true,
  };
}

function formFrom(account: PaymentAccount): FormState {
  return {
    id: account.id,
    provider: account.provider,
    label: account.label ?? '',
    account_name: account.account_name ?? '',
    account_identifier: account.account_identifier ?? '',
    bank_name: account.bank_name ?? '',
    bank_branch: account.bank_branch ?? '',
    qr_image_url: account.qr_image_url ?? '',
    instructions: account.instructions ?? '',
    display_order: String(account.display_order),
    is_active: account.is_active,
  };
}

export function PaymentAccountsManager() {
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm(1));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setAccounts(await getPaymentAccounts());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the payment accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreate() {
    // New accounts land at the end of the list rather than fighting for position 0.
    const nextOrder = accounts.reduce((max, item) => Math.max(max, item.display_order), 0) + 1;
    setForm(emptyForm(nextOrder));
    setError(null);
    setOpen(true);
  }

  function openEdit(account: PaymentAccount) {
    setForm(formFrom(account));
    setError(null);
    setOpen(true);
  }

  async function handleUpload(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(`"${file.name}" is ${file.type || 'not a recognised image'}. Use a PNG, JPG or WEBP.`);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 8 MB.`);
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const previous = form.qr_image_url;
      patch('qr_image_url', await uploadPaymentQr(file));
      // Only orphaned once the replacement has uploaded successfully.
      if (previous) void deletePaymentQr(previous);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload that QR image.');
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    // A destination with neither a number nor a QR gives the customer no way to pay it, which is
    // the one thing an account must never be.
    if (!form.account_identifier.trim() && !form.qr_image_url.trim()) {
      setError('Add at least the account number or a QR image — otherwise there is no way to pay this account.');
      return;
    }
    if (form.provider === 'bank' && !form.bank_name.trim()) {
      setError('Give the bank its name, so the customer knows where the transfer is going.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const previousQr = accounts.find((item) => item.id === form.id)?.qr_image_url ?? null;
      await upsertPaymentAccount({
        ...(form.id ? { id: form.id } : {}),
        provider: form.provider,
        label: form.label.trim() || null,
        account_name: form.account_name.trim() || null,
        account_identifier: form.account_identifier.trim() || null,
        // Bank fields are cleared when the provider changes away from bank, so a leftover name
        // cannot surface under a wallet.
        bank_name: form.provider === 'bank' ? form.bank_name.trim() || null : null,
        bank_branch: form.provider === 'bank' ? form.bank_branch.trim() || null : null,
        qr_image_url: form.qr_image_url.trim() || null,
        instructions: form.instructions.trim() || null,
        display_order: Number(form.display_order) || 0,
        is_active: form.is_active,
      });
      if (previousQr && previousQr !== form.qr_image_url.trim()) void deletePaymentQr(previousQr);
      setOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that account.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(account: PaymentAccount) {
    setError(null);
    try {
      await deletePaymentAccount(account.id);
      if (account.qr_image_url) void deletePaymentQr(account.qr_image_url);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete that account.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>Payment Accounts &amp; QR Manager</CardTitle>
            <CardDescription>
              Every account the shop accepts money into — eSewa, Khalti or a bank — each with its own
              QR. Customers get a tab per provider at checkout.
            </CardDescription>
          </div>
          <Button type="button" size="sm" onClick={openCreate} className="shrink-0">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add account
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-charcoal-soft">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading accounts…
          </p>
        ) : accounts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-charcoal/15 bg-cream-100/60 px-4 py-6 text-center text-sm text-charcoal-soft">
            No accounts yet. Until you add one, checkout falls back to the single QR in the payment
            settings below.
          </p>
        ) : (
          <ul className="divide-y divide-charcoal/10 rounded-xl border border-charcoal/10">
            {accounts.map((account) => {
              const detail =
                account.provider === 'bank'
                  ? [account.bank_name, account.account_identifier].filter(Boolean).join(' · ')
                  : [account.account_name, account.account_identifier].filter(Boolean).join(' · ');

              return (
                <li key={account.id} className="flex flex-wrap items-center gap-3 p-3">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-charcoal/10 bg-white">
                    {account.qr_image_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={account.qr_image_url}
                        alt={`${paymentAccountName(account)} QR code`}
                        className="h-full w-full object-contain p-0.5"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-charcoal-soft">
                        <QrCode className="h-5 w-5" aria-hidden="true" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-charcoal">
                      {paymentAccountName(account)}
                      <span className="rounded-full bg-charcoal/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-charcoal-soft">
                        {PROVIDER_LABELS[account.provider]}
                      </span>
                      {account.is_active ? (
                        <Badge className="bg-success/10 text-success ring-success/25">Active</Badge>
                      ) : (
                        <Badge>Hidden</Badge>
                      )}
                    </p>
                    <p className="truncate text-xs text-charcoal-soft">
                      {detail || 'No account details yet'}
                      {account.qr_image_url ? '' : ' · no QR uploaded'}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(account)}
                      aria-label={`Edit ${paymentAccountName(account)}`}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void remove(account)}
                      aria-label={`Delete ${paymentAccountName(account)}`}
                      className="text-danger hover:bg-danger/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {error ? (
          <p role="alert" className="text-xs font-medium text-danger">
            {error}
          </p>
        ) : null}
      </CardContent>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={form.id ? 'Edit payment account' : 'Add payment account'}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void save()} disabled={saving || uploading}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
              {form.id ? 'Save changes' : 'Add account'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Provider" htmlFor="payment-provider" hint="Becomes a tab at checkout.">
              <select
                id="payment-provider"
                value={form.provider}
                onChange={(event) => patch('provider', event.target.value as PaymentProvider)}
                className="h-11 w-full rounded-xl border border-charcoal/15 bg-white px-3 text-base text-charcoal focus:border-rose-gold focus:outline-none focus:ring-2 focus:ring-rose-gold/25 sm:h-10 sm:text-sm"
              >
                {(Object.keys(PROVIDER_LABELS) as PaymentProvider[]).map((provider) => (
                  <option key={provider} value={provider}>
                    {PROVIDER_LABELS[provider]}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Display name (optional)"
              htmlFor="payment-label"
              hint="Only needed for two accounts at the same provider."
            >
              <Input
                id="payment-label"
                value={form.label}
                onChange={(event) => patch('label', event.target.value)}
                placeholder="e.g. Current account"
                autoComplete="off"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Account holder name" htmlFor="payment-account-name">
              <Input
                id="payment-account-name"
                value={form.account_name}
                onChange={(event) => patch('account_name', event.target.value)}
                placeholder="e.g. Nirmala Khadka"
                autoComplete="off"
              />
            </Field>

            <Field
              label={form.provider === 'bank' ? 'Bank account number' : 'Wallet / mobile number'}
              htmlFor="payment-account-identifier"
            >
              <Input
                id="payment-account-identifier"
                value={form.account_identifier}
                onChange={(event) => patch('account_identifier', event.target.value)}
                placeholder="e.g. 9869512756"
                autoComplete="off"
              />
            </Field>
          </div>

          {/* Bank-only fields, hidden entirely for wallets so the form asks only what applies. */}
          {form.provider === 'bank' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Bank name" htmlFor="payment-bank-name">
                <Input
                  id="payment-bank-name"
                  value={form.bank_name}
                  onChange={(event) => patch('bank_name', event.target.value)}
                  placeholder="e.g. Nabil Bank"
                  autoComplete="off"
                />
              </Field>
              <Field label="Branch (optional)" htmlFor="payment-bank-branch">
                <Input
                  id="payment-bank-branch"
                  value={form.bank_branch}
                  onChange={(event) => patch('bank_branch', event.target.value)}
                  placeholder="e.g. Attariya"
                  autoComplete="off"
                />
              </Field>
            </div>
          ) : null}

          {/* ── QR ───────────────────────────────────────────────────────────── */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-charcoal">QR code</p>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-charcoal/10 bg-white">
                {form.qr_image_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={form.qr_image_url}
                    alt="QR preview"
                    className="h-full w-full object-contain p-1"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-charcoal-soft">
                    <QrCode className="h-6 w-6" aria-hidden="true" />
                    <span className="text-[11px]">No QR yet</span>
                  </div>
                )}
                {uploading ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/75">
                    <Loader2 className="h-5 w-5 animate-spin text-rose-gold" aria-hidden="true" />
                  </div>
                ) : null}
              </div>

              <div className="min-w-0 flex-1 space-y-2">
                <div
                  role="button"
                  tabIndex={saving ? -1 : 0}
                  aria-label="Upload QR image"
                  onClick={() => {
                    if (!saving && !uploading) fileRef.current?.click();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      if (!saving && !uploading) fileRef.current?.click();
                    }
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (!saving && !uploading) setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    const file = event.dataTransfer.files?.[0];
                    if (!saving && !uploading && file) void handleUpload(file);
                  }}
                  className={cn(
                    'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-charcoal/15 bg-white/70 px-4 py-5 text-center transition-colors',
                    dragging && 'border-rose-gold bg-blush-50',
                    (saving || uploading) && 'cursor-not-allowed opacity-60'
                  )}
                >
                  <ImagePlus className="h-5 w-5 text-rose-gold" aria-hidden="true" />
                  <p className="text-xs font-medium text-charcoal">
                    {form.qr_image_url ? 'Drag & drop to replace the QR' : 'Drag & drop the QR here'}
                  </p>
                  <p className="text-[11px] text-charcoal-soft">
                    or click to choose · PNG, JPG or WEBP · max 8 MB
                  </p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    disabled={saving || uploading}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) void handleUpload(file);
                    }}
                  />
                </div>

                <Field
                  label="Or paste a QR image URL"
                  htmlFor="payment-qr-url"
                  hint="For a code already published elsewhere."
                >
                  <Input
                    id="payment-qr-url"
                    value={form.qr_image_url}
                    onChange={(event) => patch('qr_image_url', event.target.value)}
                    placeholder="https://…"
                    autoComplete="off"
                  />
                </Field>
              </div>
            </div>
            <p className="text-[11px] text-charcoal-soft">
              Export the QR from the provider&apos;s own app — a code generated here could encode
              something the provider would not accept. Saved under <code>payment-qr/</code>, kept
              separate from the media library.
            </p>
          </div>

          <Field
            label="Notes for the customer"
            htmlFor="payment-instructions"
            hint="Shown under this account at checkout. Optional."
          >
            <Textarea
              id="payment-instructions"
              value={form.instructions}
              onChange={(event) => patch('instructions', event.target.value)}
              rows={2}
              placeholder="e.g. Send a screenshot of the transfer to confirm."
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Display order" htmlFor="payment-order" hint="Lowest first at checkout.">
              <Input
                id="payment-order"
                type="number"
                min={0}
                step={1}
                value={form.display_order}
                onChange={(event) => patch('display_order', event.target.value)}
              />
            </Field>

            <label className="flex min-h-[44px] cursor-pointer items-center gap-3 self-end rounded-xl border border-charcoal/10 bg-cream-100/60 px-4 py-3">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) => patch('is_active', event.target.checked)}
                className="h-4 w-4 accent-[var(--c-rose-gold,#b76e79)]"
              />
              <span className="text-sm font-medium text-charcoal">Show at checkout</span>
            </label>
          </div>

          {error ? (
            <p role="alert" className="text-xs font-medium text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </Modal>
    </Card>
  );
}
