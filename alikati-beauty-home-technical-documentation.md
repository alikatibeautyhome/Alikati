# Alikati Beauty Home — Complete Technical & Operational Documentation

**System Title:** Alikati Beauty Home Web Platform
**Target Enterprise:** Alikati Beauty Home (Salon, Bridal Studio & Academy)
**Location:** Mahendranagar Road, Attariya Chowk, Kailali, Nepal
**Stack:** Next.js (App Router) / React, TypeScript, Tailwind CSS, Supabase (PostgreSQL, Auth, Storage)
**Document Status:** Complete — Version 1.0
**Currency Convention:** All monetary values are in Nepalese Rupees (NPR / रू), formatted with `en-IN` grouping.

---

## 1. System Architecture & Technology Stack

```
                                  [ Client Devices ]
                        (Mobile 4G / Desktop Web Browsers)
                                        │
                                        ▼
           ┌────────────────────────────────────────────────────────┐
           │               Frontend Application Layer               │
           │  Next.js (App Router) / React + TypeScript + Tailwind  │
           │                                                        │
           │  ┌────────────────────────┐  ┌───────────────────────┐ │
           │  │    Public Web App      │  │  Admin Control Portal │ │
           │  │ (Catalog, Booking UI,  │  │ (Calendar, CRM, Price │ │
           │  │  Portfolio, Academy)   │  │  Editor, Storage)     │ │
           │  └───────────┬────────────┘  └───────────┬───────────┘ │
           └──────────────┼───────────────────────────┼─────────────┘
                          │                           │
                HTTPS / REST & Realtime         HTTPS / RLS
                          │                           │
                          ▼                           ▼
           ┌────────────────────────────────────────────────────────┐
           │             Backend Infrastructure (Supabase)          │
           │                                                        │
           │  ┌──────────────────────┐    ┌──────────────────────┐  │
           │  │    Supabase Auth     │    │   Postgres Database  │  │
           │  │  (JWT Session Tokens)│    │  (8 Relational Tables│  │
           │  │                      │    │   + Strict RLS)      │  │
           │  └──────────────────────┘    └──────────────────────┘  │
           │  ┌──────────────────────┐    ┌──────────────────────┐  │
           │  │   Supabase Storage   │    │  Database Webhooks / │  │
           │  │  ('gallery', 'serv') │    │  Functions (Triggers)│  │
           │  └──────────────────────┘    └──────────────────────┘  │
           └──────────────────────────────┬─────────────────────────┘
                                          │
                                          ▼
                           ┌────────────────────────────┐
                           │    Third-Party Services    │
                           │ - WhatsApp API / Deep-Link │
                           │ - Google Maps Embed        │
                           │ - CDN Edge Caching         │
                           └────────────────────────────┘
```

### 1.1 Technology Matrix

| Layer | Technology | Role |
|---|---|---|
| Frontend Framework | Next.js (App Router) + React 19 | SSR/SSG for public pages, CSR for dynamic booking & admin dashboards. |
| Language | TypeScript 5.x | Strict type safety across client state and database contracts. |
| Styling & Components | Tailwind CSS + Shadcn UI + Lucide | Luxury aesthetic (Blush, Rose Gold, Warm Charcoal) with responsive primitives. |
| Database & Auth | Supabase (PostgreSQL 15+) | Managed transactional data, row-level security, role-based auth. |
| Media Hosting | Supabase Storage (S3-compatible) | Public CDN delivery for high-resolution salon portfolios and course PDFs. |
| Messaging Gateway | WhatsApp Web Protocol (wa.me) | Formatted one-touch confirmation dispatch tailored to Nepali clients. |
| Maps & Location | Google Maps Embed API | Storefront discovery and directions from Attariya Chowk. |
| Analytics | Vercel Analytics / GA4 (privacy-light) | Funnel tracking from catalog view → booking modal → WhatsApp handoff. |

### 1.2 Design Token Direction

| Token | Value | Usage |
|---|---|---|
| `--blush` | `#F7E4E1` | Section backgrounds, soft cards |
| `--rose-gold` | `#B76E79` | Primary CTA, accents, price highlights |
| `--warm-charcoal` | `#2E2A2B` | Body text, admin sidebar |
| `--cream` | `#FDFBF8` | Page base background |
| `--success` / `--warn` / `--danger` | `#1F9D55` / `#D97706` / `#C0392B` | Status chips (confirmed / pending / cancelled) |

Typography: display serif for headings (e.g. *Playfair Display*), humanist sans for body (e.g. *Inter*). All primitives are mobile-first; the public site targets mid-range Android devices on 4G, so total first-load JS for the landing route must stay under ~180 KB gzipped.

---

## 2. Production File & Folder Directory

```
alikati-beauty-home/
├── app/
│   ├── (public)/
│   │   ├── layout.tsx                  # Public shell (Navbar, Footer, WhatsApp FAB)
│   │   ├── page.tsx                    # Landing Page (Hero, Highlights, Reviews)
│   │   ├── services/
│   │   │   └── page.tsx                # Filterable Service Catalog & Price Matrix
│   │   ├── academy/
│   │   │   └── page.tsx                # Training Courses, Syllabus & Inquiry Form
│   │   ├── portfolio/
│   │   │   └── page.tsx                # Filterable Masonry Grid & Before/After Slider
│   │   └── contact/
│   │       └── page.tsx                # Map, Hours, Direct Dial, Contact Form
│   ├── (admin)/
│   │   ├── admin/
│   │   │   ├── layout.tsx              # Auth Guard, Sidebar, Notifications Ribbon
│   │   │   ├── page.tsx                # Dashboard Overview (KPIs, Today's Queue)
│   │   │   ├── appointments/
│   │   │   │   └── page.tsx            # Booking Pipeline (Kanban & Tabular View)
│   │   │   ├── services/
│   │   │   │   └── page.tsx            # CRUD Price Editor & Discount Manager
│   │   │   ├── leads/
│   │   │   │   └── page.tsx            # Academy CRM & Student Follow-up Tracker
│   │   │   ├── gallery/
│   │   │   │   └── page.tsx            # Bulk Asset Uploader & Visibility Toggles
│   │   │   └── settings/
│   │   │       └── page.tsx            # Business Hours & Emergency Site Banners
│   │   └── login/
│   │       └── page.tsx                # Staff Credentials Authentication Page
│   ├── api/
│   │   └── booking/
│   │       └── route.ts                # Server-side validation & dispatch endpoint
│   ├── globals.css                     # Design tokens, variables & typography rules
│   └── layout.tsx                      # Root layout, analytics, JSON-LD Schema
├── components/
│   ├── ui/                             # Shadcn Primitives (Button, Modal, Input, etc.)
│   ├── public/
│   │   ├── HeroSection.tsx             # Visual presentation & quick value props
│   │   ├── ServiceCard.tsx             # Interactive card with price in NPR (रू)
│   │   ├── BookingModal.tsx            # Multi-step scheduling engine
│   │   ├── BeforeAfterSlider.tsx       # Touch-enabled image comparison component
│   │   ├── WhatsAppFloatingButton.tsx  # Dynamic floating contact button
│   │   └── AcademyLeadForm.tsx         # Fast inquiry modal for courses
│   └── admin/
│       ├── AdminSidebar.tsx            # Desktop/Mobile responsive sidebar
│       ├── AppointmentRow.tsx          # Status updater & WhatsApp ping trigger
│       ├── ServiceFormModal.tsx        # Add/edit service dialog
│       └── ImageUploadDropzone.tsx     # Supabase Storage uploader
├── lib/
│   ├── supabase/
│   │   ├── client.ts                   # Browser Supabase client
│   │   ├── server.ts                   # Server-side Supabase client (Cookies)
│   │   └── middleware.ts               # Route guard for /admin paths
│   ├── api.ts                          # Data access layer (typed query wrappers)
│   ├── utils.ts                        # Currency formatters, time slot generators
│   └── whatsapp.ts                     # URL string builders and message encoders
├── types/
│   └── database.types.ts               # Autogenerated Supabase DB TypeScript contract
├── supabase/
│   └── migrations/                     # Versioned SQL migrations (see §3.2, §8)
└── public/
    ├── og-image.jpg                    # Social sharing banner
    └── placeholder-salon.webp          # Lazy-loading fallback assets
```

### 2.1 Route Manifest

| Route | Render Mode | Auth | Purpose |
|---|---|---|---|
| `/` | SSG + ISR (60s) | Public | Landing, hero, featured services, reviews |
| `/services` | SSG + ISR (60s) | Public | Full catalog, category filter, price matrix |
| `/academy` | SSG + ISR (300s) | Public | Course cards, syllabus accordion, lead form |
| `/portfolio` | SSG + ISR (300s) | Public | Masonry gallery, before/after slider |
| `/contact` | Static | Public | Map embed, hours, click-to-call, form |
| `/login` | CSR | Public | Staff credential authentication (outside the `/admin` guard so it cannot redirect to itself) |
| `/admin/*` | CSR | Staff (JWT) | Operations console |
| `/api/booking` | Route Handler | Public (rate-limited) | Server-side validation + insert + dispatch |

---

## 3. Database Schema & Data Models

### 3.1 Entity Relationship Diagram (Textual)

