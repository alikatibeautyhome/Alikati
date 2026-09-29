/**
 * Demo mode seed data + in-memory store.
 *
 * Used automatically whenever Supabase is not configured (`isDemoMode()`). It lets the whole
 * platform — public catalogue, booking flow, admin console — be reviewed before a Supabase
 * project exists. Mutations are held in memory for the life of the process/page session and
 * are NOT persisted; wire up Supabase for real storage (see README).
 *
 * The catalogue below is realistic seed content for a Kathmandu-Valley-equivalent salon in
 * Attariya Chowk. Replace prices, services and courses with the owner's real list.
 */
import type { HeroSlide } from '@/types/database.types';
import type {
  AcademyCourse,
  AcademyLead,
  Appointment,
  AppointmentStatus,
  DailyKpis,
  GalleryItem,
  LeadStatus,
  SalonSettings,
  Service,
  ServiceCategory,
} from '@/types/database.types';
import { todayISO, addDaysISO, effectivePrice } from '@/lib/utils';

/** Deterministic timestamp helper: `iso(-1)` = yesterday at 09:15 UTC. */
function iso(dayOffset: number, hour = 9, minute = 15): string {
  const date = addDaysISO(todayISO(), dayOffset);
  return `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;
}

const svc = (
  n: string,
  title: string,
  slug: string,
  category: ServiceCategory,
  duration_minutes: number,
  price_npr: number,
  discount_price_npr: number | null,
  is_featured: boolean,
  description: string,
  image_url: string | null,
  is_active = true
): Service => ({
  id: `d3f1a2b4-1c5e-4f7a-9b2d-0000000000${n}`,
  title,
  slug,
  category,
  description,
  duration_minutes,
  price_npr,
  discount_price_npr,
  image_url,
  is_featured,
  is_active,
  created_at: iso(-45),
  updated_at: iso(-3),
});

/** Hero slideshow, demo mode (migration 0014). Mutable so the admin manager can edit it. */
export const demoHeroSlidesStore: HeroSlide[] = [
  {
    id: 'demo-hero-0001',
    image_url: '/media/placeholder-salon.svg',
    alt_text: 'Reception and styling stations at Alikati Beauty Home',
    heading: null,
    subheading: null,
    display_order: 0,
    is_active: true,
    created_at: iso(-9),
    updated_at: iso(-9),
  },
  {
    id: 'demo-hero-0002',
    image_url: '/media/placeholder-bridal.svg',
    alt_text: 'Bridal make-up look created in our studio',
    heading: null,
    subheading: null,
    display_order: 1,
    is_active: true,
    created_at: iso(-9),
    updated_at: iso(-9),
  },
];

/** Active slides in display order — what the landing page shows. */
export function demoHeroSlides(): HeroSlide[] {
  return demoHeroSlidesStore
    .filter((slide) => slide.is_active)
    .sort((a, b) => a.display_order - b.display_order);
}

export const demoStore = {
  settings: {
    id: 1,
    phone: '+977-9869512756',
    whatsapp_number: '9779869512756',
    address: 'Mahendranagar Road, Attariya Chowk, Kailali, Nepal',
    announcement_text: 'Dashain & Tihar offer: 10% off all hair treatments until Kartik end.',
    announcement_active: true,
    opening_time: '08:00',
    closing_time: '19:00',
    // ── Store / checkout settings ──────────────────────────────────────────
    store_enabled: true,
    shipping_fee_npr: 150,
    free_shipping_threshold_npr: 5000,
    cod_enabled: true,
    bank_transfer_enabled: true,
    payment_instructions:
      'eSewa / Khalti: 98XXXXXXXX (Alikati Beauty Home). Send a screenshot of the payment on WhatsApp to confirm your order. Bank transfer details available on request.',
    support_email: 'alikatibeautyhome@gmail.com',
    delivery_note: 'Inside Attariya: same-day. Elsewhere in Kailali: 1–2 days.',
    // ── Public contact details and social profiles ─────────────────────────
    email: 'alikatibeautyhome@gmail.com',
    facebook_url: 'https://www.facebook.com/share/1Dgw2YFiiZ/',
    instagram_url: 'https://www.instagram.com/nirmala_khadka098',
    tiktok_url: 'https://www.tiktok.com/@alikatibeautyhome5',
    // ── Owner-controlled site settings ─────────────────────────────────────
    cookie_notice_enabled: true,
    cookie_notice_text:
      'We use cookies to keep your cart working and to understand which products people like. You can accept all, or keep only what the site needs to function.',
    app_prompt_enabled: true,
    app_prompt_text:
      'Install the Alikati Beauty Home app for faster checkout and order updates — straight from your home screen. No app store needed.',
    home_section_order: ['products', 'services', 'academy', 'portfolio', 'reviews'],
    payment_qr_enabled: true,
    payment_qr_content: 'esewa:9869512756',
    payment_qr_image_url: null,
    payment_note:
      'Scan the QR to pay, then upload your payment screenshot below. We confirm on WhatsApp.',
    coupon_default_days: 7,
    nepali_dates: true,
    hero_image_url: null,
    hero_heading: 'Salon, bridal studio and shop in Attariya Chowk',
    hero_subheading:
      'Book hair, skin, bridal and nail services, or order the products our stylists use — delivered across Kailali.',
    hero_badge_text: null,
    promo_enabled: true,
    promo_eyebrow: 'Limited time offer',
    promo_headline: 'Festival offers are live',
    promo_subheadline: 'See everything currently reduced across the shop.',
    promo_cta_label: 'Shop the offers',
    promo_href: '/shop',
    affiliate_enabled: true,
    affiliate_commission_rate: 5,
    affiliate_terms:
      'Share your link. When someone orders through it, you earn a commission on the product subtotal. Commissions are paid out monthly by eSewa or bank transfer once they reach रू 1,000.',
    updated_at: iso(-2),
  } as SalonSettings,

  services: [
    svc('01', 'Signature Hair Cut & Blow Dry', 'signature-hair-cut-blow-dry', 'hair', 45, 800, null, true,
      'Consultation, precision cut and a finishing blow dry styled for your face shape.',
      '/media/placeholder-hair.svg'),
    svc('02', 'Keratin Smoothing Treatment', 'keratin-smoothing-treatment', 'hair', 180, 4500, 4000, true,
      'Frizz control and shine for up to 4 months using a formaldehyde-free keratin system.',
      '/media/placeholder-hair.svg'),
    svc('03', 'Hair Spa & Deep Conditioning', 'hair-spa-deep-conditioning', 'hair', 60, 1500, null, true,
      'Steam-assisted scalp massage with a repairing mask for dry, heat-damaged hair.',
      '/media/placeholder-hair.svg'),
    svc('04', 'Global Hair Colour', 'global-hair-colour', 'hair', 120, 3500, null, false,
      'Ammonia-free global colour with a post-colour bond treatment and blow dry.',
      '/media/placeholder-hair.svg'),
    svc('05', 'Signature Bridal Package', 'signature-bridal-package', 'bridal', 300, 25000, null, true,
      'Full bridal transformation: HD makeup, hair styling, draping, jewellery setting and touch-up kit.',
      '/media/placeholder-bridal.svg'),
    svc('06', 'Engagement Makeup', 'engagement-makeup', 'bridal', 150, 8000, null, false,
      'Long-wear HD makeup with hairstyling for the engagement ceremony and photo session.',
      '/media/placeholder-bridal.svg'),
    svc('07', 'Bridal Hair Styling Only', 'bridal-hair-styling-only', 'bridal', 90, 3500, null, false,
      'Structured bridal updo or open waves with accessories, for brides with their own makeup artist.',
      '/media/placeholder-bridal.svg'),
    svc('08', 'Gel Nail Art', 'gel-nail-art', 'nails', 75, 1800, 1500, true,
      'Gel extensions with hand-painted art, shaped and finished with a high-gloss top coat.',
      '/media/placeholder-nails.svg'),
    svc('09', 'Classic Manicure & Pedicure', 'classic-manicure-pedicure', 'nails', 60, 1200, null, false,
      'Shaping, cuticle care, exfoliation, massage and polish for hands and feet.',
      '/media/placeholder-nails.svg'),
    svc('10', 'Gold Facial', 'gold-facial', 'skin', 60, 2500, null, true,
      'Brightening gold-leaf facial for dull, tired skin before an event.',
      '/media/placeholder-skin.svg'),
    svc('11', 'Hydrafacial Glow', 'hydrafacial-glow', 'skin', 75, 4000, 3500, true,
      'Deep cleanse, gentle peel, extraction and hydration in one session.',
      '/media/placeholder-skin.svg'),
    svc('12', 'Threading (Eyebrow + Upper Lip)', 'threading-eyebrow-upper-lip', 'skin', 20, 150, null, false,
      'Precision eyebrow shaping and upper-lip threading.',
      '/media/placeholder-skin.svg'),
    svc('13', 'Full Body Waxing', 'full-body-waxing', 'skin', 90, 3000, null, false,
      'Full arms, legs, underarms and back using low-temperature wax.',
      '/media/placeholder-skin.svg'),
    svc('14', 'Glow & Go Package (Facial + Mani-Pedi)', 'glow-and-go-package', 'packages', 150, 4500, null, true,
      'Our most booked pre-event combination: gold facial with classic manicure and pedicure.',
      '/media/placeholder-package.svg'),
    svc('15', 'Mom-to-Be Package', 'mom-to-be-package', 'packages', 180, 12000, null, false,
      'Prenatal-safe facial, hair spa, gentle waxing and mani-pedi for expectant mothers.',
      '/media/placeholder-package.svg'),
    svc('16', 'Party Makeup (Retired)', 'party-makeup', 'bridal', 90, 5000, null, false,
      'Seasonal party makeup package — currently retired from the online catalogue.',
      '/media/placeholder-bridal.svg', false),
  ] as Service[],

  courses: [
    {
      id: 'c0a1b2c3-2d4e-4f60-8a1b-000000000001',
      title: 'Professional Beautician Course',
      slug: 'professional-beautician-course',
      duration_weeks: 12,
      fee_npr: 45000,
      syllabus: [
        'Skin analysis and hygiene protocol',
        'Threading, waxing and bleaching',
        'Facial therapies (basic, gold, anti-ageing)',
        'Mani-pedi and foot spa',
        'Hair cutting fundamentals',
        'Hair spa, blow dry and styling',
        'Client handling and salon costing',
      ],
      is_enrolling: true,
      created_at: iso(-120),
      updated_at: iso(-10),
    },
    {
      id: 'c0a1b2c3-2d4e-4f60-8a1b-000000000002',
      title: 'Advanced Bridal Makeup Artistry',
      slug: 'advanced-bridal-makeup-artistry',
      duration_weeks: 6,
      fee_npr: 35000,
      syllabus: [
        'Colour theory and skin-tone matching',
        'HD and airbrush makeup techniques',
        'Bridal eye makeup and lash application',
        'Draping: saree, lehenga and dupatta setting',
        'Hairstyling for bridal looks',
        'Portfolio shoot and client consultation',
      ],
      is_enrolling: true,
      created_at: iso(-90),
      updated_at: iso(-8),
    },
    {
      id: 'c0a1b2c3-2d4e-4f60-8a1b-000000000003',
      title: 'Nail Art & Extension Specialist',
      slug: 'nail-art-extension-specialist',
      duration_weeks: 4,
      fee_npr: 22000,
      syllabus: [
        'Nail anatomy, hygiene and safety',
        'Gel extension application and filing',
        'Hand-painted art and chrome finishes',
        'Nail repair and removal',
        'Pricing and aftercare advice',
      ],
      is_enrolling: false,
      created_at: iso(-200),
      updated_at: iso(-30),
    },
  ] as AcademyCourse[],

  gallery: [
    {
      id: '9e8d7c6b-3a4f-4e5d-9c1b-000000000001',
      title: 'Signature bridal look — Sita',
      category: 'bridal' as ServiceCategory,
      image_url: '/media/placeholder-bridal.svg',
      before_image_url: '/media/placeholder-before.svg',
      display_order: 1,
      is_visible: true,
      created_at: iso(-6),
    },
    {
      id: '9e8d7c6b-3a4f-4e5d-9c1b-000000000002',
      title: 'Keratin smoothing — 4 month result',
      category: 'hair' as ServiceCategory,
      image_url: '/media/placeholder-hair.svg',
      before_image_url: '/media/placeholder-before.svg',
      display_order: 2,
      is_visible: true,
      created_at: iso(-9),
    },
    {
      id: '9e8d7c6b-3a4f-4e5d-9c1b-000000000003',
      title: 'Gel nail art with chrome accent',
      category: 'nails' as ServiceCategory,
      image_url: '/media/placeholder-nails.svg',
      before_image_url: null,
      display_order: 3,
      is_visible: true,
      created_at: iso(-12),
    },
    {
      id: '9e8d7c6b-3a4f-4e5d-9c1b-000000000004',
      title: 'Hydrafacial glow — pre-event',
      category: 'skin' as ServiceCategory,
      image_url: '/media/placeholder-skin.svg',
      before_image_url: '/media/placeholder-before.svg',
      display_order: 4,
      is_visible: true,
      created_at: iso(-15),
    },
    {
      id: '9e8d7c6b-3a4f-4e5d-9c1b-000000000005',
      title: 'Engagement makeup — Anita',
      category: 'bridal' as ServiceCategory,
      image_url: '/media/placeholder-bridal.svg',
      before_image_url: null,
      display_order: 5,
      is_visible: true,
      created_at: iso(-18),
    },
    {
      id: '9e8d7c6b-3a4f-4e5d-9c1b-000000000006',
      title: 'Hair spa and gloss finish',
      category: 'hair' as ServiceCategory,
      image_url: '/media/placeholder-hair.svg',
      before_image_url: null,
      display_order: 6,
      is_visible: true,
      created_at: iso(-21),
    },
    {
      id: '9e8d7c6b-3a4f-4e5d-9c1b-000000000007',
      title: 'Glow & Go package result',
      category: 'packages' as ServiceCategory,
      image_url: '/media/placeholder-package.svg',
      before_image_url: null,
      display_order: 7,
      is_visible: false,
      created_at: iso(-24),
    },
    {
      id: '9e8d7c6b-3a4f-4e5d-9c1b-000000000008',
      title: 'Bridal hair styling — open waves',
      category: 'bridal' as ServiceCategory,
      image_url: '/media/placeholder-bridal.svg',
      before_image_url: '/media/placeholder-before.svg',
      display_order: 8,
      is_visible: true,
      created_at: iso(-27),
    },
  ] as GalleryItem[],

  leads: [
    {
      id: '7a6b5c4d-4e3f-4a2b-9d1c-000000000001',
      student_name: 'Sunita Bista',
      student_phone: '9812345601',
      course_id: 'c0a1b2c3-2d4e-4f60-8a1b-000000000001',
      status: 'new' as LeadStatus,
      notes: null,
      created_at: iso(-1, 17, 40),
      updated_at: iso(-1, 17, 40),
    },
    {
      id: '7a6b5c4d-4e3f-4a2b-9d1c-000000000002',
      student_name: 'Puja Chaudhary',
      student_phone: '9812345602',
      course_id: 'c0a1b2c3-2d4e-4f60-8a1b-000000000002',
      status: 'contacted' as LeadStatus,
      notes: 'Called 24 Sep — wants the evening batch, will confirm after Dashain.',
      created_at: iso(-4, 11, 5),
      updated_at: iso(-2, 10, 0),
    },
    {
      id: '7a6b5c4d-4e3f-4a2b-9d1c-000000000003',
      student_name: 'Kabita Thapa',
      student_phone: '9812345603',
      course_id: 'c0a1b2c3-2d4e-4f60-8a1b-000000000001',
      status: 'enrolled' as LeadStatus,
      notes: 'Paid रू 20,000 advance. Balance on first day.',
      created_at: iso(-11, 15, 20),
      updated_at: iso(-7, 9, 30),
    },
    {
      id: '7a6b5c4d-4e3f-4a2b-9d1c-000000000004',
      student_name: 'Rekha Saud',
      student_phone: '9812345604',
      course_id: null,
      status: 'archived' as LeadStatus,
      notes: 'Not reachable after three attempts.',
      created_at: iso(-30, 12, 0),
      updated_at: iso(-25, 12, 0),
    },
  ] as AcademyLead[],

  appointments: [] as Appointment[],
};

// Populated after the store object exists, so seeded rows can join their service records.
demoStore.appointments = buildAppointments(demoStore.services);

/** Seeded booking queue: a realistic spread across today and the next two days. */
function buildAppointments(services: Service[]): Appointment[] {
  const rows: Array<{
    n: string;
    dayOffset: number;
    time: string;
    name: string;
    phone: string;
    serviceIdx: number;
    status: AppointmentStatus;
    walkIn?: boolean;
    notes?: string | null;
  }> = [
    { n: '01', dayOffset: 0, time: '10:00', name: 'Sita Joshi', phone: '9812345611', serviceIdx: 4, status: 'confirmed' },
    { n: '02', dayOffset: 0, time: '12:30', name: 'Anita Pant', phone: '9812345612', serviceIdx: 1, status: 'pending', notes: 'Prefers a lighter shade than last time.' },
    { n: '03', dayOffset: 0, time: '15:00', name: 'Mina Rana', phone: '9812345613', serviceIdx: 7, status: 'in_progress' },
    { n: '04', dayOffset: 0, time: '09:00', name: 'Bimala Shah', phone: '9812345614', serviceIdx: 2, status: 'completed', walkIn: true },
    { n: '05', dayOffset: 0, time: '16:30', name: 'Sarita Kumari', phone: '9812345615', serviceIdx: 10, status: 'confirmed' },
    { n: '06', dayOffset: 0, time: '11:30', name: 'Nirmala Devi', phone: '9812345616', serviceIdx: 9, status: 'cancelled', notes: 'Family emergency — asked to rebook next week.' },
    { n: '07', dayOffset: 0, time: '14:00', name: 'Deepa Bhandari', phone: '9812345617', serviceIdx: 13, status: 'confirmed' },
    { n: '08', dayOffset: 0, time: '17:00', name: 'Kamala Rana', phone: '9812345618', serviceIdx: 0, status: 'pending' },
    { n: '09', dayOffset: 1, time: '10:30', name: 'Laxmi Adhikari', phone: '9812345619', serviceIdx: 5, status: 'confirmed' },
    { n: '10', dayOffset: 1, time: '13:00', name: 'Shanti Bhatta', phone: '9812345620', serviceIdx: 11, status: 'pending' },
    { n: '11', dayOffset: 2, time: '09:30', name: 'Radha Gurung', phone: '9812345621', serviceIdx: 14, status: 'confirmed' },
    { n: '12', dayOffset: -1, time: '11:00', name: 'Tulasa Rai', phone: '9812345622', serviceIdx: 3, status: 'completed', walkIn: true },
  ];

  return rows.map((r) => {
    const service = services[r.serviceIdx];
    return {
      id: `5c4d3e2f-6a7b-4c8d-9e0f-0000000000${r.n}`,
      client_name: r.name,
      client_phone: r.phone,
      service_id: service.id,
      booking_date: addDaysISO(todayISO(), r.dayOffset),
      booking_time: r.time,
      notes: r.notes ?? null,
      status: r.status,
      total_amount_npr: effectivePrice(service),
      is_walk_in: Boolean(r.walkIn),
      assigned_staff_id: null,
      created_at: iso(r.dayOffset - 2, 8, 0),
      updated_at: iso(r.dayOffset, 8, 30),
      service: {
        id: service.id,
        title: service.title,
        category: service.category,
        duration_minutes: service.duration_minutes,
        price_npr: service.price_npr,
        discount_price_npr: service.discount_price_npr,
      },
    } satisfies Appointment;
  });
}

/* ------------------------------------------------------------------ helpers */

function withService(appointment: Appointment, services: Service[]): Appointment {
  const service = services.find((s) => s.id === appointment.service_id);
  return {
    ...appointment,
    service: service
      ? {
          id: service.id,
          title: service.title,
          category: service.category,
          duration_minutes: service.duration_minutes,
          price_npr: service.price_npr,
          discount_price_npr: service.discount_price_npr,
        }
      : undefined,
  };
}

/** In-memory store operations mirroring the Supabase query wrappers. */
export const demoDb = {
  getSettings: (): SalonSettings => demoStore.settings,

  updateSettings: (patch: Partial<SalonSettings>): SalonSettings => {
    demoStore.settings = { ...demoStore.settings, ...patch, updated_at: new Date().toISOString() };
    return demoStore.settings;
  },

  getServices: (opts?: { includeInactive?: boolean }): Service[] => {
    const rows = opts?.includeInactive
      ? [...demoStore.services]
      : demoStore.services.filter((s) => s.is_active);
    return rows.sort(
      (a, b) =>
        a.category.localeCompare(b.category) || a.title.localeCompare(b.title)
    );
  },

  getFeaturedServices: (limit = 6): Service[] =>
    demoStore.services.filter((s) => s.is_active && s.is_featured).slice(0, limit),

  getServiceBySlug: (slug: string): Service | null =>
    demoStore.services.find((s) => s.slug === slug) ?? null,

  getServiceById: (id: string): Service | null =>
    demoStore.services.find((s) => s.id === id) ?? null,

  upsertService: (input: Partial<Service> & { title: string; slug: string }): Service => {
    const existing = input.id ? demoStore.services.find((s) => s.id === input.id) : undefined;
    if (existing) {
      const merged = { ...existing, ...input, updated_at: new Date().toISOString() } as Service;
      demoStore.services = demoStore.services.map((s) => (s.id === merged.id ? merged : s));
      return merged;
    }
    const created: Service = {
      id: input.id ?? crypto.randomUUID(),
      title: input.title,
      slug: input.slug,
      category: input.category ?? 'hair',
      description: input.description ?? null,
      duration_minutes: input.duration_minutes ?? 60,
      price_npr: input.price_npr ?? 0,
      discount_price_npr: input.discount_price_npr ?? null,
      image_url: input.image_url ?? null,
      is_featured: input.is_featured ?? false,
      is_active: input.is_active ?? true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    demoStore.services = [created, ...demoStore.services];
    return created;
  },

  updateService: (id: string, patch: Partial<Service>): Service => {
    const merged = demoStore.services.map((s) =>
      s.id === id ? { ...s, ...patch, updated_at: new Date().toISOString() } : s
    );
    demoStore.services = merged;
    return demoStore.services.find((s) => s.id === id)!;
  },

  deleteService: (id: string): void => {
    demoStore.services = demoStore.services.filter((s) => s.id !== id);
  },

  getCourses: (): AcademyCourse[] => demoStore.courses,

  getLeads: (status?: LeadStatus): AcademyLead[] => {
    const rows = status ? demoStore.leads.filter((l) => l.status === status) : [...demoStore.leads];
    return rows
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((lead) => ({
        ...lead,
        course: demoStore.courses.find((c) => c.id === lead.course_id) as AcademyLead['course'],
      }));
  },

  updateLead: (id: string, patch: { status?: LeadStatus; notes?: string }): AcademyLead => {
    demoStore.leads = demoStore.leads.map((l) =>
      l.id === id ? { ...l, ...patch, updated_at: new Date().toISOString() } : l
    );
    return demoStore.leads.find((l) => l.id === id)!;
  },

  createLead: (input: {
    student_name: string;
    student_phone: string;
    course_id: string | null;
    notes?: string;
  }): AcademyLead => {
    const created: AcademyLead = {
      id: crypto.randomUUID(),
      student_name: input.student_name,
      student_phone: input.student_phone,
      course_id: input.course_id,
      status: 'new',
      notes: input.notes ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    demoStore.leads = [created, ...demoStore.leads];
    return created;
  },

  getGallery: (includeHidden = false): GalleryItem[] =>
    (includeHidden ? [...demoStore.gallery] : demoStore.gallery.filter((g) => g.is_visible)).sort(
      (a, b) => a.display_order - b.display_order || b.created_at.localeCompare(a.created_at)
    ),

  upsertGalleryItem: (input: Partial<GalleryItem> & { image_url: string }): GalleryItem => {
    if (input.id) {
      const existing = demoStore.gallery.find((g) => g.id === input.id);
      if (existing) {
        const merged = { ...existing, ...input } as GalleryItem;
        demoStore.gallery = demoStore.gallery.map((g) => (g.id === merged.id ? merged : g));
        return merged;
      }
    }
    const created: GalleryItem = {
      id: input.id ?? crypto.randomUUID(),
      title: input.title ?? null,
      category: input.category ?? 'hair',
      image_url: input.image_url,
      before_image_url: input.before_image_url ?? null,
      display_order: input.display_order ?? demoStore.gallery.length + 1,
      is_visible: input.is_visible ?? true,
      created_at: new Date().toISOString(),
    };
    demoStore.gallery = [...demoStore.gallery, created];
    return created;
  },

  updateGalleryItem: (id: string, patch: Partial<GalleryItem>): GalleryItem => {
    demoStore.gallery = demoStore.gallery.map((g) => (g.id === id ? { ...g, ...patch } : g));
    return demoStore.gallery.find((g) => g.id === id)!;
  },

  deleteGalleryItem: (id: string): void => {
    demoStore.gallery = demoStore.gallery.filter((g) => g.id !== id);
  },

  getAppointmentsByDate: (date: string): Appointment[] =>
    demoStore.appointments
      .filter((a) => a.booking_date === date)
      .sort((a, b) => a.booking_time.localeCompare(b.booking_time))
      .map((a) => withService(a, demoStore.services)),

  getAppointmentsInRange: (from: string, to: string): Appointment[] =>
    demoStore.appointments
      .filter((a) => a.booking_date >= from && a.booking_date <= to)
      .sort(
        (a, b) =>
          a.booking_date.localeCompare(b.booking_date) ||
          a.booking_time.localeCompare(b.booking_time)
      )
      .map((a) => withService(a, demoStore.services)),

  getBookedSlots: (date: string): Pick<Appointment, 'booking_time' | 'status'>[] =>
    demoStore.appointments
      .filter(
        (a) =>
          a.booking_date === date &&
          ['pending', 'confirmed', 'in_progress'].includes(a.status)
      )
      .map((a) => ({ booking_time: a.booking_time, status: a.status })),

  createAppointment: (
    input: Omit<Appointment, 'id' | 'created_at' | 'updated_at' | 'assigned_staff_id'> & {
      assigned_staff_id?: string | null;
    }
  ): Appointment => {
    const created: Appointment = {
      ...input,
      id: crypto.randomUUID(),
      assigned_staff_id: input.assigned_staff_id ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    demoStore.appointments = [...demoStore.appointments, created];
    return created;
  },

  updateAppointmentStatus: (id: string, status: AppointmentStatus): Appointment => {
    demoStore.appointments = demoStore.appointments.map((a) =>
      a.id === id ? { ...a, status, updated_at: new Date().toISOString() } : a
    );
    const row = demoStore.appointments.find((a) => a.id === id)!;
    return withService(row, demoStore.services);
  },

  getDailyKpis: (date: string): DailyKpis => {
    const rows = demoStore.appointments.filter((a) => a.booking_date === date);
    const byStatus = (s: AppointmentStatus) => rows.filter((r) => r.status === s).length;
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
  },
};
