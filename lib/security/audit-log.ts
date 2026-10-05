import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Recording an entry in the security log, from the server.
 *
 * Two deliberate properties:
 *
 * **It never throws.** The log is important but it is not the work. A failure to write an audit
 * entry must not roll back the staff account that was just created, or turn a successful action into
 * a 500 the operator reads as "it didn't work". Callers get `false` and carry on; the failure is
 * reported in the server's own output where a developer can see it.
 *
 * **The actor is passed in, not inferred.** On the server there is no `auth.uid()` — the request has
 * already been authenticated by the caller's guard, which is the only place that knows both who the
 * caller is and whether they were allowed to act. So the guard's verdict is what gets recorded.
 * (The client-side path is the opposite: `log_security_event` derives the actor from the session,
 * because a browser must not be able to name the actor.)
 */

export interface AuditEntry {
  action: string;
  summary: string;
  entity?: string | null;
  entity_id?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordAuditEvent(
  admin: SupabaseClient,
  actor: { id: string; email?: string | null } | null,
  entry: AuditEntry,
  ip?: string | null
): Promise<boolean> {
  try {
    const { error } = await admin.from('security_events').insert({
      actor_id: actor?.id ?? null,
      // Denormalised on purpose: the entry must still read correctly after the account is deleted.
      actor_email: actor?.email ?? null,
      action: entry.action.slice(0, 80),
      entity: entry.entity ?? null,
      entity_id: entry.entity_id ?? null,
      summary: entry.summary.slice(0, 500),
      metadata: entry.metadata ?? {},
      ip: ip ? ip.slice(0, 64) : null,
    });
    if (error) {
      console.error('[audit] failed to record event', entry.action, error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[audit] threw while recording event', entry.action, error);
    return false;
  }
}
