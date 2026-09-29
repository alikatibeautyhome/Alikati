'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/label';
import { recordAffiliatePayout } from '@/lib/marketing-api';
import { formatNPR } from '@/lib/utils';
import type { AffiliatePerformance } from '@/types/marketing.types';

export interface AffiliatePayoutModalProps {
  open: boolean;
  onClose: () => void;
  performance: AffiliatePerformance | null;
  onPaid: () => void;
}

export function AffiliatePayoutModal({
  open,
  onClose,
  performance,
  onPaid,
}: AffiliatePayoutModalProps) {
  const outstanding = performance ? Number(performance.outstanding_npr) : 0;

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount(outstanding > 0 ? String(outstanding) : '');
    setNote('');
    setError(null);
    setSaving(false);
  }, [open, outstanding]);

  const parsed = Number(amount);
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed <= outstanding;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!performance) return;

    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter an amount greater than 0.');
      return;
    }
    if (parsed > outstanding) {
      setError(`You can pay at most ${formatNPR(outstanding)} right now.`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await recordAffiliatePayout(performance.affiliate.id, parsed, note.trim() || undefined);
      onPaid();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record this payout.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Record a payout"
      description={
        performance ? `Pay ${performance.affiliate.name} for commissions earned.` : undefined
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {performance ? (
          <div className="rounded-xl bg-cream-100 px-4 py-3 text-sm">
            <p className="text-charcoal-soft">
              Outstanding balance
              <span className="ml-2 font-display text-lg text-charcoal">
                {formatNPR(outstanding)}
              </span>
            </p>
            <p className="mt-1 text-xs text-charcoal-soft">
              Lifetime commission {formatNPR(performance.commission_npr)} · already paid{' '}
              {formatNPR(performance.affiliate.total_paid_npr)}
            </p>
          </div>
        ) : null}

        <Field
          label="Amount paid (NPR)"
          htmlFor="payout-amount"
          error={error}
          hint={`Cannot exceed the outstanding ${formatNPR(outstanding)}.`}
        >
          <Input
            id="payout-amount"
            type="number"
            min={0}
            max={outstanding}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-invalid={Boolean(error)}
          />
        </Field>

        {valid ? (
          <p className="text-xs text-charcoal-soft">
            After this payment they will still be owed {formatNPR(Math.max(0, outstanding - parsed))}.
          </p>
        ) : null}

        <Field label="Note" htmlFor="payout-note" hint="Optional — e.g. eSewa transfer reference.">
          <Textarea
            id="payout-note"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Paid in cash at the salon."
          />
        </Field>

        <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-col gap-2 border-t border-charcoal/10 bg-white px-5 pt-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button type="submit" loading={saving} disabled={!valid} className="w-full sm:w-auto">
            Record payout
          </Button>
        </div>
      </form>
    </Modal>
  );
}
