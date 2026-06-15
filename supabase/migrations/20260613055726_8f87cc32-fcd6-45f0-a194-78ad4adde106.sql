
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS tasks_set_updated_at ON public.tasks;
CREATE TRIGGER tasks_set_updated_at BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Update handle_new_user to also write email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), NEW.email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'employee')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill emails
UPDATE public.profiles p SET email = u.email
FROM auth.users u WHERE p.id = u.id AND p.email IS NULL;

-- Task overview view
CREATE OR REPLACE VIEW public.task_overview
WITH (security_invoker = true) AS
SELECT
  t.id, t.title, t.description, t.assigned_to, t.created_by, t.status,
  t.due_date, t.created_at, t.updated_at, t.archived_at,
  p.name AS assignee_name, p.email AS assignee_email,
  COALESCE(r.report_count, 0) AS report_count,
  r.last_report_at
FROM public.tasks t
LEFT JOIN public.profiles p ON p.id = t.assigned_to
LEFT JOIN (
  SELECT task_id, COUNT(*)::int AS report_count, MAX(submitted_at) AS last_report_at
  FROM public.reports GROUP BY task_id
) r ON r.task_id = t.id;

GRANT SELECT ON public.task_overview TO authenticated;
