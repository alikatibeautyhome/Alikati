'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Phone } from 'lucide-react';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { getAcademyLeads, updateLead } from '@/lib/api-client';
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUS_STYLES,
  formatDateLong,
  formatPhoneDisplay,
  todayISO,
} from '@/lib/utils';
import type { AcademyLead, LeadStatus } from '@/types/database.types';

type LeadFilter = 'all' | LeadStatus;

const FILTERS: LeadFilter[] = ['all', 'new', 'contacted', 'enrolled', 'archived'];

/** Forward pipeline per current status, plus the archive/reopen escape hatches. */
const LEAD_NEXT: Record<LeadStatus, Array<{ status: LeadStatus; label: string }>> = {
  new: [
    { status: 'contacted', label: 'Mark contacted' },
    { status: 'archived', label: 'Archive' },
  ],
  contacted: [
    { status: 'enrolled', label: 'Mark enrolled' },
    { status: 'archived', label: 'Archive' },
  ],
  enrolled: [{ status: 'archived', label: 'Archive' }],
  archived: [{ status: 'new', label: 'Reopen' }],
};

function LeadRow({ lead, onChanged }: { lead: AcademyLead; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [draft, setDraft] = useState(lead.notes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    setDraft(lead.notes ?? '');
  }, [lead.notes]);

  async function advance(status: LeadStatus) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateLead(lead.id, { status });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this lead.');
    } finally {
      setBusy(false);
    }
  }

  async function saveNotes() {
    setSavingNotes(true);
    setError(null);
    try {
      await updateLead(lead.id, { notes: draft.trim() });
      setNotesOpen(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the call notes.');
    } finally {
      setSavingNotes(false);
    }
  }

  const nextSteps = LEAD_NEXT[lead.status];

  return (
    <div className="rounded-2xl border border-charcoal/10 bg-white p-4 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-charcoal">{lead.student_name}</p>
            <StatusBadge className={LEAD_STATUS_STYLES[lead.status]}>
              {LEAD_STATUS_LABELS[lead.status]}
            </StatusBadge>
          </div>

          <a
            href={`tel:${lead.student_phone}`}
            className="inline-flex items-center gap-1.5 text-sm text-rose-gold transition-colors hover:underline"
          >
            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
            {formatPhoneDisplay(lead.student_phone)}
          </a>

          <p className="text-sm text-charcoal-soft">{lead.course?.title ?? 'No course selected'}</p>
          <p className="text-xs text-charcoal-soft">
            Added {formatDateLong(todayISO(new Date(lead.created_at)))}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
           {nextSteps.map((step) => (
             <Button
               key={step.status}
               type="button"
               size="sm"
               variant={step.status === 'archived' ? 'outline' : 'secondary'}
               disabled={busy}
               onClick={() => void advance(step.status)}
               aria-label={`${step.label} — ${lead.student_name}`}
               className="h-10 sm:h-8"
             >
               {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
               {step.label}
             </Button>
           ))}

           <Button
             type="button"
             size="sm"
             variant="ghost"
             onClick={() => setNotesOpen((open) => !open)}
             aria-expanded={notesOpen}
             aria-label={`${lead.notes ? 'Edit' : 'Add'} call notes for ${lead.student_name}`}
             className="h-10 sm:h-8"
           >
             {lead.notes ? 'Edit call notes' : 'Add call notes'}
           </Button>
        </div>
      </div>

      {!notesOpen && lead.notes ? (
         <p className="mt-3 break-words rounded-lg bg-cream-100 p-2 text-xs text-charcoal-soft">{lead.notes}</p>
      ) : null}

      {notesOpen ? (
        <div className="mt-3 space-y-2">
          <label className="sr-only" htmlFor={`lead-notes-${lead.id}`}>
            Call notes for {lead.student_name}
          </label>
          <Textarea
            id={`lead-notes-${lead.id}`}
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="What was discussed on the call…"
          />
           <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
             <Button
               type="button"
               size="sm"
               variant="outline"
               disabled={savingNotes}
               onClick={() => {
                 setNotesOpen(false);
                 setDraft(lead.notes ?? '');
               }}
               className="h-10 w-full sm:h-8 sm:w-auto"
             >
               Cancel
             </Button>
             <Button
               type="button"
               size="sm"
               onClick={() => void saveNotes()}
               loading={savingNotes}
               className="h-10 w-full sm:h-8 sm:w-auto"
             >
               Save notes
             </Button>
           </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function AdminLeadsPage() {
  const [leads, setLeads] = useState<AcademyLead[]>([]);
  const [filter, setFilter] = useState<LeadFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await getAcademyLeads();
      setLeads(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load academy leads.');
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

  const counts: Record<LeadFilter, number> = {
    all: leads.length,
    new: 0,
    contacted: 0,
    enrolled: 0,
    archived: 0,
  };
  for (const lead of leads) counts[lead.status] += 1;

  const filtered = filter === 'all' ? leads : leads.filter((lead) => lead.status === filter);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Academy CRM</p>
        <h1 className="mt-1 font-display text-2xl text-charcoal">Course leads</h1>
        <p className="text-sm text-charcoal-soft">
          Move each enquiry along the pipeline: New → Contacted → Enrolled → Archived.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader className="gap-3">
          <div>
            <CardTitle>Pipeline</CardTitle>
            <CardDescription>{filtered.length} shown of {leads.length} leads</CardDescription>
          </div>

          <div className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-0.5">
            {FILTERS.map((status) => {
              const active = filter === status;
              const label = status === 'all' ? 'All' : LEAD_STATUS_LABELS[status];
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setFilter(status)}
                  aria-pressed={active}
                  className={
                    'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ' +
                    (active
                      ? 'border-rose-gold bg-rose-gold text-white'
                      : 'border-charcoal/15 bg-white text-charcoal-soft hover:border-rose-gold/40 hover:text-charcoal')
                  }
                >
                  {label}
                  <span className="rounded-full bg-charcoal/10 px-1.5 text-[10px] font-semibold text-charcoal">
                    {counts[status]}
                  </span>
                </button>
              );
            })}
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-24 animate-pulse-soft rounded-2xl bg-charcoal/5" />
            ))
          ) : leads.length === 0 ? (
            <div className="rounded-xl border border-dashed border-charcoal/15 bg-cream-100/50 px-4 py-10 text-center">
              <p className="text-sm font-medium text-charcoal">No academy leads yet.</p>
              <p className="mt-1 text-sm text-charcoal-soft">
                Enquiries from the public academy form will land here.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-charcoal/15 bg-cream-100/50 px-4 py-8 text-center text-sm text-charcoal-soft">
              No {filter === 'all' ? '' : LEAD_STATUS_LABELS[filter].toLowerCase()} leads.
            </div>
          ) : (
            filtered.map((lead) => <LeadRow key={lead.id} lead={lead} onChanged={() => void load()} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
