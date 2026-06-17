
-- 1. Add completed_at column
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Backfill completed_at for already-completed tasks
UPDATE public.tasks SET completed_at = updated_at
  WHERE status = 'completed' AND completed_at IS NULL;

-- 2. Trigger to auto-set/clear completed_at on status changes
CREATE OR REPLACE FUNCTION public.tg_tasks_completed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
      NEW.completed_at := now();
    ELSIF NEW.status <> 'completed' AND OLD.status = 'completed' THEN
      NEW.completed_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_completed_at ON public.tasks;
CREATE TRIGGER tasks_completed_at BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_tasks_completed_at();

-- 3. Replace employee status-only trigger so creators can edit their own tasks
CREATE OR REPLACE FUNCTION public.tg_tasks_employee_status_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin: no restriction
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  -- Creator (employee): can edit their own task fields freely
  IF OLD.created_by = auth.uid() THEN
    -- but cannot assign to an admin
    IF NEW.assigned_to IS NOT NULL AND public.has_role(NEW.assigned_to, 'admin') THEN
      RAISE EXCEPTION '不能将任务分配给管理员';
    END IF;
    RETURN NEW;
  END IF;
  -- Assignee employee: can only change status; preserve other fields
  NEW.title := OLD.title;
  NEW.description := OLD.description;
  NEW.assigned_to := OLD.assigned_to;
  NEW.created_by := OLD.created_by;
  NEW.due_date := OLD.due_date;
  NEW.archived_at := OLD.archived_at;
  NEW.created_at := OLD.created_at;
  NEW.attachments := OLD.attachments;
  RETURN NEW;
END;
$$;

-- Ensure the trigger is attached
DROP TRIGGER IF EXISTS tasks_employee_status_only ON public.tasks;
CREATE TRIGGER tasks_employee_status_only BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_tasks_employee_status_only();

-- 4. Tasks RLS: allow employees to create & view tasks they created
DROP POLICY IF EXISTS "employees read assigned tasks" ON public.tasks;
DROP POLICY IF EXISTS "employees read created or assigned tasks" ON public.tasks;
CREATE POLICY "employees read created or assigned tasks"
  ON public.tasks FOR SELECT TO authenticated
  USING (assigned_to = auth.uid() OR created_by = auth.uid());

DROP POLICY IF EXISTS "employees insert tasks for non-admins" ON public.tasks;
CREATE POLICY "employees insert tasks for non-admins"
  ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (assigned_to IS NULL OR NOT public.has_role(assigned_to, 'admin'))
  );

-- Employees update: keep existing assignee-update policy plus allow creator updates
DROP POLICY IF EXISTS "employees update assigned tasks status" ON public.tasks;
DROP POLICY IF EXISTS "employees update own tasks" ON public.tasks;
CREATE POLICY "employees update own tasks"
  ON public.tasks FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid() OR created_by = auth.uid())
  WITH CHECK (assigned_to = auth.uid() OR created_by = auth.uid());

-- 5. Recreate task_overview view to expose completed_at, creator info
DROP VIEW IF EXISTS public.task_overview;
CREATE VIEW public.task_overview
WITH (security_invoker = true)
AS
SELECT
  t.id, t.title, t.description, t.assigned_to, t.created_by,
  t.status, t.due_date, t.created_at, t.updated_at, t.archived_at,
  t.completed_at, t.attachments,
  pa.name AS assignee_name, pa.email AS assignee_email,
  pc.name AS creator_name,
  COALESCE(r.report_count, 0) AS report_count,
  r.last_report_at
FROM public.tasks t
LEFT JOIN public.profiles pa ON pa.id = t.assigned_to
LEFT JOIN public.profiles pc ON pc.id = t.created_by
LEFT JOIN (
  SELECT task_id, count(*)::int AS report_count, max(submitted_at) AS last_report_at
  FROM public.reports GROUP BY task_id
) r ON r.task_id = t.id;

GRANT SELECT ON public.task_overview TO authenticated;

-- 6. Allow employees to read other employees' profiles (needed to display creator/assignee names),
--    but only when not an admin profile. Admins already readable via existing policy.
DROP POLICY IF EXISTS "authenticated read non-admin profiles" ON public.profiles;
CREATE POLICY "authenticated read non-admin profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (NOT public.has_role(id, 'admin') OR id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
