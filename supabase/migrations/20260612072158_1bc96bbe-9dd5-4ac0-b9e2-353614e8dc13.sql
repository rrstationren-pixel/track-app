
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE POLICY "auth read task-photos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'task-photos');
CREATE POLICY "auth upload task-photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'task-photos');
CREATE POLICY "auth update task-photos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'task-photos');
CREATE POLICY "auth delete task-photos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'task-photos');
