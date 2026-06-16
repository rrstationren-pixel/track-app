
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS attachments text[] NOT NULL DEFAULT '{}';

-- Storage policies for shared task attachments uploaded by admin under tasks/<taskId>/...
CREATE POLICY "task-photos shared read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'task-photos'
  AND (storage.foldername(name))[1] = 'tasks'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id::text = (storage.foldername(name))[2]
        AND t.assigned_to = auth.uid()
    )
  )
);

CREATE POLICY "task-photos shared admin insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'task-photos'
  AND (storage.foldername(name))[1] = 'tasks'
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "task-photos shared admin delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'task-photos'
  AND (storage.foldername(name))[1] = 'tasks'
  AND public.has_role(auth.uid(), 'admin')
);