- **PROFILES** (1:N) → **APPOINTMENTS** (staff assignment / logs)
- **SERVICES** (1:N) → **APPOINTMENTS** (appointment linked to service)
- **ACADEMY_COURSES** (1:N) → **ACADEMY_LEADS** (lead linked to course)
- **GALLERY_ITEMS** (Independent media table)
- **SALON_SETTINGS** (Single row system configuration)

Referential rule summary:

| Parent | Child | FK Behaviour | Rationale |
|---|---|---|---|
| `auth.users` | `profiles` | `ON DELETE CASCADE` | Removing a staff account removes its profile row. |
| `services` | `appointments` | `ON DELETE RESTRICT` | A service with booking history must never be hard-deleted; deactivate instead. |
| `academy_courses` | `academy_leads` | `ON DELETE SET NULL` | Historical leads survive course retirement. |
| `services.category` | `gallery_items.category` | Shared enum (no FK) | Media may exist before a matching service row is published. |
| `profiles.id` | `appointments.assigned_staff_id` | `ON DELETE SET NULL` | Appointment history survives staff departure. |

### 3.2 SQL Schema Migration Script

```sql
-- 1. EXTENSIONS & ENUMS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE appointment_status AS ENUM ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled');
CREATE TYPE lead_status AS ENUM ('new', 'contacted', 'enrolled', 'archived');
CREATE TYPE service_category AS ENUM ('hair', 'bridal', 'nails', 'skin', 'packages');

-- 2. STAFF PROFILES
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. SERVICES CATALOG
CREATE TABLE public.services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(150) NOT NULL,
    slug VARCHAR(150) UNIQUE NOT NULL,
    category service_category NOT NULL DEFAULT 'hair',
    description TEXT,
    duration_minutes INT NOT NULL DEFAULT 60,
    price_npr NUMERIC(10, 2) NOT NULL,
    discount_price_npr NUMERIC(10, 2) DEFAULT NULL,
    image_url TEXT,
    is_featured BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. APPOINTMENT RESERVATIONS
CREATE TABLE public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_name VARCHAR(100) NOT NULL,
    client_phone VARCHAR(20) NOT NULL,
    service_id UUID REFERENCES public.services(id) ON DELETE RESTRICT,
    booking_date DATE NOT NULL,
    booking_time TIME NOT NULL,
    notes TEXT,
    status appointment_status DEFAULT 'pending' NOT NULL,
    total_amount_npr NUMERIC(10, 2) NOT NULL,
    is_walk_in BOOLEAN DEFAULT FALSE,
    assigned_staff_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. ACADEMY COURSES
CREATE TABLE public.academy_courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(150) NOT NULL,
    slug VARCHAR(150) UNIQUE NOT NULL,
    duration_weeks INT NOT NULL,
    fee_npr NUMERIC(10, 2) NOT NULL,
    syllabus JSONB DEFAULT '[]'::jsonb NOT NULL,
    is_enrolling BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. ACADEMY STUDENT LEADS
CREATE TABLE public.academy_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_name VARCHAR(100) NOT NULL,
    student_phone VARCHAR(20) NOT NULL,
    course_id UUID REFERENCES public.academy_courses(id) ON DELETE SET NULL,
    status lead_status DEFAULT 'new' NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. GALLERY & BEFORE/AFTER SHOWCASE
CREATE TABLE public.gallery_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(100),
    category service_category NOT NULL DEFAULT 'hair',
    image_url TEXT NOT NULL,
    before_image_url TEXT DEFAULT NULL,
    display_order INT DEFAULT 0,
    is_visible BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. SALON CONFIGURATION (SINGLETON)
CREATE TABLE public.salon_settings (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    phone VARCHAR(20) NOT NULL DEFAULT '+977-9800000000',
    whatsapp_number VARCHAR(20) NOT NULL DEFAULT '9779800000000',
    address TEXT NOT NULL DEFAULT 'Mahendranagar Road, Attariya Chowk, Kailali',
    announcement_text TEXT DEFAULT '',
    announcement_active BOOLEAN DEFAULT FALSE,
    opening_time TIME DEFAULT '08:00',
    closing_time TIME DEFAULT '19:00',
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. SEED THE SINGLETON SETTINGS ROW
INSERT INTO public.salon_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- 10. INDEXES FOR HOT PATHS
CREATE INDEX idx_appointments_date_status ON public.appointments (booking_date, status);
CREATE INDEX idx_appointments_phone       ON public.appointments (client_phone);
CREATE UNIQUE INDEX idx_appointments_slot
    ON public.appointments (booking_date, booking_time, service_id)
    WHERE status IN ('pending', 'confirmed', 'in_progress');
CREATE INDEX idx_services_active_category ON public.services (is_active, category);
CREATE INDEX idx_gallery_visible_order    ON public.gallery_items (is_visible, display_order);
CREATE INDEX idx_leads_status_created     ON public.academy_leads (status, created_at DESC);

-- 11. updated_at AUTO-TOUCH TRIGGER
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
    FOREACH t IN ARRAY ARRAY['profiles','services','appointments','academy_courses','academy_leads']
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_touch BEFORE UPDATE ON public.%1$s
             FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();', t);
    END LOOP;
END $$;

-- 12. AUTO-PROVISION PROFILE ON SIGN-UP
CREATE OR REPLACE FUNCTION public.handle_new_staff_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', 'Staff Member'), 'staff')
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_staff_user();

-- 13. CONVENIENCE VIEW: TODAY'S OPERATIONS QUEUE
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
```

### 3.3 Column Notes & Business Rules

| Table | Column | Rule |
|---|---|---|
| `services` | `price_npr` | Base list price. Always populated, even during a promotion. |
| `services` | `discount_price_npr` | Effective price shown to clients when non-null and `< price_npr`. The UI must render the struck-through original. |
| `services` | `is_active` | `false` hides the service from the public catalog but preserves appointment history (services are never hard-deleted). |
| `appointments` | `total_amount_npr` | Snapshot of the effective price **at booking time** — never recalculated later, so historical revenue stays accurate after a price change. |
| `appointments` | `client_phone` | Stored as entered, but normalised to `+977` E.164 for WhatsApp deep-links. |
| `appointments` | `booking_time` | Stored as 5-minute-granularity `TIME`; the client UI only offers 30-minute intervals. |
| `academy_courses` | `syllabus` | JSONB array of strings, one per module, e.g. `["Facial anatomy", "Threading", "HD makeup"]`. |
| `gallery_items` | `before_image_url` | When present, the portfolio grid renders the comparison slider instead of a static tile. |
| `salon_settings` | `announcement_*` | Global site banner — used for festival closures, Dashain/Tihar hours, or holidays. |

---

## 4. TypeScript Contracts (`types/database.types.ts`)

```ts
export type AppointmentStatus = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
export type LeadStatus = 'new' | 'contacted' | 'enrolled' | 'archived';
export type ServiceCategory = 'hair' | 'bridal' | 'nails' | 'skin' | 'packages';

export interface Service {
  id: string;
  title: string;
  slug: string;
  category: ServiceCategory;
  description: string | null;
  duration_minutes: number;
  price_npr: number;
  discount_price_npr: number | null;
  image_url: string | null;
  is_featured: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: string;
  client_name: string;
  client_phone: string;
  service_id: string;
  booking_date: string;
  booking_time: string;
  notes: string | null;
  status: AppointmentStatus;
  total_amount_npr: number;
  is_walk_in: boolean;
  assigned_staff_id: string | null;
  created_at: string;
  updated_at: string;
  service?: Service;
}

export interface AcademyCourse {
  id: string;
  title: string;
  slug: string;
  duration_weeks: number;
  fee_npr: number;
  syllabus: string[];
  is_enrolling: boolean;
  created_at: string;
}

export interface AcademyLead {
  id: string;
  student_name: string;
  student_phone: string;
  course_id: string | null;
  status: LeadStatus;
  notes: string | null;
  created_at: string;
  course?: AcademyCourse;
}

export interface GalleryItem {
  id: string;
  title: string | null;
  category: ServiceCategory;
  image_url: string;
  before_image_url: string | null;
  display_order: number;
  is_visible: boolean;
  created_at: string;
}

export interface SalonSettings {
  id: number;
  phone: string;
  whatsapp_number: string;
  address: string;
  announcement_text: string;
  announcement_active: boolean;
  opening_time: string;
  closing_time: string;
  updated_at: string;
}

export interface StaffProfile {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'staff';
  created_at: string;
  updated_at: string;
}

/** Payload accepted by the public booking endpoint. */
export interface BookingRequestPayload {
  client_name: string;
  client_phone: string;
  service_id: string;
  booking_date: string;   // YYYY-MM-DD
  booking_time: string;   // HH:mm
  notes?: string;
}

/** Normalised result returned by the booking endpoint. */
export interface BookingResult {
  ok: boolean;
  appointment_id?: string;
  reference_code?: string;
  whatsapp_url?: string;
  error?: string;
  fields?: Record<string, string>;
}
```

`Service` exposes a derived helper used across the UI rather than a stored column:

