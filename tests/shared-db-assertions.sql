DO $$ BEGIN
  IF (SELECT count(*) FROM public.social_user_profiles) <> 0 THEN
    RAISE EXCEPTION 'Gourmet users were imported'; END IF;
  IF (SELECT marker FROM public.gourmet_fixture WHERE id=1) <> 'preserve-gourmet' THEN
    RAISE EXCEPTION 'Gourmet data changed'; END IF;
END $$;
UPDATE auth.users SET last_sign_in_at=now() WHERE id='00000000-0000-4000-8000-000000000001';
DO $$ BEGIN
  IF (SELECT count(*) FROM public.social_user_profiles) <> 0 THEN
    RAISE EXCEPTION 'Gourmet sign-in enrolled an SNS user'; END IF;
END $$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
SELECT public.social_ensure_profile();
SELECT public.social_ensure_profile();
UPDATE public.social_user_profiles SET store_id='marugo' WHERE user_id=auth.uid();
INSERT INTO public.social_workspaces(id,name,store_id,created_by)
VALUES ('10000000-0000-4000-8000-000000000001','Test SNS','marugo',auth.uid());
INSERT INTO public.social_posts(id,workspace_id,title,created_by)
VALUES ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Test draft',auth.uid());
INSERT INTO storage.objects(bucket_id,name)
VALUES ('social-post-files','10000000-0000-4000-8000-000000000001/test.txt');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.social_posts) <> 1 THEN RAISE EXCEPTION 'Owner cannot read'; END IF;
  IF has_table_privilege(current_user,'public.social_integration_secrets','SELECT') THEN
    RAISE EXCEPTION 'Client can read integration secrets'; END IF;
  IF has_table_privilege(current_user,'public.social_media_jobs','UPDATE') THEN
    RAISE EXCEPTION 'Client can update arbitrary job columns'; END IF;
  IF has_table_privilege(current_user,'public.social_user_profiles','UPDATE') THEN
    RAISE EXCEPTION 'Client can forge profile email'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
SELECT public.social_ensure_profile();
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.social_posts) THEN RAISE EXCEPTION 'Cross-user post leak'; END IF;
  IF EXISTS (SELECT 1 FROM storage.objects) THEN RAISE EXCEPTION 'Cross-user file leak'; END IF;
  IF (SELECT count(*) FROM public.social_user_profiles) <> 1 THEN RAISE EXCEPTION 'Profile leak'; END IF;
  IF social_private.is_social_admin() THEN RAISE EXCEPTION 'Unexpected administrator'; END IF;
  IF social_private.file_workspace('not-a-uuid/path') IS NOT NULL THEN RAISE EXCEPTION 'Unsafe path'; END IF;
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.social_stores) <> 23 THEN RAISE EXCEPTION 'Store list unavailable'; END IF;
  IF has_table_privilege(current_user,'public.social_posts','SELECT') THEN RAISE EXCEPTION 'Anonymous posts exposed'; END IF;
  IF has_function_privilege(current_user,'public.social_ensure_profile()','EXECUTE') THEN RAISE EXCEPTION 'Anonymous enrollment allowed'; END IF;
END $$;
RESET ROLE;
SELECT 'Shared database isolation assertions passed' AS result;
