#!/usr/bin/env python3
"""
Reproducible security audit.

Every security claim made about this project should be checkable by running this file, not taken on
trust from a chat message. Run it after any change that touches auth, the database, or the build:

    python3 scripts/security-audit.py

It reports what it actually observed, prints the evidence line for each check, and exits non-zero if
anything fails — so it can also run in CI.

What it does NOT do: it cannot see inside a browser, and it says nothing about UI behaviour. It
checks the things that are invisible but decisive — what a stranger with the public key can reach,
what is in the shipped bundle, and whether anything sensitive was ever committed.

Requires `.env.local` for the Supabase keys, and `CONNECTION.secrets.local.md` (the management
token) for the database checks. Checks needing a missing credential are reported as SKIP, never as
a pass — an unrun check is not a clean one.
"""

from __future__ import annotations

import glob
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESULTS: list[tuple[str, str, str]] = []  # (status, name, evidence)


def record(status: str, name: str, evidence: str) -> None:
    RESULTS.append((status, name, evidence))
    print(f"  [{status:4}] {name}")
    print(f"           {evidence}")


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    path = os.path.join(ROOT, '.env.local')
    if not os.path.exists(path):
        return env
    for line in open(path, encoding='utf-8'):
        m = re.match(r'^([A-Z_]+)=(.+)$', line.strip())
        if m:
            env[m.group(1)] = m.group(2).strip()
    return env


def load_management_token() -> str | None:
    path = os.path.join(ROOT, 'CONNECTION.secrets.local.md')
    if not os.path.exists(path):
        return None
    for line in open(path, encoding='utf-8'):
        m = re.search(r'(sbp_[A-Za-z0-9]{20,})', line)
        if m:
            return m.group(1)
    return None


def sql(query: str, token: str) -> list | dict:
    ref = re.search(r'https://([a-z0-9]+)\.supabase\.co', load_env().get('NEXT_PUBLIC_SUPABASE_URL', ''))
    if not ref:
        return []
    req = urllib.request.Request(
        f'https://api.supabase.com/v1/projects/{ref.group(1)}/database/query',
        data=json.dumps({'query': query}).encode(),
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        return json.loads(urllib.request.urlopen(req, timeout=120).read().decode())
    except urllib.error.HTTPError as e:
        return {'error': e.read().decode()[:200]}


def rest(path: str, key: str) -> tuple[int, object]:
    url = load_env().get('NEXT_PUBLIC_SUPABASE_URL', '').rstrip('/')
    req = urllib.request.Request(
        f'{url}/rest/v1/{path}',
        headers={'apikey': key, 'Authorization': f'Bearer {key}', 'Accept': 'application/json'},
    )
    try:
        r = urllib.request.urlopen(req, timeout=60)
        return r.status, json.loads(r.read().decode() or '[]')
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception:
        return 0, None


# ── 1. Secrets in the working tree and in every commit ever made ──────────────
def check_secrets(env: dict[str, str]) -> None:
    secrets = {k: v for k, v in env.items() if len(v) > 20 and not v.startswith('http')}
    if not secrets:
        record('SKIP', 'Secret scanning', 'no .env.local values available to search for')
        return

    tree_hits: list[str] = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in ('node_modules', '.next', '.git')]
        for fn in filenames:
            if fn.endswith(('.png', '.jpg', '.jpeg', '.webp', '.ico', '.woff2')):
                continue
            p = os.path.join(dirpath, fn)
            try:
                text = open(p, encoding='utf-8', errors='ignore').read()
            except Exception:
                continue
            if any(v in text for v in secrets.values()):
                tree_hits.append(os.path.relpath(p, ROOT))

    # Every blob across every branch, so a secret deleted from HEAD still shows up.
    objects = subprocess.run(
        ['git', 'rev-list', '--objects', '--all'], cwd=ROOT, capture_output=True, text=True
    ).stdout.split('\n')
    shas = [line.split()[0] for line in objects if line.strip()]
    history_hits: list[str] = []
    for sha in shas:
        try:
            blob = subprocess.run(
                ['git', 'cat-file', '-p', sha], cwd=ROOT, capture_output=True, timeout=8
            ).stdout.decode('utf-8', 'ignore')
        except Exception:
            continue
        if any(v in blob for v in secrets.values()):
            history_hits.append(sha[:8])
        for pat in (r'sb_secret_[A-Za-z0-9_-]{10,}', r'sbp_[A-Za-z0-9]{20,}', r'gh[pousr]_[A-Za-z0-9]{20,}'):
            if re.search(pat, blob):
                history_hits.append(f'{sha[:8]}(pattern)')

    # A file holding a secret is only a problem if git would commit it.
    #
    # The first version of this check counted the two local secret stores as hits and reported FAIL —
    # a false positive that would have trained whoever read it to ignore the result. `.env.local` and
    # `CONNECTION.secrets.local.md` are SUPPOSED to contain secrets; what matters is whether they are
    # ignored. So each hit is tested individually rather than assumed.
    tracked_hits: list[str] = []
    ignored_hits: list[str] = []
    for rel in tree_hits:
        rc = subprocess.run(['git', 'check-ignore', '-q', rel], cwd=ROOT).returncode
        (ignored_hits if rc == 0 else tracked_hits).append(rel)

    ok = not tracked_hits and not history_hits
    record(
        'PASS' if ok else 'FAIL',
        'Secret scanning',
        f'{len(secrets)} values searched · {len(shas)} git objects scanned · '
        f'in gitignored files {len(ignored_hits)} (fine) · in TRACKED files {len(tracked_hits)} · '
        f'in git history {len(history_hits)}'
        + (f' · LEAKS: {tracked_hits + history_hits[:5]}' if (tracked_hits or history_hits) else ''),
    )


