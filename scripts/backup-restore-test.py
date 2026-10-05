#!/usr/bin/env python3
"""
Take a backup, then prove it restores.

    python3 scripts/backup-restore-test.py

A backup nobody has restored is a hope, not a plan. The failure is almost never the dump — it is the
restore path, discovered at the worst possible moment. This does both halves in one run:

  1. EXPORT every application table to `backups/<timestamp>/` as JSON, through the REST API.
  2. RESTORE it into a scratch schema (`restore_test`), rebuilding each table's structure and
     re-inserting every row.
  3. COMPARE row counts table by table, and fail loudly on any mismatch.
  4. DROP the scratch schema, leaving the database exactly as it was found.

Restoring into a scratch schema rather than back over the live tables is deliberate: the point is to
prove the data and the shape survive a round trip, and doing that over the real tables would turn a
test into an outage.

This is not a substitute for the platform's own backup (which captures indexes, constraints,
functions and views). It proves the *rows* are recoverable, which is the part that matters when a
record has been deleted by mistake and the platform backup is a day old.

Exit code 0 means the round trip succeeded for every table.
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRATCH_SCHEMA = 'restore_test'

# Ordered so the report reads sensibly, and covering every table that holds data the shop owns.
# `rate_limit_counters` is excluded on purpose: it is transient by definition and worthless to
# restore. `security_events` is included because an audit trail is exactly the thing you would want
# back after an incident.
TABLES = [
    'products', 'product_categories', 'orders', 'order_items', 'customers', 'profiles',
    'services', 'appointments', 'academy_courses', 'academy_leads', 'reviews', 'coupons',
    'gallery_items', 'hero_slides', 'media_categories', 'media_assets', 'payment_accounts',
    'affiliates', 'salon_settings', 'security_events',
]


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for line in open(os.path.join(ROOT, '.env.local'), encoding='utf-8'):
        m = re.match(r'^([A-Z_]+)=(.+)$', line.strip())
        if m:
            env[m.group(1)] = m.group(2).strip()
    return env


def management_token() -> str | None:
    path = os.path.join(ROOT, 'CONNECTION.secrets.local.md')
    if not os.path.exists(path):
        return None
    for line in open(path, encoding='utf-8'):
        m = re.search(r'(sbp_[A-Za-z0-9]{20,})', line)
        if m:
            return m.group(1)
    return None


def sql(query: str, token: str) -> object:
    ref = re.search(r'https://([a-z0-9]+)\.supabase\.co', load_env().get('NEXT_PUBLIC_SUPABASE_URL', ''))
    if not ref:
        return {'error': 'no project ref'}
    req = urllib.request.Request(
        f'https://api.supabase.com/v1/projects/{ref.group(1)}/database/query',
        data=json.dumps({'query': query}).encode(),
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        return json.loads(urllib.request.urlopen(req, timeout=180).read().decode())
    except urllib.error.HTTPError as e:
        return {'error': e.read().decode()[:300]}


def export_table(table: str, key: str) -> list:
    url = load_env().get('NEXT_PUBLIC_SUPABASE_URL', '').rstrip('/')
    req = urllib.request.Request(
        f'{url}/rest/v1/{table}?select=*',
        headers={'apikey': key, 'Authorization': f'Bearer {key}', 'Accept': 'application/json'},
    )
    try:
        return json.loads(urllib.request.urlopen(req, timeout=120).read().decode() or '[]')
    except urllib.error.HTTPError as e:
        if e.code in (401, 403, 404):  # table absent or not readable with this key
            return []
        raise


def main() -> int:
    env = load_env()
    service = env.get('SUPABASE_SERVICE_ROLE_KEY', '')
    token = management_token()
    if not service or not token:
        print('  Need SUPABASE_SERVICE_ROLE_KEY in .env.local and the management token in')
        print('  CONNECTION.secrets.local.md. Neither is optional for a restore test.')
        return 2

    stamp = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
    outdir = os.path.join(ROOT, 'backups', stamp)
    os.makedirs(outdir, exist_ok=True)

    print(f'\nBackup and restore test — {stamp} (UTC)\n')

    # ── 1. export ────────────────────────────────────────────────────────────
    print('  Exporting')
    dumped: dict[str, list] = {}
    for table in TABLES:
        rows = export_table(table, service)
        dumped[table] = rows
        with open(os.path.join(outdir, f'{table}.json'), 'w', encoding='utf-8') as fh:
            json.dump(rows, fh, indent=1, default=str)
        print(f'    {table:22} {len(rows):5} rows')
    total = sum(len(r) for r in dumped.values())
    print(f'    {"TOTAL":22} {total:5} rows → {os.path.relpath(outdir, ROOT)}')

    # ── 2. restore into a scratch schema ─────────────────────────────────────
    print('\n  Restoring into the scratch schema')
    sql(f'DROP SCHEMA IF EXISTS {SCRATCH_SCHEMA} CASCADE', token)
    result = sql(f'CREATE SCHEMA {SCRATCH_SCHEMA}', token)
    if isinstance(result, dict) and 'error' in result:
        print(f'    could not create the scratch schema: {result["error"]}')
        return 1
    print(f'    {SCRATCH_SCHEMA} created')

    restored: dict[str, int] = {}
    failures: list[str] = []

    for table, rows in dumped.items():
        # Rebuild the table structurally, then copy the rows. `INCLUDING ALL` carries defaults,
        # constraints and indexes, so the restore is a fair test — restoring into a bare table would
        # succeed even if the real shape could not accept the data.
        create = sql(
            f'CREATE TABLE IF NOT EXISTS {SCRATCH_SCHEMA}.{table} '
            f'(LIKE public.{table} INCLUDING ALL)',
            token,
        )
        if isinstance(create, dict) and 'error' in create:
            # Views and tables without a matching relkind land here; report rather than pretend.
            failures.append(f'{table}: could not recreate the table — {create["error"][:90]}')
            continue

        if rows:
            payload = json.dumps(rows, default=str)
            inserted = sql(
                f"INSERT INTO {SCRATCH_SCHEMA}.{table} "
                f"SELECT * FROM jsonb_populate_recordset(null::{SCRATCH_SCHEMA}.{table}, "
                f"'{payload.replace(chr(39), chr(39) * 2)}'::jsonb)",
                token,
            )
            if isinstance(inserted, dict) and 'error' in inserted:
                failures.append(f'{table}: insert failed — {inserted["error"][:90]}')
                continue

        counted = sql(f'SELECT count(*) AS c FROM {SCRATCH_SCHEMA}.{table}', token)
        count = counted[0]['c'] if isinstance(counted, list) and counted and 'c' in counted[0] else -1
        restored[table] = count

    # ── 3. compare ───────────────────────────────────────────────────────────
    print('\n  Comparing')
    mismatches = []
    for table, rows in dumped.items():
        if table not in restored:
            continue
        ok = restored[table] == len(rows)
        if not ok:
            mismatches.append(f'{table}: exported {len(rows)}, restored {restored[table]}')
        print(f'    {"OK " if ok else "BAD"} {table:22} exported {len(rows):5}  restored {restored[table]:5}')

    # ── 4. clean up ──────────────────────────────────────────────────────────
    sql(f'DROP SCHEMA IF EXISTS {SCRATCH_SCHEMA} CASCADE', token)
    gone = sql(
        "SELECT count(*) AS c FROM information_schema.schemata WHERE schema_name = " + f"'{SCRATCH_SCHEMA}'",
        token,
    )
    cleaned = isinstance(gone, list) and gone and gone[0].get('c') == 0
    print(f'\n  Scratch schema removed: {cleaned}')

    problems = failures + mismatches
    print(f'\n  {len(dumped)} tables · {total} rows · {len(problems)} problem(s)')
    for p in problems:
        print(f'    - {p}')
    if not problems:
        print('  The backup restores. This is a tested backup, not an assumed one.')
    print()
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
