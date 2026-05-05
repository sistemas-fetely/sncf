INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('contratos', 'contratos', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "contratos_upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'contratos');

CREATE POLICY "contratos_leitura" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'contratos');

CREATE POLICY "contratos_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'contratos');