'use client';

import { useState } from 'react';
import {
  Check,
  CheckCheck,
  Loader2,
  MessageCircle,
  Play,
  RotateCcw,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TD, TR } from '@/components/ui/table';
import { updateAppointmentStatus } from '@/lib/api-client';
import { FALLBACK_CONTACT } from '@/lib/supabase/config';
import {
  NEXT_STATUS,
  STATUS_LABELS,
  STATUS_STYLES,
  cn,
  formatNPR,
  formatPhoneDisplay,
  referenceCode,
  to12Hour,
} from '@/lib/utils';
import { createStatusNotificationLink } from '@/lib/whatsapp';
import type { Appointment, AppointmentStatus } from '@/types/database.types';

type NotifyStatus = 'confirmed' | 'cancelled' | 'completed';

const NOTIFY_STATUSES: NotifyStatus[] = ['confirmed', 'cancelled', 'completed'];

const ACTION_LABELS: Record<AppointmentStatus, string> = {
  pending: 'Mark pending',
  confirmed: 'Confirm',
  in_progress: 'Start',
  completed: 'Complete',
  cancelled: 'Cancel',
};

/** Icon paired with each action so the button can collapse to an icon on narrow screens. */
const ACTION_ICONS: Record<AppointmentStatus, LucideIcon> = {
  pending: RotateCcw,
  confirmed: Check,
  in_progress: Play,
  completed: CheckCheck,
  cancelled: X,
};

export interface AppointmentRowProps {
  appointment: Appointment;
  /** Re-run the parent's loader after a successful status change. */
  onChange: () => void;
  compact?: boolean;
  /** `row` renders a table row; `card` renders a board card. */
  variant?: 'row' | 'card';
}

/**
 * One appointment with its dispatch actions. Owns the in-flight state for status mutations so
 * the buttons disable while a request is open, then hands control back via `onChange`.
 */
