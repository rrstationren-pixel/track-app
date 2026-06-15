
-- 1) Profiles: restrict email exposure
DROP POLICY IF EXISTS "profiles readable by authenticated" ON public.profiles;
CREATE POLICY "profiles readable by self or admin"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

-- 2) Storage: task-photos scoped to uploader folder, admins full access
DROP POLICY IF EXISTS "auth read task-photos" ON storage.objects;
DROP POLICY IF EXISTS "auth upload task-photos" ON storage.objects;
DROP POLICY IF EXISTS "auth update task-photos" ON storage.objects;
DROP POLICY IF EXISTS "auth delete task-photos" ON storage.objects;

CREATE POLICY "task-photos read own or admin"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'task-photos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "task-photos insert own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'task-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "task-photos update own or admin"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'task-photos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "task-photos delete own or admin"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'task-photos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
  )
);

-- 3) Tasks: employees can only change status column (admin trigger bypass)
CREATE OR REPLACE FUNCTION public.tg_tasks_employee_status_only()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.title := OLD.title;
    NEW.description := OLD.description;
    NEW.assigned_to := OLD.assigned_to;
    NEW.created_by := OLD.created_by;
    NEW.due_date := OLD.due_date;
    NEW.archived_at := OLD.archived_at;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.tg_tasks_employee_status_only() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tasks_employee_status_only ON public.tasks;
CREATE TRIGGER tasks_employee_status_only
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.tg_tasks_employee_status_only();

-- 4) Lock down SECURITY DEFINER function execution
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
