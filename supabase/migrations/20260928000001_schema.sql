-- ═════════════════════════════════════════════════════════════════════════════
-- Alikati Beauty Home — 0001: extensions, enums, tables, indexes, triggers
-- ═════════════════════════════════════════════════════════════════════════════

-- 1. EXTENSIONS & ENUMS ------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE appointment_status AS ENUM ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled');
CREATE TYPE lead_status        AS ENUM ('new', 'contacted', 'enrolled', 'archived');
CREATE TYPE service_category   AS ENUM ('hair', 'bridal', 'nails', 'skin', 'packages');

-- 2. STAFF PROFILES ----------------------------------------------------------
CREATE TABLE public.profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email       TEXT UNIQUE NOT NULL,
    full_name   TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
    created_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. SERVICES CATALOG --------------------------------------------------------
CREATE TABLE public.services (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title              VARCHAR(150) NOT NULL,
    slug               VARCHAR(150) UNIQUE NOT NULL,
    category           service_category NOT NULL DEFAULT 'hair',
    description        TEXT,
    duration_minutes   INT NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
    price_npr          NUMERIC(10, 2) NOT NULL CHECK (price_npr >= 0),
    discount_price_npr NUMERIC(10, 2) DEFAULT NULL CHECK (discount_price_npr IS NULL OR discount_price_npr >= 0),
    image_url          TEXT,
    is_featured        BOOLEAN DEFAULT FALSE,
    is_active          BOOLEAN DEFAULT TRUE,
    created_at         TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at         TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. APPOINTMENT RESERVATIONS ------------------------------------------------
CREATE TABLE public.appointments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_name       VARCHAR(100) NOT NULL,
    client_phone      VARCHAR(20) NOT NULL,
    service_id        UUID NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
    booking_date      DATE NOT NULL,
    booking_time      TIME NOT NULL,
    notes             TEXT,
    status            appointment_status DEFAULT 'pending' NOT NULL,
    total_amount_npr  NUMERIC(10, 2) NOT NULL CHECK (total_amount_npr >= 0),
    is_walk_in        BOOLEAN DEFAULT FALSE,
    assigned_staff_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at        TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. ACADEMY COURSES ---------------------------------------------------------
CREATE TABLE public.academy_courses (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title          VARCHAR(150) NOT NULL,
    slug           VARCHAR(150) UNIQUE NOT NULL,
    duration_weeks INT NOT NULL CHECK (duration_weeks > 0),
    fee_npr        NUMERIC(10, 2) NOT NULL CHECK (fee_npr >= 0),
    syllabus       JSONB DEFAULT '[]'::jsonb NOT NULL,
    is_enrolling   BOOLEAN DEFAULT TRUE,
    created_at     TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at     TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. ACADEMY STUDENT LEADS ---------------------------------------------------
CREATE TABLE public.academy_leads (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_name  VARCHAR(100) NOT NULL,
    student_phone VARCHAR(20) NOT NULL,
    course_id     UUID REFERENCES public.academy_courses(id) ON DELETE SET NULL,
    status        lead_status DEFAULT 'new' NOT NULL,
    notes         TEXT,
    created_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. GALLERY & BEFORE/AFTER SHOWCASE -----------------------------------------
CREATE TABLE public.gallery_items (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title            VARCHAR(100),
    category         service_category NOT NULL DEFAULT 'hair',
    image_url        TEXT NOT NULL,
    before_image_url TEXT DEFAULT NULL,
    display_order    INT DEFAULT 0,
    is_visible       BOOLEAN DEFAULT TRUE,
    created_at       TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. SALON CONFIGURATION (SINGLETON) -----------------------------------------
CREATE TABLE public.salon_settings (
    id                  INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    phone               VARCHAR(20) NOT NULL DEFAULT '+977-9800000000',
    whatsapp_number     VARCHAR(20) NOT NULL DEFAULT '9779800000000',
    address             TEXT NOT NULL DEFAULT 'Mahendranagar Road, Attariya Chowk, Kailali',
    announcement_text   TEXT DEFAULT '',
    announcement_active BOOLEAN DEFAULT FALSE,
    opening_time        TIME DEFAULT '08:00',
    closing_time        TIME DEFAULT '19:00',
    updated_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

INSERT INTO public.salon_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 9. INDEXES FOR HOT PATHS ---------------------------------------------------
CREATE INDEX idx_appointments_date_status   ON public.appointments (booking_date, status);
CREATE INDEX idx_appointments_phone         ON public.appointments (client_phone);
CREATE INDEX idx_services_active_category   ON public.services (is_active, category);
CREATE INDEX idx_services_featured          ON public.services (is_featured) WHERE is_active;
CREATE INDEX idx_gallery_visible_order      ON public.gallery_items (is_visible, display_order);
CREATE INDEX idx_leads_status_created       ON public.academy_leads (status, created_at DESC);

-- Prevents two live bookings on the same service and slot. Cancelled and completed rows are
-- excluded so the slot frees up again.
CREATE UNIQUE INDEX idx_appointments_slot
    ON public.appointments (booking_date, booking_time, service_id)
    WHERE status IN ('pending', 'confirmed', 'in_progress');

-- 10. updated_at AUTO-TOUCH --------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['profiles', 'services', 'appointments', 'academy_courses', 'academy_leads']
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_touch BEFORE UPDATE ON public.%1$s
             FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();', t);
    END LOOP;
END $$;

-- 11. AUTO-PROVISION PROFILE ON SIGN-UP --------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_staff_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Staff Member'),
        CASE WHEN NEW.raw_user_meta_data->>'role' = 'admin' THEN 'admin' ELSE 'staff' END
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_staff_user();

-- 12. BOOKING VELOCITY GUARD -------------------------------------------------
-- Caps unauthenticated booking attempts: at most 3 rows per phone per booking date.
CREATE OR REPLACE FUNCTION public.limit_booking_velocity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.is_walk_in = FALSE AND (
        SELECT count(*) FROM public.appointments
        WHERE client_phone = NEW.client_phone
          AND booking_date = NEW.booking_date
    ) >= 3 THEN
        RAISE EXCEPTION 'Too many booking attempts for this phone number today.';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_limit_booking_velocity
    BEFORE INSERT ON public.appointments
    FOR EACH ROW EXECUTE FUNCTION public.limit_booking_velocity();

-- 13. CONVENIENCE VIEWS ------------------------------------------------------
-- Today's operations queue, in Nepal local time.
CREATE OR REPLACE VIEW public.v_today_queue AS
SELECT a.id,
       a.booking_time,
       a.client_name,
       a.client_phone,
       s.title AS service_title,
       a.status,
       a.total_amount_npr,
       a.is_walk_in
FROM public.appointments a
LEFT JOIN public.services s ON s.id = a.service_id
WHERE a.booking_date = (timezone('Asia/Kathmandu', now()))::date
ORDER BY a.booking_time;

-- Tomorrow's confirmed/pending load, used by the end-of-day WhatsApp summary.
CREATE OR REPLACE FUNCTION public.next_day_queue()
RETURNS TABLE (booking_time TIME, client_name TEXT, service_title TEXT, status appointment_status)
LANGUAGE sql STABLE AS $$
    SELECT a.booking_time, a.client_name, s.title, a.status
    FROM public.appointments a
    LEFT JOIN public.services s ON s.id = a.service_id
    WHERE a.booking_date = (timezone('Asia/Kathmandu', now()))::date + 1
      AND a.status IN ('pending', 'confirmed')
    ORDER BY a.booking_time;
$$;