export function AppointmentRow({
  appointment,
  onChange,
  compact = false,
  variant = 'row',
}: AppointmentRowProps) {
  const [pending, setPending] = useState<AppointmentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const serviceTitle = appointment.service?.title ?? 'Service unavailable';
  const nextStatuses = NEXT_STATUS[appointment.status];
  const notifications = nextStatuses.filter((status): status is NotifyStatus =>
    NOTIFY_STATUSES.includes(status as NotifyStatus)
  );

  async function advance(status: AppointmentStatus) {
    if (pending) return;
    setPending(status);
    setError(null);
    try {
      await updateAppointmentStatus(appointment.id, status);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this appointment.');
    } finally {
      setPending(null);
    }
  }

  function notifyLink(status: NotifyStatus) {
    return createStatusNotificationLink({
      client_phone: appointment.client_phone,
      client_name: appointment.client_name,
      service_title: serviceTitle,
      booking_date: appointment.booking_date,
      booking_time: appointment.booking_time,
      status,
      business_whatsapp: FALLBACK_CONTACT.whatsapp,
    });
  }

  const statusChip = (
    <StatusBadge className={STATUS_STYLES[appointment.status]}>
      {STATUS_LABELS[appointment.status]}
    </StatusBadge>
  );

  const actions = (
    <div className="flex flex-wrap items-center gap-1.5">
      {nextStatuses.map((status) => {
        const ActionIcon = ACTION_ICONS[status];
        return (
          <Button
            key={status}
            type="button"
            size="sm"
            variant={status === 'cancelled' ? 'outline' : 'secondary'}
            disabled={pending !== null}
            onClick={() => void advance(status)}
            aria-label={`${ACTION_LABELS[status]} — ${appointment.client_name}`}
            className="h-10 min-w-10 sm:h-8 sm:min-w-0"
          >
            {pending === status ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <ActionIcon className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">{ACTION_LABELS[status]}</span>
          </Button>
        );
      })}

      {notifications.map((status) => (
        <a
          key={status}
          href={notifyLink(status)}
          target="_blank"
          rel="noreferrer"
          aria-label={status === 'confirmed' ? 'Send confirmation' : `Notify ${STATUS_LABELS[status]}`}
          className="inline-flex h-10 min-w-10 items-center justify-center gap-1 rounded-full border border-charcoal/15 bg-white/70 px-3 text-xs font-medium text-charcoal transition-colors hover:border-rose-gold/40 hover:text-rose-gold sm:h-8 sm:min-w-0"
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">
            {status === 'confirmed' ? 'Send confirmation' : `Notify ${STATUS_LABELS[status]}`}
          </span>
        </a>
      ))}

      {nextStatuses.length === 0 && notifications.length === 0 ? (
        <span className="text-xs text-charcoal-soft">No further actions</span>
      ) : null}
    </div>
  );

  const errorLine = error ? (
    <p role="alert" className="mt-1 text-xs font-medium text-danger">
      {error}
    </p>
  ) : null;

  if (variant === 'card') {
    return (
      <div className={cn('rounded-xl border border-charcoal/10 bg-white shadow-soft', compact ? 'p-2.5' : 'p-3')}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-charcoal">{to12Hour(appointment.booking_time)}</p>
            <p className="truncate text-sm text-charcoal">{appointment.client_name}</p>
            <a
              href={`tel:${appointment.client_phone}`}
              className="text-xs text-charcoal-soft transition-colors hover:text-rose-gold"
            >
              {formatPhoneDisplay(appointment.client_phone)}
            </a>
          </div>
          <div className="flex flex-col items-end gap-1">
            {statusChip}
            {appointment.is_walk_in ? (
              <Badge className="bg-blush-200 text-charcoal">Walk-in</Badge>
            ) : null}
          </div>
        </div>

        <p className="mt-2 truncate text-sm text-charcoal-soft">{serviceTitle}</p>
        <p className="text-xs text-charcoal-soft">
          {referenceCode(appointment.id)} · {formatNPR(appointment.total_amount_npr)}
        </p>
        {appointment.notes ? (
          <p className="mt-2 break-words rounded-lg bg-cream-100 p-2 text-xs text-charcoal-soft">
            {appointment.notes}
          </p>
        ) : null}

        <div className="mt-3">{actions}</div>
        {errorLine}
      </div>
    );
  }

  return (
    <TR className={cn(compact && 'text-xs')}>
      <TD className={cn('whitespace-nowrap font-medium', compact && 'py-2')}>
        {to12Hour(appointment.booking_time)}
      </TD>
      <TD className={cn('min-w-[150px]', compact && 'py-2')}>
        <p className="font-medium text-charcoal">{appointment.client_name}</p>
        <a
          href={`tel:${appointment.client_phone}`}
          className="text-xs text-charcoal-soft transition-colors hover:text-rose-gold"
        >
          {formatPhoneDisplay(appointment.client_phone)}
        </a>
      </TD>
      <TD className={cn('min-w-[160px]', compact && 'py-2')}>
        <p className="text-charcoal">{serviceTitle}</p>
        <p className="text-xs capitalize text-charcoal-soft">
          {appointment.service?.category ? `${appointment.service.category} · ` : ''}
          {formatNPR(appointment.total_amount_npr)}
        </p>
      </TD>
      <TD className={cn('whitespace-nowrap text-xs text-charcoal-soft', compact && 'py-2')}>
        {referenceCode(appointment.id)}
      </TD>
      <TD className={cn(compact && 'py-2')}>
        <div className="flex flex-col items-start gap-1">
          {statusChip}
          {appointment.is_walk_in ? (
            <Badge className="bg-blush-200 text-charcoal">Walk-in</Badge>
          ) : null}
        </div>
      </TD>
      <TD className={cn('min-w-0 sm:min-w-[260px]', compact && 'py-2')}>
        {actions}
        {errorLine}
      </TD>
    </TR>
  );
}
