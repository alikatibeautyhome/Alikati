-- Maintenance mode.
--
-- A single switch the owner can throw that takes the public storefront out of service while leaving
-- the admin console reachable — the point being that you must be able to turn it back off.
--
-- Why a new switch rather than the existing `store_enabled`: that column is labelled "Store is open
-- — customers can browse and order" but is not enforced anywhere outside the admin form, so it
-- currently does nothing on the storefront. Bolting site-wide downtime onto a switch that was never
-- wired up would have muddied both meanings. They are deliberately separate:
--
--   store_enabled      — the shop can accept orders (browsing still fine)
--   maintenance_mode   — the whole public site is withdrawn
--
-- `maintenance_message` and `maintenance_eta` are free text rather than a timestamp. A Nepali shop
-- communicates downtime as "back around 6 this evening" or "back tomorrow morning", not as an
-- instant, and storing an instant would mean guessing a UTC offset for a business running on
-- Asia/Kathmandu (+05:45). Free text says exactly what the owner means.
--
-- Enforcement lives in the public layout (shows the maintenance screen) and in the order API
-- (refuses new orders), so a checkout tab left open before the switch was thrown cannot complete.

alter table public.salon_settings
  add column if not exists maintenance_mode boolean not null default false,
  add column if not exists maintenance_message text,
  add column if not exists maintenance_eta text;

-- The message is rendered on a public page, so it is capped rather than trusted. 400 characters is
-- already several sentences; the ceiling exists to stop a paste accident becoming the whole page.
alter table public.salon_settings
  drop constraint if exists salon_settings_maintenance_message_len;
alter table public.salon_settings
  add constraint salon_settings_maintenance_message_len
  check (maintenance_message is null or char_length(maintenance_message) <= 400);

alter table public.salon_settings
  drop constraint if exists salon_settings_maintenance_eta_len;
alter table public.salon_settings
  add constraint salon_settings_maintenance_eta_len
  check (maintenance_eta is null or char_length(maintenance_eta) <= 120);

comment on column public.salon_settings.maintenance_mode is
  'When true, the public site shows the maintenance screen instead of its pages and the order API refuses new orders. Staff signed in can still browse the site.';
comment on column public.salon_settings.maintenance_message is
  'Optional line shown to visitors during maintenance. Empty means the default wording is used.';
comment on column public.salon_settings.maintenance_eta is
  'Optional free-text "back by" note, e.g. "Back by 6 PM today".';
