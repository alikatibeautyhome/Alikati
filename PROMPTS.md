# Prompt library

Copy-paste prompts for continuing this project with any AI coding assistant. They worked here, and
they encode the rules that kept the work reliable — adapt the specifics, keep the structure.

---

## 0. Paste this first, in every new session

```
You are working on the Alikati Beauty Home platform.

PROJECT: /path/to/alikati-beauty-home
BUSINESS: Alikati Beauty Home — salon, bridal studio, academy and beauty shop at
Mahendranagar Road, Attariya Chowk, Kailali, Nepal. Nepali customers, mostly on Android over 4G.
Currency is NPR, written as रू. Dates are shown in Bikram Sambat (Nepali) alongside AD.

STACK: Next.js 15 (App Router) · React 19 · TypeScript 5 (strict) · Tailwind 3 · Supabase
(PostgreSQL 17, Auth, Storage) · WhatsApp deep links. No other dependencies without asking.

READ BEFORE WRITING:
- HANDOVER.md        — setup, database map, security model, known limitations
- CHANGELOG.md       — what has been built and which bugs were fixed (do not reintroduce them)
- README.md §13–18   — the Supabase integration, payment, dates and landing-page work

RULES
1. Narrate nothing about hidden reasoning. Do not ask permission for routine work; ask only when
   genuinely blocked.
2. Never invent prices, ratings, discounts or business claims. If data is missing, render nothing
   or leave the field empty.
3. Authorization lives in the database (RLS), never in the UI. Never weaken a policy to make a
   feature work; change the query or add a policy with the correct predicate.
4. Do not edit `lib/utils.ts`, `lib/nepali-date.ts`, `lib/commerce.ts`, `components/ui/*` or
   `app/globals.css` unless the task is specifically about them — other work depends on them.
5. Verify with `node ./node_modules/typescript/bin/tsc --noEmit --incremental false`. Use the
   explicit path (npx resolves the wrong package here) and always `--incremental false` (the cache
   reports phantom errors). Never run a typecheck in the same tool block as a file write — they run
   concurrently and the check reads the pre-write file.
6. There is no browser available, so you cannot check visuals. Verify by reading code, by the
   typecheck, and by inspecting served HTML. Say plainly what you could not verify.
7. After any change to `supabase/migrations/`, run `npm run test:db` (49 assertions) and
   `npm run supabase:sql` to regenerate the single-file bundle.

Reply "ready" and wait for the task.
```

---

## 1. Feature request template

```
TASK
<one sentence: what the customer or the owner will be able to do>

CONTEXT
<who uses it, and why. Any real numbers involved.>

ACCEPTANCE
- <observable behaviour 1>
- <observable behaviour 2>
- Works at 360px wide and in dark mode
- <what must NOT happen>

TOUCH/CONSTRAINTS
- Reuse: <existing components/helpers that apply>
- Do not modify: <files owned by other work>
- Database: <"no schema change" or the exact columns/tables to add>

WHEN DONE
List the files changed, state exactly what you verified and how, and flag anything you could not.
```

---

## 2. Bug report template (the important one)

```
BUG
<what the user did> → <what they saw> → <what they expected>

FIRST: find the real cause before changing anything.
- Check the server log for the error at that moment.
- Reproduce it with the exact payload the user had (a curl/fetch is fine).
- If the UI shows one generic message for every failure, the answer is in the log — do not guess.

Then fix it at the root, and add a guard so that class of failure cannot silently reach a customer
again. If the UI hid the reason, make it show the reason; that is part of the bug.

Do not report a fix as complete unless you reproduced the failure first and the reproduction now
passes.
```

---

## 3. Brand / theme change template

```
Change the site's colour scheme to <palette / reference image>.

The palette lives in CSS variables in `app/globals.css` and as Tailwind tokens in
`tailwind.config.ts`. Change those first — surfaces and tints resolve through variables, so the
whole app (public + admin, light + dark) re-themes without touching components.

Then sweep for hardcoded leftovers and for now-inconsistent treatments:
- prices → `text-price`, original struck through in `text-charcoal-soft line-through`
- discount badges → always `bg-sale`
- primary actions → `bg-rose-gold` with `hover:bg-rose-600`
- check contrast on gradients, and check dark mode explicitly

Do not change layout, copy or behaviour. Colour and class consistency only.
```

---

## 4. New admin screen template

```
Add an admin screen at /admin/<name> for <purpose>.

READ FIRST
- an existing screen of the same shape, for patterns: <e.g. app/(admin)/admin/coupons/page.tsx>
- the data layer you must use: <lib/…> (do not call Supabase directly from the browser page)
- components/admin/AdminSidebar.tsx — add the nav item (icon + label)

REQUIREMENTS
- Create, edit, deactivate and reorder where it makes sense. Deactivate, never delete, when the
  row is referenced by historical records.
- Surface the API's error messages verbatim; show per-field errors on a 422.
- Mobile: rows stack at 360px, tables scroll inside their wrapper, actions ≥ 40px, modals keep a
  sticky full-width save button.
- Loading, empty and error states for every list.

RULES
- Authorization is server-side. If the action needs the service key (creating Auth users, DDL),
  put it in a route handler under `app/api/` that re-verifies the caller is an active admin.
```

---

## 5. Database change template

```
Add <change> to the database.

Create a new migration: `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`.
- Never edit an applied migration. Add a new one.
- Enable RLS on any new table, and write both the public read policy (if any) and the staff write
  policy. Default to no public access.
- If a function's OUT-parameter row type changes, `DROP FUNCTION` first — `CREATE OR REPLACE`
  cannot change it.
- If a function body references a new column, add the column earlier in the same file: PostgreSQL
  validates SQL function bodies at creation time.
- Alias tables inside functions when an OUT parameter shares a column's name (e.g. `code`) —
  otherwise you get `column reference is ambiguous` at runtime, not at creation.
- End with a DO block that raises if the change did not land.

Then: apply it to the live project, run `npm run test:db`, regenerate `supabase/apply-all.sql`,
and add assertions to `supabase/local/10-functional.sql` for the new behaviour.
```

---

## 6. Verification prompt

```
Verify <feature> end to end and tell me what you actually proved.

Use, in this order:
1. `node ./node_modules/typescript/bin/tsc --noEmit --incremental false`
2. `npm run build` (clean, and report the route count)
3. `npm run test:db` if anything touched the schema
4. Fetch the live pages and inspect the served HTML for the specific data/text you expect
5. For anything the browser would do (clicks, client rendering), say so explicitly instead of
   implying it works.

Report: what passed with the evidence, what could not be verified and why, and anything you found
that nobody asked about.
```

---

## 7. Useful one-liners

| Goal | Prompt |
|---|---|
| Make it mobile-friendly | `Audit <page> at 360px: overflow, tap targets under 44px, fixed elements covering content, tables without a scroll wrapper. Fix, then state what you checked.` |
| Performance | `Measure the first-load JS for <route>. Find the largest client component that does not need to be one and convert it to a server component.` |
| Security check | `Review the RLS policies for <table>. Can an anonymous session read or write anything it should not, and can a signed-in customer reach staff-only data? Prove it with SQL, do not just read the policy.` |
| SEO | `Add metadata to <route>: title, description, canonical, and structured data where a schema type fits. Explain any keyword choices.` |
| Explain a decision | `Summarise why <thing> is built this way, the alternatives, and what would break if it changed. Cite the file.` |

---

## 8. Things that repeatedly mattered here

- **A generic error message is a bug.** Every failure path should name its cause. The single
  biggest defect in this project (staff accounts unable to check out) was invisible for exactly
  that reason.
- **Reproduce before fixing.** The suspect (a phone number, a coupon) was innocent; the server log
  had the answer in one line.
- **Test migrations against a real database before production.** Three defects here — a function
  whose return type could not change, an ambiguous column, and a privilege escalation that gave
  every new signup staff access — were only found by actually running the SQL.
- **`REVOKE … FROM anon` does nothing on its own.** PostgreSQL grants EXECUTE to `PUBLIC` on new
  functions; revoke from `PUBLIC` and grant narrowly.
- **Never fabricate business data.** No invented prices, ratings or discounts — render nothing
  instead. The promo band is the owner's words precisely so the site cannot overstate an offer.
- **Verify with fresh commands, not memory.** `--incremental false`, and never in the same batch as
  the edit you are checking.
