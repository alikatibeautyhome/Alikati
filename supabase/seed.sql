-- ═════════════════════════════════════════════════════════════════════════════
-- Alikati Beauty Home — local development seed
--
-- Mirrors `lib/demo-data.ts` so a locally provisioned Supabase behaves like demo mode.
-- Runs on `supabase db reset`. Never run this against production.
-- Prices are realistic seed values — replace with the owner's real price list.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── Salon configuration ─────────────────────────────────────────────────────
UPDATE public.salon_settings
SET phone               = '+977-9800000000',
    whatsapp_number     = '9779800000000',
    address             = 'Mahendranagar Road, Attariya Chowk, Kailali, Nepal',
    announcement_text   = 'Dashain & Tihar offer: 10% off all hair treatments until Kartik end.',
    announcement_active = TRUE,
    opening_time        = '08:00',
    closing_time        = '19:00'
WHERE id = 1;

-- ── Services ────────────────────────────────────────────────────────────────
INSERT INTO public.services
    (title, slug, category, description, duration_minutes, price_npr, discount_price_npr, image_url, is_featured, is_active)
VALUES
    ('Signature Hair Cut & Blow Dry', 'signature-hair-cut-blow-dry', 'hair',
     'Consultation, precision cut and a finishing blow dry styled for your face shape.',
     45, 800, NULL, '/media/placeholder-hair.svg', TRUE, TRUE),

    ('Keratin Smoothing Treatment', 'keratin-smoothing-treatment', 'hair',
     'Frizz control and shine for up to 4 months using a formaldehyde-free keratin system.',
     180, 4500, 4000, '/media/placeholder-hair.svg', TRUE, TRUE),

    ('Hair Spa & Deep Conditioning', 'hair-spa-deep-conditioning', 'hair',
     'Steam-assisted scalp massage with a repairing mask for dry, heat-damaged hair.',
     60, 1500, NULL, '/media/placeholder-hair.svg', TRUE, TRUE),

    ('Global Hair Colour', 'global-hair-colour', 'hair',
     'Ammonia-free global colour with a post-colour bond treatment and blow dry.',
     120, 3500, NULL, '/media/placeholder-hair.svg', FALSE, TRUE),

    ('Signature Bridal Package', 'signature-bridal-package', 'bridal',
     'Full bridal transformation: HD makeup, hair styling, draping, jewellery setting and touch-up kit.',
     300, 25000, NULL, '/media/placeholder-bridal.svg', TRUE, TRUE),

    ('Engagement Makeup', 'engagement-makeup', 'bridal',
     'Long-wear HD makeup with hairstyling for the engagement ceremony and photo session.',
     150, 8000, NULL, '/media/placeholder-bridal.svg', FALSE, TRUE),

    ('Bridal Hair Styling Only', 'bridal-hair-styling-only', 'bridal',
     'Structured bridal updo or open waves with accessories, for brides with their own makeup artist.',
     90, 3500, NULL, '/media/placeholder-bridal.svg', FALSE, TRUE),

    ('Gel Nail Art', 'gel-nail-art', 'nails',
     'Gel extensions with hand-painted art, shaped and finished with a high-gloss top coat.',
     75, 1800, 1500, '/media/placeholder-nails.svg', TRUE, TRUE),

    ('Classic Manicure & Pedicure', 'classic-manicure-pedicure', 'nails',
     'Shaping, cuticle care, exfoliation, massage and polish for hands and feet.',
     60, 1200, NULL, '/media/placeholder-nails.svg', FALSE, TRUE),

    ('Gold Facial', 'gold-facial', 'skin',
     'Brightening gold-leaf facial for dull, tired skin before an event.',
     60, 2500, NULL, '/media/placeholder-skin.svg', TRUE, TRUE),

    ('Hydrafacial Glow', 'hydrafacial-glow', 'skin',
     'Deep cleanse, gentle peel, extraction and hydration in one session.',
     75, 4000, 3500, '/media/placeholder-skin.svg', TRUE, TRUE),

    ('Threading (Eyebrow + Upper Lip)', 'threading-eyebrow-upper-lip', 'skin',
     'Precision eyebrow shaping and upper-lip threading.',
     20, 150, NULL, '/media/placeholder-skin.svg', FALSE, TRUE),

    ('Full Body Waxing', 'full-body-waxing', 'skin',
     'Full arms, legs, underarms and back using low-temperature wax.',
     90, 3000, NULL, '/media/placeholder-skin.svg', FALSE, TRUE),

    ('Glow & Go Package (Facial + Mani-Pedi)', 'glow-and-go-package', 'packages',
     'Our most booked pre-event combination: gold facial with classic manicure and pedicure.',
     150, 4500, NULL, '/media/placeholder-package.svg', TRUE, TRUE),

    ('Mom-to-Be Package', 'mom-to-be-package', 'packages',
     'Prenatal-safe facial, hair spa, gentle waxing and mani-pedi for expectant mothers.',
     180, 12000, NULL, '/media/placeholder-package.svg', FALSE, TRUE),

    ('Party Makeup (Retired)', 'party-makeup', 'bridal',
     'Seasonal party makeup package — currently retired from the online catalogue.',
     90, 5000, NULL, '/media/placeholder-bridal.svg', FALSE, FALSE)