```ts
export function effectivePrice(service: Pick<Service, 'price_npr' | 'discount_price_npr'>): number {
  const { price_npr, discount_price_npr } = service;
  return discount_price_npr != null && discount_price_npr < price_npr
    ? discount_price_npr
    : price_npr;
}
```

---

## 5. Public UI & Customer Journey Specifications

### 5.1 Interactive Booking Flow

```
[ Browse Catalog ] ──> [ Click "Book" ] ──> [ Select Date & Slot ] ──> [ Input Contact ]
                                                                             │
                                                                             ▼
[ WhatsApp Fallback Link ] <── [ Success Screen ] <── [ Supabase Insert: 'pending' ]
```

**Step Breakdown**

1. **Service Selection.** The user picks a service (e.g., Keratin Smoothing). The modal pre-populates duration and NPR price from `effectivePrice()`.
2. **Date & Slot Generation.** The UI queries active appointments for the chosen date, excludes fully occupied slots between `opening_time` and `closing_time`, and displays 30-minute intervals.
3. **Data Submission.** The client submits `client_name` and `client_phone`. An unauthenticated INSERT writes to `public.appointments` with `status: 'pending'`.
4. **Instant WhatsApp Escalation.** The client is shown their assigned reference code and an "Instant Confirm via WhatsApp" button. Tapping this opens WhatsApp with a pre-filled template directly to the salon's registered number.

### 5.2 Slot Generation Contract

