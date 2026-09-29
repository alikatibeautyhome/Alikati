'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import { StatTile } from '@/components/admin/StatTile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { createStaff, listStaff, updateStaff } from '@/lib/staff-api';
import type { AccountRole, StaffAccount } from '@/lib/staff-api';
import { cn, formatPhoneDisplay } from '@/lib/utils';

/**
 * Staff & user accounts.
 *
 * Auth-admin work (creating logins, resetting passwords) cannot be done from the browser with a
 * publishable key, so every mutation goes through `/api/admin/staff` via `lib/staff-api.ts`. The
 * route re-verifies that the caller is an active administrator and refuses to let an admin remove
 * their own access or the last administrator — those server messages are surfaced verbatim here so
 * the guard is never silently swallowed.
 *
 * There is deliberately no "delete user" action: the API does not support one, and an account's
 * order history must keep pointing at a real person.
 */

const ROLE_LABELS: Record<AccountRole, string> = {
  admin: 'Administrator',
  staff: 'Staff',
  customer: 'Customer',
};

const ROLE_STYLES: Record<AccountRole, string> = {
  admin: 'bg-rose-gold/10 text-rose-gold ring-rose-gold/25',
  staff: 'bg-blush-100 text-charcoal ring-charcoal/10',
  customer: 'bg-charcoal/5 text-charcoal-soft ring-charcoal/10',
};

const ROLE_ORDER: AccountRole[] = ['admin', 'staff', 'customer'];

/** Business date + time (Asia/Kathmandu) for a sign-in timestamp. */
function lastSeen(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kathmandu',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/* ─────────────────────────────────────────────────── create account modal ── */

interface CreateAccountModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (message: string) => void;
}

