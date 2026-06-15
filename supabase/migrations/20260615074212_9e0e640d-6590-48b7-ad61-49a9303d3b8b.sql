CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
  v_phone text;
BEGIN
  -- Treat synthetic phone-auth emails as no email
  v_email := CASE WHEN NEW.email IS NULL OR NEW.email LIKE '%@phone.local' THEN NULL ELSE NEW.email END;
  v_phone := NULLIF(NEW.raw_user_meta_data->>'phone', '');

  INSERT INTO public.profiles (id, name, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    v_email,
    v_phone
  )
  ON CONFLICT (id) DO UPDATE
    SET email = COALESCE(EXCLUDED.email, public.profiles.email),
        phone = COALESCE(EXCLUDED.phone, public.profiles.phone);

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'employee')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;

-- Make sure existing profiles don't carry synthetic emails
UPDATE public.profiles SET email = NULL WHERE email LIKE '%@phone.local';