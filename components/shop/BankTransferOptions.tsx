'use client';

import * as React from 'react';
import { Check, Copy, QrCode } from 'lucide-react';
import { WatermarkBadge } from '@/components/shop/WatermarkBadge';
import { cn } from '@/lib/utils';
import type { PaymentAccount, PaymentProvider } from '@/types/commerce.types';

/**
 * The bank transfer step: one card per bank account, all visible at once.
 *
 * This replaced a tabbed view. Tabs hid every account but one behind a tap, which is the wrong shape
 * for choosing where to send money — a payer comparing "which bank am I closest to" could not see
 * the alternatives, and on a phone the tab strip competed with the QR for the same small screen.
 * Stacking them means the bank name, the code and the account details for each option are readable
 * in one scroll, with nothing to discover.
 *
 * Cards are built from the accounts that exist rather than a fixed list, so a bank with no configured
 * account simply does not appear.
 *
 * Everything a payer needs to get the transfer right has a copy button. That matters more than it
 * sounds — a mistyped amount on a QR transfer is a support conversation and a refund, and mobile
 * banking apps make copying the number the normal route.
 *
 * Each QR sits on a plain white card with a thin gold rule, because a QR photographed off a coloured
 * or busy background scans unreliably, and the shop's own mark is drawn in the corner as the badge
 * used across the storefront.
 */

const PROVIDER_LABELS: Record<PaymentProvider, string> = {
  esewa: 'eSewa',
  khalti: 'Khalti',
  bank: 'Bank Transfer',
  other: 'Other',
};

/** The heading a card uses: the override when set, otherwise the provider's own name. */
export function paymentAccountName(account: PaymentAccount): string {
  return account.label?.trim() || PROVIDER_LABELS[account.provider];
}

/** One-tap copy with a confirmation that reverts, so the button cannot be pressed twice blindly. */
function CopyButton({ value, label, className }: { value: string; label: string; className?: string }) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    []
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard access can be refused (insecure origin, permission). The value stays on screen,
      // which is the fallback — silently doing nothing would be worse than saying nothing.
      return;
    }
    setCopied(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      className={cn(
        // 44px minimum touch target, per the mobile guardrails.
        'inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors',
        copied
          ? 'border-success/30 bg-success/10 text-success'
          : 'border-charcoal/15 text-charcoal-soft hover:border-rose-gold/50 hover:text-charcoal',
        className
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

/** The three things a payer has to do, in the order they have to do them. Stated once, not per card. */
const STEPS = [
  'Scan the QR for the bank you are paying from, and transfer the exact amount.',
  'Enter the transaction / reference code from your receipt.',
  'Upload a screenshot of the payment.',
];

/** One bank account: heading, QR, what to pay, and where to send it. */
function BankCard({ account, amountText }: { account: PaymentAccount; amountText: string }) {
  const name = paymentAccountName(account);
  const holder = account.account_name?.trim();
  const identifier = account.account_identifier?.trim();
  const bankLine = [account.bank_name?.trim(), account.bank_branch?.trim()].filter(Boolean).join(' · ');

  return (
    <div className="space-y-4 rounded-2xl border border-charcoal/10 bg-white/60 p-4">
      {/* The bank name is the heading, so each card is identifiable before anything is read. */}
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-lg text-charcoal">{bankLine || name}</h3>
        <span className="text-[11px] uppercase tracking-wide text-charcoal-soft">Bank transfer</span>
      </div>

      {account.qr_image_url ? (
        <div className="relative mx-auto w-full max-w-[260px] overflow-hidden rounded-2xl border border-[#D4AF37]/40 bg-white p-3 shadow-soft">
          <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={account.qr_image_url}
              alt={`${name} QR code`}
              className="h-full w-full object-contain"
            />
            {/* The shop's own mark, bottom-left, as on every product photo. */}
            <WatermarkBadge />
          </div>
        </div>
      ) : (
        <p className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-charcoal/15 py-6 text-xs text-charcoal-soft">
          <QrCode className="h-4 w-4" aria-hidden="true" />
          No QR uploaded for this account — use the details below.
        </p>
      )}

      {/* Amount */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-cream-100/70 px-3 py-2">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-charcoal-soft">Payable total</p>
          <p className="font-display text-lg text-charcoal">{amountText}</p>
        </div>
        <CopyButton value={amountText.replace(/^[^\d]+/, '')} label="amount" />
      </div>

      {/* Account details */}
      <dl className="space-y-2 rounded-xl border border-charcoal/10 bg-white/70 px-3 py-3">
        {holder ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <dt className="text-[11px] uppercase tracking-wide text-charcoal-soft">Account holder</dt>
              <dd className="text-sm font-medium text-charcoal">{holder}</dd>
            </div>
          </div>
        ) : null}

        {identifier ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <dt className="text-[11px] uppercase tracking-wide text-charcoal-soft">
                {account.provider === 'bank' ? 'Account number' : 'Wallet number'}
              </dt>
              <dd className="font-mono text-sm font-medium text-charcoal">{identifier}</dd>
            </div>
            <CopyButton value={identifier} label="number" />
          </div>
        ) : null}

        {bankLine ? (
          <div className="min-w-0 border-t border-charcoal/5 pt-2">
            <dt className="text-[11px] uppercase tracking-wide text-charcoal-soft">Bank</dt>
            <dd className="text-sm font-medium text-charcoal">{bankLine}</dd>
          </div>
        ) : null}
      </dl>

      {account.instructions?.trim() ? (
        <p className="whitespace-pre-line rounded-xl bg-cream-100/70 px-3 py-2 text-xs text-charcoal-soft">
          {account.instructions}
        </p>
      ) : null}
    </div>
  );
}

export function BankTransferOptions({
  accounts,
  amount,
  currencyLabel = 'रू',
}: {
  accounts: PaymentAccount[];
  /** Order total, so the customer can transfer the exact figure. */
  amount: number;
  currencyLabel?: string;
}) {
  if (accounts.length === 0) return null;

  const amountText = `${currencyLabel} ${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      {accounts.length > 1 ? (
        <p className="text-sm text-charcoal-soft">
          You can transfer to either account — choose whichever bank is easier for you.
        </p>
      ) : null}

      {accounts.map((account) => (
        <BankCard key={account.id} account={account} amountText={amountText} />
      ))}

      {/* Stated once for the step as a whole rather than repeated under every card. */}
      <ol className="space-y-1.5 pt-1">
        {STEPS.map((step, index) => (
          <li key={step} className="flex gap-2 text-xs text-charcoal-soft">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-rose-gold/12 text-[10px] font-semibold text-rose-gold">
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
}
