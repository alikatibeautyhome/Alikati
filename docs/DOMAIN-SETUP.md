# alikatibeautyhome.com.np — how this domain is set up

**Status: live and verified.** This started as a plan and is now a record of what was actually done,
including two things the plan got wrong. Kept because the next domain move — or the same move on a
second site — will hit the same traps.

## Verified end state

Measured, not assumed:

| | |
|---|---|
| Apex `alikatibeautyhome.com.np` | **308** → `https://www.alikatibeautyhome.com.np/` |
| `www.alikatibeautyhome.com.np` | **200**, real catalogue (Loire, Lotus, Newlook) |
| TLS | Let's Encrypt, both hosts, valid to **4 Jan 2027** |
| Nameservers | `ns1.vercel-dns.com`, `ns2.vercel-dns.com` |
| `/api/health` | **200** · `ok_with_warnings` · **failed: 0** |
| `og:url` / sitemap | `https://www.alikatibeautyhome.com.np` |
| Vercel project | `alikati-beauty-home`, team `alikati` (Hobby), region `sin1` |
| Dashboard URL | `https://vercel.com/alikati/alikatibeautyhome/settings/domains` |

**`www` is the canonical host.** The apex is a permanent (308) redirect to it, so anything that names
a canonical URL should use `www` — including the code fallback in `lib/supabase/config.ts`. Naming the
apex there costs every crawler and link preview a redirect hop.

## The sequence that worked

1. **Add the domain in Vercel** — project → Settings → Domains → Add `alikatibeautyhome.com.np`
   (and accept the `www` prompt). Do this *before* touching the registrar.
2. **Enter the two nameservers at the registrar.** Vercel's **Vercel DNS** tab displays them. Nothing
   is created or confirmed on Vercel's side.
3. **Wait for propagation.** Vercel then provisions both certificates automatically and creates its own
   A/CNAME records. Minutes to a few hours.
4. **Set `NEXT_PUBLIC_SITE_URL`** to `https://www.alikatibeautyhome.com.np` for Production, Preview
   and Development, then **redeploy**.
5. **Set the Supabase auth URLs** (below).

## Two things the original plan got wrong

**1. There is no "switch to Vercel DNS" button.** The plan said to enable Vercel nameservers from the
dashboard. Vercel's **Vercel DNS** tab is **view-only** — it displays `ns1.vercel-dns.com` and
`ns2.vercel-dns.com` with copy buttons and nothing else. Entering them at the registrar *is* the
switch; no server-side confirmation exists. The plan's advice to "create the A/CNAME records **or**
delegate nameservers, but not both" was also misleading: with nameserver delegation, **no records are
needed at all** — Vercel creates them once it receives the zone.

**2. The dashboard URL is not the project name.** `…/alikati/alikati-beauty-home/settings/domains`
**404s**. The working path uses a different slug: **`…/alikati/alikatibeautyhome/settings/domains`**.
The API calls the project `alikati-beauty-home`; the dashboard slug is `alikatibeautyhome`. A 404 here
looks exactly like a permissions problem and is not one.

## Registrar requirements (if repeating this)

Registry: **[register.com.np](https://register.com.np)** — Nepal's official `.np` registry, not a
reseller. `.com.np` is an **open** ccTLD, but the name must relate to the registrant.

**Business documents** (either): certificate of registration of the company/firm/partnership, **or**
trademark registration in Nepal (or the Department of Industry filing receipt, with the certificate
within 3 years).

Process: search availability → register → verify email → upload the document (jpg/png/jpeg/gif/svg,
**max 800 KB**) → **wait for manual approval**. Allow days.

Two warnings: registrations can be challenged if the name cannot be justified, and since December 2024
the registry runs **reverification** — parked domains are those whose contact details went stale. Use
an address someone reads, or an unread renewal notice loses the domain.

## Supabase

Both settings are required, and a missing redirect URL fails **silently** — it presents as "login is
broken", not as a permission error.

- **`site_url`** → `https://www.alikatibeautyhome.com.np`
- **`uri_allow_list`** must contain the apex and `www`, each also in `/**` form:
  - `https://alikatibeautyhome.com.np` and `https://alikatibeautyhome.com.np/**`
  - `https://www.alikatibeautyhome.com.np` and `https://www.alikatibeautyhome.com.np/**`

Both are settable through the Management API rather than the dashboard:

```
GET   https://api.supabase.com/v1/projects/{ref}/config/auth
PATCH https://api.supabase.com/v1/projects/{ref}/config/auth
      { "site_url": "...", "uri_allow_list": "..." }
```

When changing `uri_allow_list`, **append to the existing list rather than replacing it** — the
`https://*-alikati.vercel.app` preview wildcard lives there, and dropping it breaks every preview
deployment's login.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Domain shows `Invalid Configuration` | Records don't exist yet. If you delegated nameservers, give propagation time before touching anything. |
| `REFUSED` from `ns1.vercel-dns.com` | Vercel is not hosting the zone — the domain isn't in a Vercel project, or delegation hasn't propagated. |
| `SERVFAIL` from public resolvers | Delegation is published but the nameservers won't answer for the zone — usually the ordering trap above. |
| `Failed To Generate Cert` / `dns-01 ACME challenge` | The zone isn't live on Vercel's nameservers yet, so the certificate challenge can't be solved. Wait for delegation. |
| A variable change had no effect | Not redeployed. **A variable change does not restart a running deployment.** |
| Sign-in fails on the new domain only | The domain is missing from `uri_allow_list`. |
| Only `www` or only the apex works | Expected during propagation; they get certificates separately. |

**Do not mix methods.** Either delegate the nameservers or manage A/CNAME records yourself — not both.
Records created outside a delegated zone are ignored.