```ts
// lib/utils.ts
import type { Appointment, SalonSettings } from '@/types/database.types';

export function formatNPR(amount: number): string {
  return `रू ${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

/** 30-minute bookable intervals between opening and closing, minus taken slots. */
export function generateTimeSlots(
  settings: Pick<SalonSettings, 'opening_time' | 'closing_time'>,
  dayAppointments: Pick<Appointment, 'booking_time' | 'status'>[],
  serviceDurationMinutes = 60,
  now = new Date()
): string[] {
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const toLabel = (mins: number) =>
    `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

  const open = toMinutes(settings.opening_time);
  const close = toMinutes(settings.closing_time);
  const busy = new Set(
    dayAppointments
      .filter((a) => a.status !== 'cancelled')
      .map((a) => a.booking_time.slice(0, 5))
  );

  const slots: string[] = [];
  for (let mins = open; mins + serviceDurationMinutes <= close; mins += 30) {
    const label = toLabel(mins);
    if (busy.has(label)) continue;
    if (now.getHours() * 60 + now.getMinutes() >= mins) continue; // no past slots
    slots.push(label);
  }
  return slots;
}
```

**Reference code format.** Derived from the appointment UUID: `ABH-` + first 6 hex characters, uppercased (e.g. `ABH-9F3C21`). Used in the WhatsApp message and for staff phone lookup at the counter.

### 5.3 WhatsApp Link Serialization Utility (`lib/whatsapp.ts`)

```ts
export function createWhatsAppBookingLink(appointment: {
  client_name: string;
  client_phone: string;
  service_title: string;
  booking_date: string;
  booking_time: string;
  total_amount_npr: number;
  business_whatsapp: string;
}): string {
  const cleanPhone = appointment.business_whatsapp.replace(/[^0-9]/g, '');

  const text =
    `*✨ New Appointment Booking - Alikati Beauty Home*\n` +
    `--------------------------------------\n` +
    `• *Client Name:* ${appointment.client_name}\n` +
    `• *Phone Number:* ${appointment.client_phone}\n` +
    `• *Service:* ${appointment.service_title}\n` +
    `• *Date:* ${appointment.booking_date}\n` +
    `• *Time Slot:* ${appointment.booking_time}\n` +
    `• *Price:* NPR रू ${appointment.total_amount_npr.toLocaleString('en-IN')}\n` +
    `--------------------------------------\n` +
    `Please confirm if this slot is available. Thank you!`;

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}

/** Status pings sent BY staff TO clients (admin-side convenience links). */
export function createStatusNotificationLink(opts: {
  client_phone: string;
  client_name: string;
  service_title: string;
  booking_date: string;
  booking_time: string;
  status: 'confirmed' | 'cancelled' | 'completed';
  business_whatsapp: string;
}): string {
  const cleanPhone = opts.client_phone.replace(/[^0-9]/g, '');
  const greeting = `नमस्ते ${opts.client_name} जी 🙏`;
  const body: Record<typeof opts.status, string> = {
    confirmed:
      `Your appointment at *Alikati Beauty Home* is *CONFIRMED* ✅\n` +
      `• Service: ${opts.service_title}\n• Date: ${opts.booking_date}\n• Time: ${opts.booking_time}\n` +
      `Please arrive 5 minutes early. Thank you!`,
    cancelled:
      `We are sorry, but your appointment could not be accommodated ❌\n` +
      `• Service: ${opts.service_title}\n• Date: ${opts.booking_date}\n• Time: ${opts.booking_time}\n` +
      `Please reply here and we will find you a better slot.`,
    completed:
      `Thank you for visiting *Alikati Beauty Home* 💐\n` +
      `We hope you loved your ${opts.service_title}. A short review would mean a lot to us!`,
  }[opts.status];

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(`${greeting}\n\n${body}`)}`;
}
```

### 5.4 Page-Level UX Requirements

| Page | Required behaviours |
|---|---|
| Landing | Hero with primary CTA "Book Appointment"; featured services (max 6); trust strip (years open, bridal count, academy graduates); review carousel; announcement banner when `announcement_active` is true. |
| Services | Category chips (All / Hair / Bridal / Nails / Skin / Packages) driven by the `service_category` enum; price matrix showing original vs. discounted NPR; each card opens the booking modal. |
| Academy | Course cards with `duration_weeks` and `fee_npr`; syllabus accordion; "Reserve my seat" opens `AcademyLeadForm`; enrollment badge hidden when `is_enrolling` is false. |
| Portfolio | Masonry grid filtered by category; before/after slider for items with `before_image_url`; lazy-loaded with `placeholder-salon.webp`. |
| Contact | Google Maps embed centred on Attariya Chowk; opening/closing hours from `salon_settings`; tap-to-call; contact form routing to WhatsApp. |

**Accessibility & performance budget.** All interactive controls keyboard-reachable with visible focus rings; images require descriptive `alt`; colour contrast on rose-gold text meets WCAG AA against cream; LCP < 2.5 s on 4G; every `<img>` uses `next/image` with explicit dimensions to avoid layout shift.

---

## 6. Admin Portal Specifications & Operational Workflows

The Admin Portal is accessible under `/admin` and protected by Next.js Server Middleware inspecting Supabase Auth session tokens.

### 6.1 Authentication Guard (`lib/supabase/middleware.ts`)

```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Protect every /admin route. Staff sign in at /login, which sits OUTSIDE the /admin
  // layout — otherwise the guard would redirect the login page to itself.
  if (pathname.startsWith(ADMIN_HOME) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = '';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Already signed in? No reason to show the login screen.
  if (pathname.startsWith(LOGIN_PATH) && user) {
    const url = request.nextUrl.clone();
    url.pathname = ADMIN_HOME;
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}
```

Root `middleware.ts` wiring and matcher:

```ts
import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: ['/admin/:path*'],
};
```

The middleware only authenticates. **Authorisation is enforced in the database** via RLS (§8) — a signed-in `staff` user cannot read appointment rows if the policy denies it, even by calling the REST API directly.

### 6.2 Admin Control Modules

```
+──────────────────────────────────────────────────────────────────────────+
|  ALIKATI BEAUTY HOME ADMIN                   [Staff: Rita D.] [Logout]   |
+──────────────────────────────────────────────────────────────────────────+
|  📊 Dashboard  |  📅 Appointments  |  💇 Services  |  🎓 Leads  | 🖼️ Media |
+──────────────────────────────────────────────────────────────────────────+
|  TODAY'S OVERVIEW:                                                       |
|  [ 8 Total Bookings ]   [ 2 Pending ]   [ 5 Confirmed ]   [ रू 24,500 ]   |
+──────────────────────────────────────────────────────────────────────────+
|  APPOINTMENT MANAGEMENT QUEUE                                            |
|  Time     Client       Service          Status       Actions             |
|  ──────────────────────────────────────────────────────────────────────  |
|  10:00 AM Sita Joshi   Signature Bridal [Confirmed]  [WhatsApp] [Done]   |
|  12:30 PM Anita Pant   Keratin Smooth   [Pending  ]  [Confirm]  [Cancel] |
|  03:00 PM Mina Rana    Gel Nail Art     [In-Prog  ]  [Complete]          |
+──────────────────────────────────────────────────────────────────────────+
```

- **Dashboard KPIs.** Real-time counters showing today's expected client load, pending approval queues, confirmed appointments, and projected revenue.
- **Appointment Dispatch Table.**
  - *Confirm Trigger:* Updates status to `confirmed` and provides an automated WhatsApp status notification button.
  - *Completion Trigger:* Records the service as `completed` and adds the final amount to daily revenue tallies.
  - *Walk-In Creation:* An admin form allowing manual booking input for direct walk-in customers or phone call inquiries (`is_walk_in = true`).
- **Dynamic Price & Catalog Manager.**
  - Quick-toggle field to mark services as active/inactive.
  - In-place price modifications (e.g., updating Keratin Treatment from रू 4,500 to रू 4,000 for Dashain/Tihar festival promotions).
- **Media Portfolio Engine.**
  - Direct drag-and-drop image upload to the Supabase `gallery` storage bucket.
  - Side-by-side selection tool to combine two images into a before-and-after slider comparison card.
- **Academy Leads CRM.**
  - Central log of inquiries received via the Beautician Academy landing page.
  - Call notes tracker with status buttons (New ➔ Contacted ➔ Enrolled ➔ Archived).

### 6.3 Status State Machine

```
pending ──► confirmed ──► in_progress ──► completed
   │            │              │
   └────────────┴──────────────┴──────► cancelled
```

| From | Allowed next states | Who | Side effects |
|---|---|---|---|
| `pending` | `confirmed`, `cancelled` | staff, admin | Confirm → offer WhatsApp notification link; Cancel → free the slot |
| `confirmed` | `in_progress`, `cancelled`, `completed` | staff, admin | `in_progress` stamps service start; `completed` counts toward daily revenue |
| `in_progress` | `completed`, `cancelled` | staff, admin | `completed` locks the row against further edits except notes |
| `completed` | — (terminal) | — | Excluded from slot blocking; retained for reporting |
| `cancelled` | — (terminal) | — | Slot returns to availability immediately |

### 6.4 Role Matrix

| Capability | `staff` | `admin` |
|---|---|---|
| View today's queue & appointments | ✅ | ✅ |
| Change appointment status | ✅ | ✅ |
| Create walk-in bookings | ✅ | ✅ |
| Edit service prices / toggle active | ❌ | ✅ |
| Upload / hide gallery media | ✅ | ✅ |
| Delete gallery media | ❌ | ✅ |
| Manage academy leads | ✅ | ✅ |
| Edit `salon_settings` (hours, banner, numbers) | ❌ | ✅ |
| Invite / deactivate staff accounts | ❌ | ✅ |

### 6.5 Admin Operational Runbook

**Daily — opening (08:00)**
1. Open `/admin`; verify the KPI strip matches the paper diary.
2. Work the Pending column first: confirm or cancel every `pending` row created overnight.
3. Tap `[WhatsApp]` on each newly confirmed row to dispatch the Nepali confirmation template.
4. Check `announcement_active` — clear any stale banner text.

**Daily — closing (19:00)**
1. Move every attended appointment to `completed`; cancel no-shows with a call note in `notes`.
2. Reconcile the revenue figure against cash/eSewa/Khalti collections.
3. Log any manual discount given at the counter into the appointment `notes` field so the price snapshot stays explainable.

**Weekly — catalogue & media**
1. Review services with `is_active = false` and confirm whether they should return.
2. Upload the week's bridal work to the gallery; set `display_order` so the freshest work appears first.
3. Work the Leads pipeline: every `new` lead older than 48 hours should move to `contacted` or `archived`.

**Festival / seasonal**
1. Apply promotional pricing by setting `discount_price_npr` (never by overwriting `price_npr`) — this keeps the original price visible as a struck-through reference and preserves history.
2. Set the announcement banner with special hours (e.g. "Dashain: open 09:00–15:00, closed on Fulpati").
3. After the festival, clear `discount_price_npr` back to `NULL`.

**Counter lookup by reference code**
Search `client_phone` or the first 6 characters of the appointment `id` to verify a booking at the till.

---

## 7. Data Access Layer & Supabase API Integration

### 7.1 Client Queries (`lib/api.ts`)

```ts
import { supabase } from '@/lib/supabase/client';
import type {
  Service, Appointment, AcademyLead, AcademyCourse,
  GalleryItem, SalonSettings, BookingRequestPayload,
} from '@/types/database.types';

/* ---------------------------------------------------------------- SERVICES */

// Fetch all active services ordered by category
export async function getActiveServices(): Promise<Service[]> {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('is_active', true)
    .order('category', { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function getFeaturedServices(limit = 6): Promise<Service[]> {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('is_active', true)
    .eq('is_featured', true)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data || [];
}

export async function getServiceBySlug(slug: string): Promise<Service | null> {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

/* ------------------------------------------------------------ APPOINTMENTS */

// Client booking submission
export async function createPublicAppointment(payload: {
  client_name: string;
  client_phone: string;
  service_id: string;
  booking_date: string;
  booking_time: string;
  total_amount_npr: number;
  notes?: string;
}): Promise<Appointment> {
  const { data, error } = await supabase
    .from('appointments')
    .insert([{
      client_name: payload.client_name,
      client_phone: payload.client_phone,
      service_id: payload.service_id,
      booking_date: payload.booking_date,
      booking_time: payload.booking_time,
      total_amount_npr: payload.total_amount_npr,
      notes: payload.notes ?? null,
      status: 'pending',
      is_walk_in: false,
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Slots already taken for a given date — used by the booking modal. */
export async function getBookedSlots(booking_date: string): Promise<Pick<Appointment, 'booking_time' | 'status'>[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select('booking_time, status')
    .eq('booking_date', booking_date)
    .in('status', ['pending', 'confirmed', 'in_progress']);

  if (error) throw new Error(error.message);
  return data || [];
}

/** Optional self-service lookup: client checks status with phone + reference code. */
export async function getAppointmentByPhoneAndRef(
  client_phone: string,
  refCode: string
): Promise<Appointment | null> {
  const prefix = refCode.replace(/^ABH-?/i, '').toLowerCase();
  const { data, error } = await supabase
    .from('appointments')
    .select('id, client_name, booking_date, booking_time, status, total_amount_npr, service:services(title)')
    .eq('client_phone', client_phone)
    .ilike('id', `${prefix}%`)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as Appointment | null;
}

/* -------------------------------------------------- ADMIN: APPOINTMENT OPS */

export async function getAppointmentsByDate(date: string): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*, service:services(id, title, category, duration_minutes, price_npr, discount_price_npr)')
    .eq('booking_date', date)
    .order('booking_time', { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function getAppointmentsInRange(from: string, to: string): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*, service:services(id, title, category)')
    .gte('booking_date', from)
    .lte('booking_date', to)
    .order('booking_date', { ascending: true })
    .order('booking_time', { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function updateAppointmentStatus(
  id: string,
  status: Appointment['status']
): Promise<Appointment> {
  const { data, error } = await supabase
    .from('appointments')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function createWalkInAppointment(payload: {
  client_name: string;
  client_phone: string;
  service_id: string;
  booking_date: string;
  booking_time: string;
  total_amount_npr: number;
  assigned_staff_id?: string | null;
  notes?: string;
}): Promise<Appointment> {
  const { data, error } = await supabase
    .from('appointments')
    .insert([{
      ...payload,
      status: 'in_progress',
      is_walk_in: true,
      assigned_staff_id: payload.assigned_staff_id ?? null,
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Aggregate KPIs for the dashboard header strip. */
export async function getDailyKpis(date: string) {
  const { data, error } = await supabase
    .from('appointments')
    .select('status, total_amount_npr')
    .eq('booking_date', date);

  if (error) throw new Error(error.message);

  const rows = data || [];
  const byStatus = (s: Appointment['status']) => rows.filter((r) => r.status === s).length;

  return {
    total: rows.length,
    pending: byStatus('pending'),
    confirmed: byStatus('confirmed'),
    inProgress: byStatus('in_progress'),
    completed: byStatus('completed'),
    cancelled: byStatus('cancelled'),
    projectedRevenue: rows
      .filter((r) => r.status !== 'cancelled')
      .reduce((sum, r) => sum + Number(r.total_amount_npr), 0),
    realisedRevenue: rows
      .filter((r) => r.status === 'completed')
      .reduce((sum, r) => sum + Number(r.total_amount_npr), 0),
  };
}

/* -------------------------------------------------- ADMIN: SERVICE EDITOR */

export async function upsertService(input: Partial<Service> & { title: string; slug: string }) {
  const { data, error } = await supabase
    .from('services')
    .upsert(input, { onConflict: 'id' })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function toggleServiceActive(id: string, is_active: boolean) {
  return patchRow('services', id, { is_active });
}

/** Set or clear a promotional price. Pass `null` to end a promotion. */
export async function setServiceDiscount(id: string, discount_price_npr: number | null) {
  return patchRow('services', id, { discount_price_npr });
}

// Generic single-column admin patch helper (admin-only tables).
async function patchRow<T extends object>(
  table: 'services' | 'gallery_items' | 'academy_leads' | 'salon_settings',
  id: string | number,
  patch: T
) {
  const { data, error } = await supabase
    .from(table)
    .update(patch as never)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/* ------------------------------------------------------- ADMIN: GALLERY */

export async function getGalleryItems(includeHidden = false): Promise<GalleryItem[]> {
  let query = supabase.from('gallery_items').select('*');
  if (!includeHidden) query = query.eq('is_visible', true);

  const { data, error } = await query
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function upsertGalleryItem(input: Partial<GalleryItem> & { image_url: string }) {
  const { data, error } = await supabase
    .from('gallery_items')
    .upsert(input, { onConflict: 'id' })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function setGalleryVisibility(id: string, is_visible: boolean) {
  return patchRow('gallery_items', id, { is_visible });
}

export async function reorderGallery(id: string, display_order: number) {
  return patchRow('gallery_items', id, { display_order });
}

/* ------------------------------------------------------- ADMIN: LEADS CRM */

export async function getAcademyLeads(status?: AcademyLead['status']): Promise<AcademyLead[]> {
  let query = supabase
    .from('academy_leads')
    .select('*, course:academy_courses(id, title, fee_npr, duration_weeks)');

  if (status) query = query.eq('status', status);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function updateLead(
  id: string,
  patch: { status?: AcademyLead['status']; notes?: string }
): Promise<AcademyLead> {
  const { data, error } = await supabase
    .from('academy_leads')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/* ------------------------------------------------------- PUBLIC: COURSES */

export async function getAcademyCourses(): Promise<AcademyCourse[]> {
  const { data, error } = await supabase
    .from('academy_courses')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

/** Public inquiry submission — mirrors createPublicAppointment for the academy. */
export async function createAcademyLead(payload: {
  student_name: string;
  student_phone: string;
  course_id: string | null;
  notes?: string;
}): Promise<AcademyLead> {
  const { data, error } = await supabase
    .from('academy_leads')
    .insert([{ ...payload, status: 'new' }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/* ------------------------------------------------------------ SETTINGS */

export async function getSalonSettings(): Promise<SalonSettings> {
  const { data, error } = await supabase
    .from('salon_settings')
    .select('*')
    .eq('id', 1)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateSalonSettings(patch: Partial<SalonSettings>) {
  const { data, error } = await supabase
    .from('salon_settings')
    .update(patch)
    .eq('id', 1)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}
```

### 7.2 Supabase Client Factories

```ts
// lib/supabase/client.ts — browser (public site + admin SPA)
import { createBrowserClient } from '@supabase/ssr';

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

```ts
// lib/supabase/server.ts — Server Components, Route Handlers, Server Actions
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore; middleware refreshes the session.
          }
        },
      },
    }
  );
}
```

---

## 8. Security Model

### 8.1 Row-Level Security Policies

```sql
-- Enable RLS on every table (the singleton settings row included)
ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_leads   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salon_settings  ENABLE ROW LEVEL SECURITY;

-- Helper: is the caller a signed-in staff/admin user?
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$;

-- PROFILES: a user reads/updates only their own row; admins manage all
CREATE POLICY "profiles_self_select" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_admin());
CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id OR public.is_admin());
CREATE POLICY "profiles_admin_delete" ON public.profiles
  FOR DELETE USING (public.is_admin());

-- SERVICES: world-readable when active; admins see everything and write
CREATE POLICY "services_public_read" ON public.services
  FOR SELECT USING (is_active = TRUE OR public.is_staff());
CREATE POLICY "services_admin_write" ON public.services
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "services_admin_update" ON public.services
  FOR UPDATE USING (public.is_admin());
CREATE POLICY "services_admin_delete" ON public.services
  FOR DELETE USING (public.is_admin());

-- APPOINTMENTS: anyone may create a pending, non-walk-in booking with sane values
CREATE POLICY "appointments_public_insert" ON public.appointments
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND is_walk_in = FALSE
    AND char_length(client_name) BETWEEN 2 AND 100
    AND char_length(client_phone) BETWEEN 7 AND 20
    AND booking_date >= (timezone('Asia/Kathmandu', now()))::date
  );

-- Staff read/update everything; there is deliberately NO public SELECT policy,
-- so a booking cannot be read back with the anon key.
CREATE POLICY "appointments_staff_read" ON public.appointments
  FOR SELECT USING (public.is_staff());
CREATE POLICY "appointments_staff_update" ON public.appointments
  FOR UPDATE USING (public.is_staff());
CREATE POLICY "appointments_admin_delete" ON public.appointments
  FOR DELETE USING (public.is_admin());

-- ACADEMY COURSES: public read; admin write
CREATE POLICY "courses_public_read" ON public.academy_courses
  FOR SELECT USING (TRUE);
CREATE POLICY "courses_admin_write" ON public.academy_courses
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "courses_admin_update" ON public.academy_courses
  FOR UPDATE USING (public.is_admin());
CREATE POLICY "courses_admin_delete" ON public.academy_courses
  FOR DELETE USING (public.is_admin());

-- ACADEMY LEADS: public insert (inquiry form), staff-only read/update
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

-- GALLERY: visible items are public; staff manage all
CREATE POLICY "gallery_public_read" ON public.gallery_items
  FOR SELECT USING (is_visible = TRUE OR public.is_staff());
CREATE POLICY "gallery_staff_insert" ON public.gallery_items
  FOR INSERT WITH CHECK (public.is_staff());
CREATE POLICY "gallery_staff_update" ON public.gallery_items
  FOR UPDATE USING (public.is_staff());
CREATE POLICY "gallery_admin_delete" ON public.gallery_items
  FOR DELETE USING (public.is_admin());

-- SETTINGS: public read (phone/whatsapp/hours are shown on the site); admin write
CREATE POLICY "settings_public_read" ON public.salon_settings
  FOR SELECT USING (TRUE);
CREATE POLICY "settings_admin_update" ON public.salon_settings
  FOR UPDATE USING (public.is_admin());
```

**Anti-abuse constraints on the public INSERT paths.** Because anyone with the anon key can attempt inserts, the policies above pin `status` and `is_walk_in` server-side, so a client cannot self-confirm an appointment. Additional hardening:

- A partial unique index (§3.2, step 10) prevents two live bookings on the same service and slot.
- A `CHECK`-style trigger caps unauthenticated booking velocity: no more than 3 rows per `client_phone` per calendar day.
- The `/api/booking` route (§10) re-validates every field server-side; the anon insert exists only as a resilience fallback and should be revoked once the API path is proven in production.

```sql
-- Booking velocity guard
CREATE OR REPLACE FUNCTION public.limit_booking_velocity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM public.appointments
      WHERE client_phone = NEW.client_phone
        AND booking_date = NEW.booking_date) >= 3 THEN
    RAISE EXCEPTION 'Too many booking attempts for this phone number today.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_limit_booking_velocity
  BEFORE INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.limit_booking_velocity();
```

### 8.2 Storage Buckets & Policies

| Bucket | Public | Contents | Max object size | Allowed MIME |
|---|---|---|---|---|
| `gallery` | Yes (CDN read) | Portfolio, before/after pairs | 8 MB | `image/jpeg`, `image/png`, `image/webp`, `image/avif` |
| `services` | Yes (CDN read) | Service card imagery | 4 MB | `image/jpeg`, `image/png`, `image/webp` |
| `academy` | Yes (CDN read) | Course PDFs / syllabus sheets | 10 MB | `application/pdf` |

```sql
INSERT INTO storage.buckets (id, name, public) VALUES
  ('gallery',  'gallery',  TRUE),
  ('services', 'services', TRUE),
  ('academy',  'academy',  TRUE)
ON CONFLICT (id) DO NOTHING;

-- Public CDN read for all three buckets
CREATE POLICY "media_public_read" ON storage.objects
  FOR SELECT USING (bucket_id IN ('gallery', 'services', 'academy'));

-- Only signed-in staff may upload / overwrite
CREATE POLICY "media_staff_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('gallery', 'services', 'academy') AND public.is_staff());

CREATE POLICY "media_staff_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id IN ('gallery', 'services', 'academy') AND public.is_staff());

-- Only admins may permanently delete media
CREATE POLICY "media_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id IN ('gallery', 'services', 'academy') AND public.is_admin());
```

Object naming convention: `{bucket}/{category}/{yyyy-mm}/{uuid}.webp`. UUIDs prevent enumeration and guarantee unique keys across simultaneous uploads.

### 8.3 Threat Model Summary

| Threat | Mitigation |
|---|---|
| Anonymous user reads other clients' booking data | No public `SELECT` policy on `appointments`; anon key cannot list rows. |
| Client self-confirms a booking | `status` pinned to `pending` in the INSERT policy; only staff JWT can update. |
| Slot double-booking under race conditions | Partial unique index on `(booking_date, booking_time, service_id)` for live statuses. |
| Booking spam | Velocity trigger (max 3/day/phone) + server-side rate limiting in `/api/booking`. |
| Staff account leakage | Supabase Auth-managed credentials; server middleware refreshes JWT on every `/admin` request; deactivate by deleting the `auth.users` row (cascades to `profiles`). |
| Media abuse / oversized uploads | Bucket-level size and MIME restrictions; UUID paths; admin-only delete. |
| Secret exposure | Only `NEXT_PUBLIC_*` variables reach the browser; `SUPABASE_SERVICE_ROLE_KEY` is server-only (§9). |

---

## 9. Environment Configuration & Secrets

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project endpoint. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Anon key — RLS-constrained by design. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | Bypasses RLS for cron/export jobs. Never imported into a client component. |
| `NEXT_PUBLIC_SITE_URL` | Public | Canonical URL for metadata, sitemap, and WhatsApp/referrer links. |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Public | Fallback salon WhatsApp number when the DB row is unreachable. |
| `NEXT_PUBLIC_GA_ID` | Public | Analytics measurement ID (optional). |
| `BOOKING_RATE_LIMIT_PER_MIN` | Server | Default `5` — requests per IP per minute on `/api/booking`. |

Example `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # server only, never committed
NEXT_PUBLIC_SITE_URL=https://alikatibeautyhome.com
NEXT_PUBLIC_WHATSAPP_NUMBER=9779800000000
BOOKING_RATE_LIMIT_PER_MIN=5
```

Rules: `.env.local` and `.env*.local` are git-ignored; production values live in the hosting provider's encrypted environment store; the service-role key is rotated immediately if it ever appears in a client bundle (`grep -r "service_role" .next/static` in CI is a cheap guard).

---

## 10. Booking API Route (`app/api/booking/route.ts`)

The route is the hardened path for public bookings: it validates, applies rate limiting, inserts with the service-role client (so no anon write policy is required long-term), and returns the pre-built WhatsApp link.

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createWhatsAppBookingLink } from '@/lib/whatsapp';
import type { BookingResult } from '@/types/database.types';

const RATE_LIMIT = Number(process.env.BOOKING_RATE_LIMIT_PER_MIN ?? 5);
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

const PHONE_RE = /^(\+?977)?[- ]?9[6-8]\d{8}$/;   // Nepali mobile numbers

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  if (rateLimited(ip)) {
    return NextResponse.json<BookingResult>(
      { ok: false, error: 'Too many requests. Please try again in a minute.' },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<BookingResult>({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const client_name = String(body.client_name ?? '').trim();
  const rawPhone = String(body.client_phone ?? '').trim();
  const client_phone = rawPhone.replace(/[^0-9+]/g, '');
  const service_id = String(body.service_id ?? '');
  const booking_date = String(body.booking_date ?? '');
  const booking_time = String(body.booking_time ?? '').slice(0, 5);
  const notes = body.notes ? String(body.notes).slice(0, 500) : null;

  /* ------------------------------------------------------------ validation */
  const fields: Record<string, string> = {};
  if (client_name.length < 2 || client_name.length > 100) fields.client_name = 'Please enter your full name.';
  if (!PHONE_RE.test(client_phone)) fields.client_phone = 'Enter a valid 10-digit Nepali mobile number.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(booking_date)) fields.booking_date = 'Select a valid date.';
  if (!/^\d{2}:\d{2}$/.test(booking_time)) fields.booking_time = 'Select a valid time slot.';
  if (!service_id) fields.service_id = 'Choose a service.';

  if (Object.keys(fields).length > 0) {
    return NextResponse.json<BookingResult>({ ok: false, error: 'Validation failed.', fields }, { status: 422 });
  }

  const supabase = createClient();
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  /* -------------------------------------- load service + salon settings */
  const { data: service, error: serviceError } = await supabase
    .from('services')
    .select('id, title, price_npr, discount_price_npr, is_active')
    .eq('id', service_id)
    .single();

  if (serviceError || !service || !service.is_active) {
    return NextResponse.json<BookingResult>({ ok: false, error: 'That service is no longer available.' }, { status: 404 });
  }

  const { data: settings } = await supabase
    .from('salon_settings')
    .select('whatsapp_number, opening_time, closing_time')
    .eq('id', 1)
    .single();

  /* ---------------------------------------------- server-side slot check */
  const { data: clashes } = await admin
    .from('appointments')
    .select('id')
    .eq('booking_date', booking_date)
    .eq('booking_time', booking_time)
    .eq('service_id', service_id)
    .in('status', ['pending', 'confirmed', 'in_progress'])
    .limit(1);

  if (clashes && clashes.length > 0) {
    return NextResponse.json<BookingResult>(
      { ok: false, error: 'That slot was just taken. Please pick another time.' },
      { status: 409 }
    );
  }

  const price =
    service.discount_price_npr != null && service.discount_price_npr < service.price_npr
      ? Number(service.discount_price_npr)
      : Number(service.price_npr);

  /* ------------------------------------------------------------- insert */
  const { data: appointment, error: insertError } = await admin
    .from('appointments')
    .insert([{
      client_name,
      client_phone,
      service_id,
      booking_date,
      booking_time,
      notes,
      status: 'pending',
      total_amount_npr: price,
      is_walk_in: false,
    }])
    .select()
    .single();

  if (insertError) {
    // 23505 = unique violation from the slot index (race lost between check and insert)
    const message =
      insertError.code === '23505'
        ? 'That slot was just taken. Please pick another time.'
        : 'We could not save your booking. Please call us directly.';
    return NextResponse.json<BookingResult>({ ok: false, error: message }, { status: 409 });
  }

  const reference_code = `ABH-${appointment.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;

  const whatsapp_url = createWhatsAppBookingLink({
    client_name,
    client_phone,
    service_title: service.title,
    booking_date,
    booking_time,
    total_amount_npr: price,
    business_whatsapp: settings?.whatsapp_number ?? process.env.NEXT_PUBLIC_WHATSAPP_NUMBER!,
  });

  return NextResponse.json<BookingResult>(
    { ok: true, appointment_id: appointment.id, reference_code, whatsapp_url },
    { status: 201 }
  );
}
```

**Consistency note.** `appointments` keeps a permissive anon INSERT policy (§8.1) so the client-side `createPublicAppointment()` path remains a working fallback if the API route is unavailable. If the salon prefers the API as the single write path, drop `appointments_public_insert` and let the service-role insert carry all traffic.

---

## 11. Realtime, Notifications & Automation

### 11.1 Realtime Subscriptions (Admin)

```ts
// components/admin/useLiveQueue.ts
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { getAppointmentsByDate } from '@/lib/api';
import type { Appointment } from '@/types/database.types';

export function useLiveQueue(date: string) {
  const [rows, setRows] = useState<Appointment[]>([]);

  useEffect(() => {
    getAppointmentsByDate(date).then(setRows);

    const channel = supabase
      .channel(`queue-${date}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: `booking_date=eq.${date}` },
        () => { getAppointmentsByDate(date).then(setRows); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [date]);

  return rows;
}
```

Realtime must be enabled for `appointments` and `academy_leads` in the Supabase dashboard. Realtime respects RLS, so anon clients subscribe to nothing.

### 11.2 Notification Triggers

| Event | Channel | Recipient | Timing |
|---|---|---|---|
| New booking inserted | WhatsApp handoff (client-initiated) + realtime dashboard badge | Salon counter + admin | Immediate |
| Pending booking older than 30 min | Dashboard "Pending" chip pulses; optional daily-digest email to admin | Admin | Every 30 min |
| New academy lead | Realtime badge on the Leads nav item | Staff | Immediate |
| Opening-time digest | WhatsApp message to the salon's own number with today's queue | Admin | 08:00 Asia/Kathmandu |
| Closing summary | WhatsApp message with completed count + realised revenue | Admin | 19:00 Asia/Kathmandu |

Digest and summary are produced by a PostgreSQL cron job (pg_cron) or an external scheduler invoking a server route with the service-role key; the message body is assembled with the same `lib/whatsapp.ts` templates so formatting stays consistent.

```sql
-- Day-ahead reminder list (used by the 19:00 summary job)
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
```

---

## 12. SEO, Discoverability & Local Search

### 12.1 JSON-LD (Root Layout)

```tsx
// app/layout.tsx (excerpt)
const schema = {
  '@context': 'https://schema.org',
  '@type': 'BeautySalon',
  name: 'Alikati Beauty Home',
  description: 'Salon, bridal studio and beautician academy in Attariya Chowk, Kailali.',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Mahendranagar Road, Attariya Chowk',
    addressLocality: 'Kailali',
    addressRegion: 'Sudurpashchim',
    addressCountry: 'NP',
  },
  telephone: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER,
  priceRange: 'रूरू',
  openingHoursSpecification: [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
      opens: '08:00',
      closes: '19:00',
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ne">
      <body>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      </body>
    </html>
  );
}
```

`lang="ne"` for Nepali-first copy with English service names; each route sets its own `metadata` export with a canonical URL derived from `NEXT_PUBLIC_SITE_URL`.

### 12.2 Route Metadata Matrix

| Route | Title pattern | Key targets |
|---|---|---|
| `/` | Alikati Beauty Home — Salon & Bridal Studio, Attariya Chowk | "beauty parlour Attariya", "bridal makeup Kailali" |
| `/services` | Services & Price List in NPR | "keratin treatment price Nepal", "hair spa Attariya" |
| `/academy` | Beautician Training Academy in Kailali | "beauty course Nepal", "makeup classes Mahendranagar" |
| `/portfolio` | Bridal & Salon Portfolio | "Nepali bridal makeup portfolio" |
| `/contact` | Visit Us — Mahendranagar Road, Attariya Chowk | "beauty salon near me Attariya" |

Implementation requirements: `sitemap.ts` and `robots.txt` generated from the route manifest in §2.1; dynamic OG images per service slug; Google Business Profile linked to the same NAP (name, address, phone) used in `salon_settings` so local citations stay consistent.

### 12.3 Performance Budget

| Metric | Target | Enforcement |
|---|---|---|
| LCP (landing, 4G) | < 2.5 s | `next/image` with priority on the hero only; ISR-cached HTML |
| CLS | < 0.1 | Explicit width/height on all media; font `display: swap` |
| First-load JS (`/`) | < 180 KB gzip | `@next/bundle-analyzer` check in CI |
| Lighthouse Performance | ≥ 90 mobile | Manual gate before each release |
| Supabase query latency | < 200 ms p95 | Indexes in §3.2 step 10; `select()` projections narrowed to needed columns |

---

## 13. Deployment & Release Management

### 13.1 Environments

| Environment | Branch | Supabase project | Purpose |
|---|---|---|---|
| Local | `feat/*` | Local Supabase CLI stack | Day-to-day development |
| Preview | Any PR | Shared staging project | Design review, staff UAT |
| Production | `main` | Production project | Live salon operations |

### 13.2 Pipeline

```
Push → Lint + Typecheck → Build → Migration check → Preview deploy → Manual UAT → Merge to main → Production deploy
```

```bash
# Local setup
npm install
npx supabase start                 # spins up Postgres + Auth + Storage locally
npx supabase db reset              # applies supabase/migrations/*.sql in order
npm run dev                        # http://localhost:3000

# Quality gates (also run in CI)
npm run lint
npx tsc --noEmit
npm run build

# Migration workflow — NEVER edit a migration that has reached production
npx supabase migration new add_discount_columns
npx supabase db push               # applies pending migrations to the linked project
```

### 13.3 Release Checklist

1. All quality gates green; bundle budget within limits.
2. New migration reviewed for backward compatibility (`DROP COLUMN` deferred by one release; add-then-backfill-then-remove).
3. RLS policies re-verified with the anon key — no unintended read surfaces.
4. Staff UAT on the preview URL: book a test appointment, confirm it in admin, complete it, verify the WhatsApp link renders correctly on Android.
5. Deploy to production, then smoke-test: landing load, one real booking, admin login, status change.
6. Tag the release and append the change to §17 (Changelog).

### 13.4 Rollback

Application rollback is an instant re-promotion of the previous deployment in the host's dashboard. Database rollback requires a forward migration (never a destructive down-migration in production); if a schema change breaks the app, revert the app first, then correct the schema in a new migration.

---

## 14. Testing & Quality Assurance

| Layer | Tooling | Coverage expectation |
|---|---|---|
| Unit | Vitest | `formatNPR`, `generateTimeSlots`, `effectivePrice`, `createWhatsAppBookingLink` (phone cleaning + encoding) |
| Component | React Testing Library | `BookingModal` step transitions, validation messages, disabled states |
| Integration | Vitest + local Supabase | RLS matrix below, booking insert, status transitions, slot collision |
| End-to-end | Playwright | Public booking funnel; admin login → confirm → complete |
| Manual device | Real Android + iPhone | WhatsApp deep-link opens the right chat with pre-filled text; before/after slider touch drag |

### 14.1 Mandatory RLS Test Matrix

| Actor | Table | Operation | Expected |
|---|---|---|---|
| anon | `services` | SELECT | Only `is_active = true` rows |
| anon | `appointments` | SELECT | Zero rows (no policy) |
| anon | `appointments` | INSERT with `status='confirmed'` | Rejected by WITH CHECK |
| anon | `appointments` | INSERT with `status='pending'` | Succeeds |
| anon | `salon_settings` | UPDATE | Rejected |
| staff JWT | `appointments` | SELECT / UPDATE | Allowed |
| staff JWT | `services` | UPDATE | Rejected (admin only) |
| admin JWT | `services` | UPDATE / DELETE | Allowed |
| admin JWT | `storage.objects` (`gallery`) | DELETE | Allowed |
| staff JWT | `storage.objects` (`gallery`) | INSERT | Allowed |

### 14.2 Example Units

```ts
// lib/utils.test.ts
import { describe, expect, it } from 'vitest';
import { formatNPR, generateTimeSlots } from './utils';

describe('formatNPR', () => {
  it('uses Indian/Nepali digit grouping', () => {
    expect(formatNPR(4500)).toBe('रू 4,500');
    expect(formatNPR(24500)).toBe('रू 24,500');
  });
});

describe('generateTimeSlots', () => {
  const settings = { opening_time: '08:00', closing_time: '19:00' };

  it('omits booked slots', () => {
    const slots = generateTimeSlots(settings, [{ booking_time: '10:00:00', status: 'confirmed' }], 60,
      new Date('2026-01-01T00:00:00'));
    expect(slots).not.toContain('10:00');
    expect(slots).toContain('10:30');
  });

  it('never returns a slot that would run past closing', () => {
    const slots = generateTimeSlots(settings, [], 60, new Date('2026-01-01T00:00:00'));
    expect(slots.at(-1)).toBe('18:00');
  });
});
```

---

## 15. Operational Continuity & Support

### 15.1 Backup & Retention

| Asset | Method | Frequency | Retention |
|---|---|---|---|
| Postgres data | Supabase automated backups | Daily | Free/Pro tier default window; verify before festival peaks |
| Media | Supabase Storage replication + quarterly export to external drive | Quarterly | Indefinite |
| Schema | `supabase/migrations` in Git | Per change | Git history |
| Environment secrets | Host secret store + sealed offline copy held by the owner | On rotation | Current + previous |

### 15.2 Incident Playbook

| Symptom | Likely cause | First action |
|---|---|---|
| Login page loops back to `/login` | Session cookie not refreshed | Check the middleware matcher includes `/admin/:path*` and `/login`; confirm `NEXT_PUBLIC_SUPABASE_URL` matches the project that issued the JWT |
| Clients report "slot was just taken" repeatedly | Two staff working the same queue, or partial index blocking legitimate re-bookings | Inspect `appointments` for the date; cancel stale `pending` rows |
| Bookings save but WhatsApp button opens the wrong chat | `whatsapp_number` stored with formatting/diacritics | Re-save the number digits-only (`977XXXXXXXXXX`) in `/admin/settings` |
| Gallery uploads fail | Bucket size/MIME policy or expired session | Retry after re-login; confirm file is under 8 MB and is a supported image type |
| Site banner stale after a holiday | `announcement_active` still true | Toggle off in `/admin/settings` |
| Revenue figure looks wrong | Discount applied by overwriting `price_npr` rather than `discount_price_npr` | Restore base price; re-apply as `discount_price_npr` (historical `total_amount_npr` snapshots remain correct) |

### 15.3 Escalation

Level 1 — front-desk staff: appointment lookup, status changes, walk-in entry, lead updates.
Level 2 — salon admin: pricing, media, settings, staff accounts, banner text.
Level 3 — developer/agency: schema changes, RLS edits, deployment, secret rotation, outage triage.

---

## 16. Roadmap

| Phase | Scope | Notes |
|---|---|---|
| v1.0 (current) | Public catalog, booking with WhatsApp handoff, admin console, academy leads, gallery | This document |
| v1.1 | Client booking-status lookup page (phone + reference code), SMS fallback via Sparrow SMS for clients without WhatsApp | Uses `getAppointmentByPhoneAndRef` already in §7.1 |
| v1.2 | Staff commission tracking, service-wise revenue reports, CSV export for accounting | Adds reporting views; no schema break |
| v1.3 | Online advance payment (eSewa / Khalti / Fonepay) with refundable deposit for bridal packages | Requires a payment intent table and webhook handler |
| v2.0 | Student portal for the academy (attendance, module progress, certificate PDFs), multi-branch support | Introduces `branches` table; `salon_settings` becomes per-branch |

---

## 17. Appendices

### Appendix A — WhatsApp Message Templates

**A1. New booking (client → salon)** — generated by `createWhatsAppBookingLink`, see §5.3.

**A2. Confirmation (salon → client)**

```
नमस्ते {client_name} जी 🙏

Your appointment at *Alikati Beauty Home* is *CONFIRMED* ✅
• Service: {service_title}
• Date: {booking_date}
• Time: {booking_time}
Please arrive 5 minutes early. Thank you!
```

**A3. Reschedule request**

```
नमस्ते {client_name} जी 🙏
We need to adjust your {booking_time} appointment on {booking_date} for {service_title}.
Could you please confirm a new time? Our hours are {opening_time}–{closing_time}.
```

**A4. Academy follow-up**

```
नमस्ते {student_name} जी 🙏
Thank you for your interest in *{course_title}* ({duration_weeks} weeks, रू {fee_npr}).
Would you like to reserve a seat for the upcoming batch? Please reply yes and we will book your place.
```

**A5. Post-service review request** — generated by `createStatusNotificationLink` with `status: 'completed'`.

### Appendix B — Error & Empty-State Catalogue

| Code | Where | Message shown |
|---|---|---|
| `400` | `/api/booking` | "Invalid JSON body." |
| `409` | `/api/booking` | "That slot was just taken. Please pick another time." |
| `422` | `/api/booking` | Field-level messages from the `fields` map |
| `429` | `/api/booking` | "Too many requests. Please try again in a minute." |
| DB `23505` | Slot insert | Mapped to the 409 message above |
| DB `23503` | FK violation | "We could not save your booking. Please call us directly." |
| Empty catalog | `/services` | "Our service list is being updated — please call us at {phone}." |
| Empty portfolio | `/portfolio` | "New work coming soon." |
| No slots left | Booking modal | "Fully booked for this date. Try another day or message us on WhatsApp." |
| No leads | Admin leads | "No inquiries yet. New leads from the academy page will appear here." |

### Appendix C — Glossary

| Term | Meaning |
|---|---|
| NPR / रू | Nepalese Rupee, the only currency in this system |
| Slot | A 30-minute bookable interval inside salon opening hours |
| Walk-in | A client served without a prior online booking (`is_walk_in = true`) |
| Lead | An academy inquiry that has not yet converted to an enrollment |
| Reference code | `ABH-XXXXXX`, derived from the appointment UUID, used for counter lookup |
| RLS | Row-Level Security — Postgres policies that scope every query by the caller's identity |
| Snapshot price | `total_amount_npr` recorded at booking time, immune to later price edits |
| FAB | Floating Action Button — the persistent WhatsApp contact button on public pages |

### Appendix D — Data Dictionary Quick Reference

| Table | Rows expected | Growth driver | Primary access pattern |
|---|---|---|---|
| `profiles` | < 20 | Staff hiring | Admin listing, self-update |
| `services` | 20–60 | Catalogue changes | Public catalog read (filtered `is_active`) |
| `appointments` | Hundreds/year | Bookings | Date-range queue queries, status updates |
| `academy_courses` | < 15 | Course launches | Public listing |
| `academy_leads` | Hundreds/year | Inquiries | Status-filtered CRM list |
| `gallery_items` | 100–500 | Portfolio updates | Visible-ordered public grid |
| `salon_settings` | Exactly 1 | Rare | Read on every public page render |

### Appendix E — Changelog

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-09-28 | Initial complete technical & operational documentation: architecture, directory, schema, TypeScript contracts, public journey, admin workflow, data access layer, RLS/security, environment, booking API, realtime, SEO, deployment, testing, continuity, roadmap, appendices. |

---

## 18. E-commerce Extension (v1.1)

The platform was extended from a booking system into a **booking + retail** platform: the salon
sells products online through the same Next.js app and the same admin console. Implemented by
migrations `20260928000004_ecommerce.sql` and `20260928000005_ecommerce_rls.sql`.

### 18.1 Additional tables

| Table | Purpose | Key constraints |
|---|---|---|
| `product_categories` | Shop taxonomy | unique `slug`; `display_order` for curation |
| `products` | Retail catalogue | unique `slug`/`sku`; `stock_qty >= 0`; optional `discount_price_npr`, `cost_price_npr`; `images`, `tags`, `variant_options` as JSONB |
| `orders` | Retail orders | unique `reference` (`ABH-ORD-XXXXXX`); delivery address; `order_status`; `payment_method`; `payment_status`; subtotal/shipping/total |
| `order_items` | Order lines | **price snapshot** (`unit_price_npr`, `line_total_npr`) so later price edits never rewrite history; `product_id` is `ON DELETE SET NULL` |

New enums: `order_status` (`pending → confirmed → packed → shipped → delivered`, plus
`cancelled`), `payment_status` (`unpaid/paid/refunded`), `payment_method`
(`cod/bank_transfer/esewa/khalti`). `salon_settings` gained the store fields
(`store_enabled`, `shipping_fee_npr`, `free_shipping_threshold_npr`, `cod_enabled`,
`bank_transfer_enabled`, `payment_instructions`, `support_email`, `delivery_note`).

### 18.2 Order placement is server-authoritative

`public.place_order(payload jsonb)` is `SECURITY DEFINER` and its `EXECUTE` grant is **revoked
from `anon` and `authenticated`**, so the only caller is `POST /api/orders` using the
service-role key. It locks each product with `SELECT … FOR UPDATE`, re-reads the authoritative
price (client-supplied prices are impossible), rejects inactive products and insufficient
stock, computes shipping from the settings threshold, inserts the order and its line items, and
decrements stock — all in one transaction. `public.cancel_order(uuid)` reverses the stock
reservation and is the only cancellation path.

Consequences worth stating plainly:

- A tampered `localStorage` cart cannot change what a customer is charged.
- Overselling is prevented at the database level, not by a UI check.
- Without `SUPABASE_SERVICE_ROLE_KEY` the endpoint returns `503` rather than writing an
  unverified order.

### 18.3 New routes

| Route | Purpose |
|---|---|
| `/shop`, `/shop/[slug]` | Catalogue and product detail |
| `/cart`, `/checkout` | Editable cart; delivery + payment; order placement |
| `/order/[reference]`, `/track-order` | Confirmation and reference + phone status lookup |
| `POST /api/orders` | Validation → `place_order()` (live) or in-memory order book (demo) |
| `GET /api/orders` | Status lookup; the phone number is the shared secret |
| `/admin/orders`, `/admin/products`, `/admin/categories`, `/admin/customers` | Shop administration |

`GET /api/orders` deliberately requires **both** the reference and the phone number, so a leaked
reference cannot expose another customer's delivery address.

### 18.4 Brand assets

The logo supplied by the owner is used verbatim: `public/media/logo.jpg` (header, footer, admin
sidebar, JSON-LD `logo`) and `app/icon.jpg` (favicon). The theme palette was re-sampled from the
logo — primary rose `#D54167`, gold `#C28A4C`, warm charcoal `#2A1B15` on cream `#FDFBF8` —
replacing the earlier rose-gold values in `tailwind.config.ts` and `app/globals.css`. The
`rose-gold` utility name is retained for backward compatibility.

### 18.5 Deliberate v1.1 limitations

- One SKU per product; `variant_options` are display-only metadata.
- No payment gateway — methods are recorded and confirmed over WhatsApp.
- Order lookup is reference + phone; there are no customer accounts.

---

---

## 19. Supplier Catalogue, Customer Accounts & Deployment (v1.2)

### 19.1 Supplier catalogue import

The retail catalogue was seeded from two supplier storefronts, both of which publish prices in
NPR — nothing is converted or guessed.

| Source | Platform | Integration | Imported |
|---|---|---|---|
| `colorpluscosmetics.com` | WooCommerce | Public Store API (`/wp-json/wc/store/v1/products`) — no key required; prices returned in minor units and divided by `10^currency_minor_unit` | 150 |
| `welltencosmetic.com` | OpenCart | No product API. Product ids are censused from the category listings, then every field is read from the individual product page (the card markup is unreliable: nested wrappers and duplicated anchors) | 19 (the whole visible catalogue) |

`scripts/import-supplier-catalog.mjs` is a re-runnable tool, not a one-off scrape:

- Product ids are **deterministic** (SHA-256 of source + source id, formatted as a UUID), so
  re-importing produces the same rows.
- Outputs `data/imported-catalog.json` (full), `data/demo-catalog.json` (small slice for demo
  mode, so the browser payload stays reasonable) and `supabase/seed-catalog.sql`.
- The SQL uses `ON CONFLICT (slug) DO NOTHING`, so it never duplicates rows and never overwrites
  prices edited in admin afterwards.
- Products are mapped onto a canonical category set by keyword rules (nails → makeup → hair →
  tools → bath & body → makeup → skincare, first match wins), and brands are inferred by matching
  product names against the supplier's brand taxonomy.

**Asset caveat.** Images are hot-linked from the supplier CDNs and those hosts are whitelisted in
`next.config.mjs` (`images.remotePatterns`). Before launch the owner must either confirm reseller
rights or replace them with own photography via `/admin/products`. Supplier prices likewise need
confirmation.

### 19.2 Customer accounts (guest-first)

`/account/signup`, `/account/login` and `/account` are backed by Supabase Auth and the
`customers` table (migration `20260928000006`). Key properties:

- **Nothing is gated.** Browsing, cart and guest checkout work with no account; accounts are an
  optional convenience. A signed-in customer gets details prefilled and their orders attached
  (`orders.customer_id`); guests keep `customer_id = NULL`.
- Customer identities are a **separate table from staff `profiles`**, so a shop account cannot
  reach `/admin`. Customer sign-in lives at `/account/login`; `/login` remains the staff door.
- RLS restricts a customer to their own profile and their own orders/order items only.
- Demo mode emulates the session in `localStorage` (`sita@alikati.demo` / `demo1234`).

### 19.3 Contact details and social profiles

Migration `20260928000007` adds `email`, `facebook_url`, `instagram_url` and `tiktok_url` to the
`salon_settings` singleton, seeded with the owner's details. They drive the footer, the contact
page, the WhatsApp deep links and the `sameAs` array in the `BeautySalon` structured data — all
editable from `/admin/settings` without a deploy.

### 19.4 Admin provisioning

`scripts/create-admin.mjs --email=… --password=… --name=…` creates the auth user
(email pre-confirmed), safely re-runs if the account already exists (updating the password), and
upserts a `profiles` row with `role = 'admin'`. It requires the service-role key. No password is
ever committed to the repository, which is public.

### 19.5 Deployment

Standard Next.js deployment (Vercel recommended; `vercel.json` pins the `sin1` region as the
closest to Nepal). Required environment variables and the go-live checklist are in the README
(§10). Supabase is the only hard external dependency; the service-role key is mandatory for live
bookings and orders.

*End of documentation. Currency in NPR (रू); local timezone Asia/Kathmandu; production time stored in UTC and rendered in Kathmandu local time.*