ON CONFLICT (slug) DO NOTHING;

-- ── Academy courses ─────────────────────────────────────────────────────────
INSERT INTO public.academy_courses (title, slug, duration_weeks, fee_npr, syllabus, is_enrolling)
VALUES
    ('Professional Beautician Course', 'professional-beautician-course', 12, 45000,
     '["Skin analysis and hygiene protocol","Threading, waxing and bleaching","Facial therapies (basic, gold, anti-ageing)","Mani-pedi and foot spa","Hair cutting fundamentals","Hair spa, blow dry and styling","Client handling and salon costing"]'::jsonb,
     TRUE),

    ('Advanced Bridal Makeup Artistry', 'advanced-bridal-makeup-artistry', 6, 35000,
     '["Colour theory and skin-tone matching","HD and airbrush makeup techniques","Bridal eye makeup and lash application","Draping: saree, lehenga and dupatta setting","Hairstyling for bridal looks","Portfolio shoot and client consultation"]'::jsonb,
     TRUE),

    ('Nail Art & Extension Specialist', 'nail-art-extension-specialist', 4, 22000,
     '["Nail anatomy, hygiene and safety","Gel extension application and filing","Hand-painted art and chrome finishes","Nail repair and removal","Pricing and aftercare advice"]'::jsonb,
     FALSE)
ON CONFLICT (slug) DO NOTHING;

-- ── Gallery ─────────────────────────────────────────────────────────────────
INSERT INTO public.gallery_items (title, category, image_url, before_image_url, display_order, is_visible)
VALUES
    ('Signature bridal look — Sita',        'bridal',   '/media/placeholder-bridal.svg',  '/media/placeholder-before.svg', 1, TRUE),
    ('Keratin smoothing — 4 month result',  'hair',     '/media/placeholder-hair.svg',    '/media/placeholder-before.svg', 2, TRUE),
    ('Gel nail art with chrome accent',     'nails',    '/media/placeholder-nails.svg',   NULL,                            3, TRUE),
    ('Hydrafacial glow — pre-event',        'skin',     '/media/placeholder-skin.svg',    '/media/placeholder-before.svg', 4, TRUE),
    ('Engagement makeup — Anita',           'bridal',   '/media/placeholder-bridal.svg',  NULL,                            5, TRUE),
    ('Hair spa and gloss finish',           'hair',     '/media/placeholder-hair.svg',    NULL,                            6, TRUE),
    ('Glow & Go package result',            'packages', '/media/placeholder-package.svg', NULL,                            7, FALSE),
    ('Bridal hair styling — open waves',    'bridal',   '/media/placeholder-bridal.svg',  '/media/placeholder-before.svg', 8, TRUE);

-- ── Academy leads ───────────────────────────────────────────────────────────
INSERT INTO public.academy_leads (student_name, student_phone, course_id, status, notes)
SELECT 'Sunita Bista',   '9812345601', c.id, 'new',       NULL
FROM public.academy_courses c WHERE c.slug = 'professional-beautician-course';

