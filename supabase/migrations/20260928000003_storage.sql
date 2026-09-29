-- ═════════════════════════════════════════════════════════════════════════════
-- Alikati Beauty Home — 0003: Storage buckets and object policies
--
-- Buckets are public (read via CDN). Uploads require a signed-in staff profile; permanent
-- deletion requires the admin role. Object keys follow
--   {category}/{YYYY-MM}/{uuid}.{ext}
-- so they cannot be enumerated and never collide.
-- ═════════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
    ('gallery',  'gallery',  TRUE, 8388608,  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
    ('services', 'services', TRUE, 4194304,  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
    ('academy',  'academy',  TRUE, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Public CDN read
CREATE POLICY "media_public_read" ON storage.objects
    FOR SELECT USING (bucket_id IN ('gallery', 'services', 'academy'));

-- Staff upload / overwrite
CREATE POLICY "media_staff_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id IN ('gallery', 'services', 'academy') AND public.is_staff());

CREATE POLICY "media_staff_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id IN ('gallery', 'services', 'academy') AND public.is_staff());

-- Admin-only permanent delete
CREATE POLICY "media_admin_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id IN ('gallery', 'services', 'academy') AND public.is_admin());
