-- ═════════════════════════════════════════════════════════════════════════════
-- Alikati Beauty Home — 0002: Row Level Security
--
-- Model:
--   • The public (anon) role may READ the catalogue, courses, visible media and settings.
--   • The public (anon) role may CREATE a pending (non walk-in) appointment or a new lead.
--   • There is deliberately NO public SELECT policy on `appointments` or `academy_leads`,
--     so a booking cannot be read back with the anon key.
--   • Every write beyond that requires a signed-in staff profile; pricing, media deletion,
--     settings and staff management require the `admin` role.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_leads   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salon_settings  ENABLE ROW LEVEL SECURITY;

-- ── role helpers (SECURITY DEFINER so they can read profiles under RLS) ──────
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$;

-- ── profiles ────────────────────────────────────────────────────────────────
CREATE POLICY "profiles_self_select" ON public.profiles
    FOR SELECT USING (auth.uid() = id OR public.is_admin());
CREATE POLICY "profiles_self_update" ON public.profiles
    FOR UPDATE USING (auth.uid() = id OR public.is_admin());
CREATE POLICY "profiles_admin_delete" ON public.profiles
    FOR DELETE USING (public.is_admin());

-- ── services: world-readable when active; admins write ──────────────────────
CREATE POLICY "services_public_read" ON public.services
    FOR SELECT USING (is_active = TRUE OR public.is_staff());
CREATE POLICY "services_admin_insert" ON public.services
    FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "services_admin_update" ON public.services
    FOR UPDATE USING (public.is_admin());
CREATE POLICY "services_admin_delete" ON public.services
    FOR DELETE USING (public.is_admin());

-- ── appointments ────────────────────────────────────────────────────────────
-- Public booking: status is pinned to 'pending' and walk-ins are refused here, so a client
-- cannot self-confirm or forge a counter sale.
CREATE POLICY "appointments_public_insert" ON public.appointments
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        status = 'pending'
        AND is_walk_in = FALSE
        AND char_length(client_name) BETWEEN 2 AND 100
        AND char_length(client_phone) BETWEEN 7 AND 20
        AND booking_date >= (timezone('Asia/Kathmandu', now()))::date
    );

CREATE POLICY "appointments_staff_read" ON public.appointments
    FOR SELECT USING (public.is_staff());
CREATE POLICY "appointments_staff_update" ON public.appointments
    FOR UPDATE USING (public.is_staff());
CREATE POLICY "appointments_admin_delete" ON public.appointments
    FOR DELETE USING (public.is_admin());

-- ── academy courses ─────────────────────────────────────────────────────────
CREATE POLICY "courses_public_read" ON public.academy_courses
    FOR SELECT USING (TRUE);
CREATE POLICY "courses_admin_insert" ON public.academy_courses
    FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "courses_admin_update" ON public.academy_courses
    FOR UPDATE USING (public.is_admin());
CREATE POLICY "courses_admin_delete" ON public.academy_courses
    FOR DELETE USING (public.is_admin());

-- ── academy leads ───────────────────────────────────────────────────────────
CREATE POLICY "leads_public_insert" ON public.academy_leads
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        status = 'new'
        AND char_length(student_name) BETWEEN 2 AND 100
        AND char_length(student_phone) BETWEEN 7 AND 20
    );

CREATE POLICY "leads_staff_read" ON public.academy_leads
    FOR SELECT USING (public.is_staff());
CREATE POLICY "leads_staff_update" ON public.academy_leads
    FOR UPDATE USING (public.is_staff());
CREATE POLICY "leads_admin_delete" ON public.academy_leads
    FOR DELETE USING (public.is_admin());

-- ── gallery ─────────────────────────────────────────────────────────────────
CREATE POLICY "gallery_public_read" ON public.gallery_items
    FOR SELECT USING (is_visible = TRUE OR public.is_staff());
CREATE POLICY "gallery_staff_insert" ON public.gallery_items
    FOR INSERT WITH CHECK (public.is_staff());
CREATE POLICY "gallery_staff_update" ON public.gallery_items
    FOR UPDATE USING (public.is_staff());
CREATE POLICY "gallery_admin_delete" ON public.gallery_items
    FOR DELETE USING (public.is_admin());

-- ── salon settings: public read (phone, hours and banner are shown on the site) ──
CREATE POLICY "settings_public_read" ON public.salon_settings
    FOR SELECT USING (TRUE);
CREATE POLICY "settings_admin_update" ON public.salon_settings
    FOR UPDATE USING (public.is_admin());