INSERT INTO public.academy_leads (student_name, student_phone, course_id, status, notes)
SELECT 'Puja Chaudhary', '9812345602', c.id, 'contacted',
       'Called 24 Sep — wants the evening batch, will confirm after Dashain.'
FROM public.academy_courses c WHERE c.slug = 'advanced-bridal-makeup-artistry';

INSERT INTO public.academy_leads (student_name, student_phone, course_id, status, notes)
SELECT 'Kabita Thapa',   '9812345603', c.id, 'enrolled',
       'Paid रू 20,000 advance. Balance on first day.'
FROM public.academy_courses c WHERE c.slug = 'professional-beautician-course';

INSERT INTO public.academy_leads (student_name, student_phone, course_id, status, notes)
VALUES ('Rekha Saud', '9812345604', NULL, 'archived', 'Not reachable after three attempts.');

-- ── Appointments (today ± a few days, in Nepal local time) ──────────────────
-- `created_at` is explicitly set so the velocity guard (3/phone/day) cannot trip on seed data.
INSERT INTO public.appointments
    (client_name, client_phone, service_id, booking_date, booking_time, status, total_amount_npr, is_walk_in, notes, created_at)
SELECT v.client_name, v.client_phone, s.id, v.booking_date, v.booking_time,
       v.status::appointment_status, s.price_npr, v.is_walk_in, v.notes,
       timezone('utc'::text, now()) - INTERVAL '2 days'
FROM (VALUES
    ('Sita Joshi',      '9812345611', 'signature-bridal-package',         0, TIME '10:00', 'confirmed',   FALSE, NULL),
    ('Anita Pant',      '9812345612', 'keratin-smoothing-treatment',      0, TIME '12:30', 'pending',     FALSE, 'Prefers a lighter shade than last time.'),
    ('Mina Rana',       '9812345613', 'gel-nail-art',                    0, TIME '15:00', 'in_progress', FALSE, NULL),
    ('Bimala Shah',     '9812345614', 'hair-spa-deep-conditioning',       0, TIME '09:00', 'completed',   TRUE,  NULL),
    ('Sarita Kumari',   '9812345615', 'gold-facial',                     0, TIME '16:30', 'confirmed',   FALSE, NULL),
    ('Nirmala Devi',    '9812345616', 'classic-manicure-pedicure',        0, TIME '11:30', 'cancelled',   FALSE, 'Family emergency — asked to rebook next week.'),
    ('Deepa Bhandari',  '9812345617', 'full-body-waxing',                0, TIME '14:00', 'confirmed',   FALSE, NULL),
    ('Kamala Rana',     '9812345618', 'signature-hair-cut-blow-dry',      0, TIME '17:00', 'pending',     FALSE, NULL),
    ('Laxmi Adhikari',  '9812345619', 'engagement-makeup',                1, TIME '10:30', 'confirmed',   FALSE, NULL),
    ('Shanti Bhatta',   '9812345620', 'hydrafacial-glow',                 1, TIME '13:00', 'pending',     FALSE, NULL),
    ('Radha Gurung',    '9812345621', 'glow-and-go-package',              2, TIME '09:30', 'confirmed',   FALSE, NULL),
    ('Tulasa Rai',      '9812345622', 'global-hair-colour',              -1, TIME '11:00', 'completed',   TRUE,  NULL)
) AS v(client_name, client_phone, slug, day_offset, booking_time, status, is_walk_in, notes)
JOIN public.services s ON s.slug = v.slug
WHERE v.booking_date = (timezone('Asia/Kathmandu', now()))::date + v.day_offset;

-- ── Staff admin account ─────────────────────────────────────────────────────
-- Create the auth user first (Supabase Studio → Authentication → Add user), then promote:
--
--   UPDATE public.profiles SET role = 'admin' WHERE email = 'owner@alikatibeautyhome.com';
--
-- A profile row is created automatically by the `trg_on_auth_user_created` trigger.