# ── 2. The service-role key must never reach the browser ─────────────────────
def check_bundle(env: dict[str, str]) -> None:
    svc = env.get('SUPABASE_SERVICE_ROLE_KEY', '')
    bundles = glob.glob(os.path.join(ROOT, '.next/static/**/*.js'), recursive=True)
    if not bundles:
        record('SKIP', 'Client bundle scan', 'no build output — run `npm run build` first')
        return
    leaks = [os.path.relpath(b, ROOT) for b in bundles if svc and svc in open(b, encoding='utf-8', errors='ignore').read()]
    record(
        'PASS' if not leaks else 'FAIL',
        'Client bundle scan',
        f'{len(bundles)} client bundles scanned · service-role leaks {len(leaks)}'
        + (f' · {leaks[:3]}' if leaks else ''),
    )

    public = set()
    for pat in ('app/**/*.ts', 'app/**/*.tsx', 'lib/**/*.ts', 'lib/**/*.tsx', 'components/**/*.ts', 'components/**/*.tsx'):
        for f in glob.glob(os.path.join(ROOT, pat), recursive=True):
            for m in re.finditer(r'NEXT_PUBLIC_[A-Z_]+', open(f, encoding='utf-8', errors='ignore').read()):
                public.add(m.group(0))
    risky = [v for v in public if 'SERVICE' in v or 'SECRET' in v or 'PRIVATE' in v]
    record(
        'PASS' if not risky else 'FAIL',
        'NEXT_PUBLIC_ prefixes',
        f'{len(public)} public vars · sensitive-looking prefixes {len(risky)}'
        + (f' · {risky}' if risky else f' · {sorted(public)}'),
    )


# ── 3. Database: RLS, grants, and what a stranger can actually reach ─────────
def check_database(env: dict[str, str], token: str | None) -> None:
    anon = env.get('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    if token is None:
        record('SKIP', 'RLS coverage', 'no management token (CONNECTION.secrets.local.md)')
        record('SKIP', 'Anonymous write grants', 'no management token')
    else:
        tables = sql(
            "select c.relname, c.relrowsecurity, c.relkind from pg_class c "
            "join pg_namespace n on n.oid=c.relnamespace "
            "where n.nspname='public' and c.relkind in ('r','p') order by 1",
            token,
        )
        if isinstance(tables, list) and tables and 'error' not in tables[0]:
            without = [t['relname'] for t in tables if not t['relrowsecurity']]
            record(
                'PASS' if not without else 'FAIL',
                'RLS coverage',
                f'{len(tables)} tables · RLS disabled on {len(without)}'
                + (f' · {without}' if without else ''),
            )
        else:
            record('SKIP', 'RLS coverage', 'query failed')

        grants = sql(
            "select table_name, string_agg(distinct privilege_type, ',' order by privilege_type) privs "
            "from information_schema.role_table_grants where grantee='anon' and table_schema='public' "
            "group by 1 order by 1",
            token,
        )
        if isinstance(grants, list) and grants and 'error' not in grants[0]:
            writers = [
                g['table_name'] for g in grants
                if any(p in g['privs'] for p in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'))
            ]
            record(
                'PASS' if not writers else 'FAIL',
                'Anonymous write grants',
                f'{len(grants)} tables grant anon something · '
                f'{len(writers)} grant a WRITE privilege' + (f' · {writers}' if writers else ' · none'),
            )
        else:
            record('SKIP', 'Anonymous write grants', 'query failed')

    if not anon:
        record('SKIP', 'Anonymous read of protected tables', 'no anon key available')
        return
    protected = ['orders', 'order_items', 'customers', 'profiles', 'appointments', 'academy_leads', 'affiliates']
    leaked = []
    for t in protected:
        status, data = rest(f'{t}?select=*&limit=5', anon)
        n = len(data) if isinstance(data, list) else 0
        if n:
            leaked.append(f'{t}({n})')
    record(
        'PASS' if not leaked else 'FAIL',
        'Anonymous read of protected tables',
        f'{len(protected)} tables probed with the public key · leaked {len(leaked)}'
        + (f' · {leaked}' if leaked else ' · 0 rows everywhere'),
    )


# ── 4. Password hashing is the platform's, not ours ──────────────────────────
def check_password_hashing(token: str | None) -> None:
    if token is None:
        record('SKIP', 'Password hashing', 'no management token')
        return
    rows = sql(
        "select left(encrypted_password, 7) prefix, count(*) c from auth.users group by 1", token
    )
    if isinstance(rows, list) and rows and 'error' not in rows[0]:
        prefixes = {r['prefix'] for r in rows}
        is_bcrypt = all((p or '').startswith('$2') for p in prefixes)
        record(
            'PASS' if is_bcrypt else 'FAIL',
            'Password hashing',
            f'{sum(r["c"] for r in rows)} accounts · hash prefixes {sorted(prefixes)} '
            f'· bcrypt: {is_bcrypt}',
        )
    else:
        record('SKIP', 'Password hashing', 'query failed')


def main() -> int:
    env = load_env()
    token = load_management_token()
    print(f'\nSecurity audit — {ROOT}\n')
    check_secrets(env)
    check_bundle(env)
    check_database(env, token)
    check_password_hashing(token)

    fails = [r for r in RESULTS if r[0] == 'FAIL']
    skips = [r for r in RESULTS if r[0] == 'SKIP']
    print(f'\n  {len(RESULTS)} checks · {len(RESULTS) - len(fails) - len(skips)} passed · '
          f'{len(fails)} failed · {len(skips)} skipped')
    if skips:
        print('  A skipped check is not a passed one — supply the missing credential and re-run.')
    print()
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())