function CreateAccountModal({ open, onClose, onCreated }: CreateAccountModalProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<AccountRole>('staff');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setFullName('');
    setEmail('');
    setPassword('');
    setPhone('');
    setRole('staff');
    setSaving(false);
    setFormError(null);
    setFieldErrors({});
  }, [open]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const localErrors: Record<string, string> = {};
    if (!fullName.trim()) localErrors.full_name = 'Enter the person’s name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      localErrors.email = 'Enter a valid email address.';
    }
    if (password.length < 8) localErrors.password = 'Use at least 8 characters.';
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      return;
    }

    setSaving(true);
    try {
      const result = await createStaff({
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        role,
        phone: phone.trim() || undefined,
      });
      if (!result.ok) {
        setFormError(result.error ?? 'Could not create the account.');
        setFieldErrors(result.fields ?? {});
        return;
      }
      onCreated(`Created ${email.trim()} as ${ROLE_LABELS[role]}.`);
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create the account.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Create an account"
      description="A login for a staff member, another administrator, or a shop customer."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Full name" htmlFor="user-name" error={fieldErrors.full_name ?? null}>
          <Input
            id="user-name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Sita Sharma"
            autoComplete="off"
            aria-invalid={Boolean(fieldErrors.full_name)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" htmlFor="user-email" error={fieldErrors.email ?? null}>
            <Input
              id="user-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="person@alikatibeauty.com.np"
              autoComplete="off"
              inputMode="email"
              aria-invalid={Boolean(fieldErrors.email)}
            />
          </Field>

          <Field
            label="Password"
            htmlFor="user-password"
            error={fieldErrors.password ?? null}
            hint="At least 8 characters, with a letter and a number."
          >
            <Input
              id="user-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              aria-invalid={Boolean(fieldErrors.password)}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" htmlFor="user-phone" hint="Optional.">
            <Input
              id="user-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="9840000000"
              inputMode="tel"
              autoComplete="off"
            />
          </Field>

          <Field label="Role" htmlFor="user-role" hint="What this account is allowed to do.">
            <Select
              id="user-role"
              value={role}
              onChange={(event) => setRole(event.target.value as AccountRole)}
            >
              {ROLE_ORDER.map((option) => (
                <option key={option} value={option}>
                  {ROLE_LABELS[option]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {role === 'customer' ? (
          <p className="rounded-xl bg-cream-100 px-3 py-2 text-sm text-charcoal-soft">
            A <span className="font-medium text-charcoal">customer</span> account has no console
            access. It can sign in to the shop, view past orders and track a delivery — nothing in
            this dashboard.
          </p>
        ) : (
          <p className="rounded-xl bg-cream-100 px-3 py-2 text-sm text-charcoal-soft">
            A <span className="font-medium text-charcoal">{ROLE_LABELS[role]}</span> account can sign
            in to this console.
            {role === 'admin'
              ? ' Administrators can manage every part of the website, including other accounts.'
              : ' Staff can run day-to-day salon and shop operations.'}
          </p>
        )}

        {formError ? (
          <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
            {formError}
          </p>
        ) : null}

        <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-col gap-2 border-t border-charcoal/10 bg-white px-5 pt-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button type="submit" loading={saving} className="w-full sm:w-auto">
            Create account
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ───────────────────────────────────────────────────── edit account modal ── */

interface EditAccountModalProps {
  open: boolean;
  onClose: () => void;
  account: StaffAccount;
  /** The signed-in admin's own row — role changes are disabled to prevent self-lockout. */
  isSelf: boolean;
  onSaved: (message: string) => void;
}

function EditAccountModal({ open, onClose, account, isSelf, onSaved }: EditAccountModalProps) {
  const [fullName, setFullName] = useState(account.full_name);
  const [phone, setPhone] = useState(account.phone ?? '');
  const [role, setRole] = useState<AccountRole>(account.role);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setFullName(account.full_name);
    setPhone(account.phone ?? '');
    setRole(account.role);
    setPassword('');
    setSaving(false);
    setFormError(null);
    setFieldErrors({});
  }, [open, account]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const localErrors: Record<string, string> = {};
    if (!fullName.trim()) localErrors.full_name = 'Enter the person’s name.';
    if (password && password.length < 8) localErrors.password = 'Use at least 8 characters.';
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      return;
    }

    setSaving(true);
    try {
      const result = await updateStaff({
        id: account.id,
        // Never send a role for your own row — the server would reject it as self-demotion,
        // and the select is disabled here anyway.
        ...(isSelf ? {} : { role }),
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        ...(password ? { password } : {}),
      });
      if (!result.ok) {
        setFormError(result.error ?? 'Could not update the account.');
        setFieldErrors(result.fields ?? {});
        return;
      }
      onSaved(`Saved changes to ${account.full_name}.`);
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not update the account.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Edit account"
      description={account.email}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Full name" htmlFor="edit-user-name" error={fieldErrors.full_name ?? null}>
          <Input
            id="edit-user-name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            autoComplete="off"
            aria-invalid={Boolean(fieldErrors.full_name)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" htmlFor="edit-user-phone" hint="Optional.">
            <Input
              id="edit-user-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="9840000000"
              inputMode="tel"
              autoComplete="off"
            />
          </Field>

          <Field
            label="Role"
            htmlFor="edit-user-role"
            hint={isSelf ? 'You cannot change your own role.' : 'Changing a role takes effect immediately.'}
          >
            <Select
              id="edit-user-role"
              value={role}
              disabled={isSelf}
              onChange={(event) => setRole(event.target.value as AccountRole)}
            >
              {ROLE_ORDER.map((option) => (
                <option key={option} value={option}>
                  {ROLE_LABELS[option]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {isSelf ? (
          <p className="rounded-xl bg-cream-100 px-3 py-2 text-sm text-charcoal-soft">
            This is your own account. To avoid locking yourself out, your role and active state are
            locked. You can still update your name, number and password.
          </p>
        ) : null}

        <Field
          label="Reset password"
          htmlFor="edit-user-password"
          error={fieldErrors.password ?? null}
          hint="Leave blank to keep the current password. Changing it signs the person out everywhere."
        >
          <Input
            id="edit-user-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="New password (optional)"
            autoComplete="new-password"
            aria-invalid={Boolean(fieldErrors.password)}
          />
        </Field>

        {formError ? (
          <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
            {formError}
          </p>
        ) : null}

        <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-col gap-2 border-t border-charcoal/10 bg-white px-5 pt-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button type="submit" loading={saving} className="w-full sm:w-auto">
            Save changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ─────────────────────────────────────────────────────────────── the page ── */

export default function AdminUsersPage() {
  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [you, setYou] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | AccountRole>('all');
  const [activeOnly, setActiveOnly] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StaffAccount | null>(null);

  const [deactivateTarget, setDeactivateTarget] = useState<StaffAccount | null>(null);
  const [toggleBusyId, setToggleBusyId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await listStaff();
      if (!result.ok) {
        setError(result.error ?? 'Could not load accounts.');
        return;
      }
      setAccounts(result.staff);
      setYou(result.you ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load accounts.');
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

  const summary = useMemo(() => {
    const admins = accounts.filter((account) => account.role === 'admin' && account.is_active).length;
    const staff = accounts.filter((account) => account.role === 'staff').length;
    const customers = accounts.filter((account) => account.role === 'customer').length;
    const inactive = accounts.filter((account) => !account.is_active).length;
    return { admins, staff, customers, inactive };
  }, [accounts]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return accounts.filter((account) => {
      if (roleFilter !== 'all' && account.role !== roleFilter) return false;
      if (activeOnly && !account.is_active) return false;
      if (!needle) return true;
      const haystack = `${account.full_name} ${account.email} ${account.phone ?? ''}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [accounts, search, roleFilter, activeOnly]);

  /** Turns a stored role into a chip; `readonly` rows get a muted treatment. */
  function RoleChip({ role }: { role: AccountRole }) {
    return (
      <Badge className={cn('capitalize', ROLE_STYLES[role])}>
        {role === 'admin' ? <ShieldCheck className="h-3 w-3" aria-hidden="true" /> : null}
        {ROLE_LABELS[role]}
      </Badge>
    );
  }

  async function activate(account: StaffAccount) {
    setToggleBusyId(account.id);
    setToggleError(null);
    setNotice(null);
    try {
      const result = await updateStaff({ id: account.id, is_active: true });
      if (!result.ok) {
        setToggleError(result.error ?? 'Could not reactivate the account.');
        return;
      }
      setNotice(`${account.full_name} can sign in again.`);
      await load();
    } catch (err) {
      setToggleError(err instanceof Error ? err.message : 'Could not reactivate the account.');
    } finally {
      setToggleBusyId(null);
    }
  }

  async function confirmDeactivate() {
    if (!deactivateTarget) return;
    setToggleBusyId(deactivateTarget.id);
    setToggleError(null);
    try {
      const result = await updateStaff({ id: deactivateTarget.id, is_active: false });
      if (!result.ok) {
        setToggleError(result.error ?? 'Could not deactivate the account.');
        return;
      }
      setNotice(`${deactivateTarget.full_name} can no longer sign in. Reactivate any time.`);
      setDeactivateTarget(null);
      await load();
    } catch (err) {
      setToggleError(err instanceof Error ? err.message : 'Could not deactivate the account.');
    } finally {
      setToggleBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Team</p>
          <h1 className="mt-1 font-display text-2xl text-charcoal">Users &amp; access</h1>
          <p className="text-sm text-charcoal-soft">
            Create logins, set roles and revoke access. Accounts are never deleted — order history
            stays attached to the person.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => setCreateOpen(true)} className="w-full sm:w-auto">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Create account
        </Button>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-xl bg-success/10 px-4 py-3 text-sm font-medium text-success">
          {notice}
        </p>
      ) : null}
      {toggleError ? (
        <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {toggleError}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Administrators" value={String(summary.admins)} tone="progress" />
        <StatTile label="Staff" value={String(summary.staff)} tone="neutral" />
        <StatTile label="Customers" value={String(summary.customers)} tone="revenue" />
        <StatTile label="Deactivated" value={String(summary.inactive)} tone="pending" />
      </div>

      <Card>
        <CardHeader className="gap-4">
          <div>
            <CardTitle>All accounts</CardTitle>
            <CardDescription>
              {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'} · showing {filtered.length}
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[12rem] flex-1 space-y-1.5">
              <label className="text-xs font-medium text-charcoal-soft" htmlFor="users-search">
                Search
              </label>
              <Input
                id="users-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, email or phone"
                autoComplete="off"
              />
            </div>
            <div className="min-w-[10rem] space-y-1.5">
              <label className="text-xs font-medium text-charcoal-soft" htmlFor="users-role">
                Role
              </label>
              <Select
                id="users-role"
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value as 'all' | AccountRole)}
              >
                <option value="all">All roles</option>
                {ROLE_ORDER.map((option) => (
                  <option key={option} value={option}>
                    {ROLE_LABELS[option]}
                  </option>
                ))}
              </Select>
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm text-charcoal">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(event) => setActiveOnly(event.target.checked)}
                className="h-4 w-4 rounded border-charcoal/30 text-rose-gold focus-visible:ring-rose-gold"
              />
              Active only
            </label>
          </div>
        </CardHeader>

        <CardContent>
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Email</TH>
                  <TH>Role</TH>
                  <TH>Status</TH>
                  <TH>Phone</TH>
                  <TH>Last sign-in</TH>
                  <TH>Actions</TH>
                </TR>
              </THead>
              <TBody>
                {loading ? (
                  <TR>
                    <TD colSpan={7} className="py-8 text-center text-sm text-charcoal-soft">
                      Loading accounts…
                    </TD>
                  </TR>
                ) : filtered.length === 0 ? (
                  <TR>
                    <TD colSpan={7} className="py-8 text-center text-sm text-charcoal-soft">
                      No accounts match these filters.
                    </TD>
                  </TR>
                ) : (
                  filtered.map((account) => {
                    const isSelf = you !== null && account.id === you;
                    const busy = toggleBusyId === account.id;
                    return (
                      <TR key={account.id} className="align-top">
                        <TD className="min-w-[160px]">
                          <span className="block font-medium text-charcoal">{account.full_name}</span>
                          {isSelf ? (
                            <Badge className="mt-1 bg-rose-gold/10 text-rose-gold ring-rose-gold/25">
                              You
                            </Badge>
                          ) : null}
                        </TD>
                        <TD className="min-w-[200px] break-all text-charcoal-soft">{account.email}</TD>
                        <TD>
                          <RoleChip role={account.role} />
                        </TD>
                        <TD className="whitespace-nowrap">
                          {account.is_active ? (
                            <Badge className="bg-success/10 text-success ring-success/25">Active</Badge>
                          ) : (
                            <Badge className="bg-danger/10 text-danger ring-danger/25">Inactive</Badge>
                          )}
                        </TD>
                        <TD className="whitespace-nowrap text-charcoal-soft">
                          {account.phone ? formatPhoneDisplay(account.phone) : '—'}
                        </TD>
                        <TD className="whitespace-nowrap text-charcoal-soft">
                          {lastSeen(account.last_sign_in_at ?? account.last_login_at)}
                        </TD>
                        <TD>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setEditTarget(account)}
                              aria-label={`Edit ${account.full_name}`}
                              className="h-10 min-w-10 sm:h-8 sm:min-w-0"
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                              <span className="hidden sm:inline">Edit</span>
                            </Button>

                            {isSelf ? (
                              <span className="px-1 text-xs text-charcoal-soft">Your own account</span>
                            ) : account.is_active ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => {
                                  setToggleError(null);
                                  setDeactivateTarget(account);
                                }}
                                aria-label={`Deactivate ${account.full_name}`}
                                className="h-10 min-w-10 text-danger hover:bg-danger/10 sm:h-8 sm:min-w-0"
                              >
                                {busy ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                ) : (
                                  <UserX className="h-3.5 w-3.5" aria-hidden="true" />
                                )}
                                <span className="hidden sm:inline">Deactivate</span>
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => void activate(account)}
                                aria-label={`Reactivate ${account.full_name}`}
                                className="h-10 min-w-10 sm:h-8 sm:min-w-0"
                              >
                                {busy ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                ) : (
                                  <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                )}
                                <span className="hidden sm:inline">Reactivate</span>
                              </Button>
                            )}
                          </div>
                        </TD>
                      </TR>
                    );
                  })
                )}
              </TBody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>

      <CreateAccountModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(message) => {
          setNotice(message);
          setToggleError(null);
          void load();
        }}
      />

      {editTarget ? (
        <EditAccountModal
          open={editTarget !== null}
          onClose={() => setEditTarget(null)}
          account={editTarget}
          isSelf={you !== null && editTarget.id === you}
          onSaved={(message) => {
            setNotice(message);
            setToggleError(null);
            void load();
          }}
        />
      ) : null}

      <Modal
        open={deactivateTarget !== null}
        onClose={() => setDeactivateTarget(null)}
        size="sm"
        title="Deactivate account"
        description={
          deactivateTarget ? `Revoke console access for ${deactivateTarget.full_name}?` : 'Deactivate this account?'
        }
      >
        <div className="space-y-4">
          <p className="rounded-xl bg-warn/10 px-3 py-2 text-sm text-charcoal">
            Access is revoked immediately — the person is signed out of the console on their next
            request and cannot sign back in. This is fully reversible: press{' '}
            <span className="font-medium">Reactivate</span> on the row to restore access. Nothing is
            deleted, so their order history stays intact.
          </p>
          {toggleError ? (
            <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
              {toggleError}
            </p>
          ) : null}
          <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-col gap-2 border-t border-charcoal/10 bg-white px-5 pt-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeactivateTarget(null)}
              disabled={toggleBusyId !== null}
              className="w-full sm:w-auto"
            >
              Keep access
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmDeactivate()}
              loading={toggleBusyId !== null}
              className="w-full sm:w-auto"
            >
              Deactivate now
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
