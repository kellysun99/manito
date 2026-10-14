-- RESET installation: removes all existing data in the four manito tables.
-- employee_no stores the original string; no credential_hash column or hashing trigger.
-- Includes the activity-close fix: no fixed account/participant count.
-- Counts come from is_participant=true; only missing targets block guessing.
-- Remaining functions from an older installation are removed explicitly below.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists manito_private;
do $$ begin if not exists(select from pg_roles where rolname='manito_executor') then create role manito_executor nologin; end if; end $$;
-- Supabase SQL Editor runs as postgres (not an unrestricted superuser).
-- Function ownership transfer requires membership allowing SET ROLE.
grant manito_executor to postgres;
-- Explicitly requested fresh start. CASCADE also removes functions whose
-- signatures depend on these table row types. No unrelated tables are dropped.
drop table if exists public.manito_sessions cascade;
drop table if exists public.manito_entries cascade;
drop table if exists public.manito_settings cascade;
drop table if exists public.manito_users cascade;
-- Dropping tables does not necessarily remove RPCs or their private helpers.
-- Only this app's named functions are removed; no CASCADE is used.
drop function if exists public.login(text,text);
drop function if exists public.logout(text);
drop function if exists public.get_screen(text);
drop function if exists public.save_target(text,uuid);
drop function if exists public.clear_target(text);
drop function if exists public.save_activity(text,text);
drop function if exists public.save_guess(text,uuid,text);
drop function if exists public.advance_phase(text,text);
drop function if exists manito_private.login(text,text);
drop function if exists manito_private.logout(text);
drop function if exists manito_private.get_screen(text);
drop function if exists manito_private.write_entry(text,text,uuid,text);
drop function if exists manito_private.advance_phase(text,text);
drop function if exists manito_private.session_user(text);
drop function if exists manito_private.hash_credential();
create table public.manito_users (
 id uuid primary key default gen_random_uuid(), name text not null unique check(name=btrim(name) and length(name) between 1 and 100),
 employee_no text not null check(length(employee_no) between 1 and 100), is_admin boolean not null default false, is_participant boolean not null default false,
 check(not is_admin or not is_participant)
);
create unique index manito_one_admin on public.manito_users(is_admin) where is_admin;
create table public.manito_entries (
 user_id uuid primary key references public.manito_users(id), target_id uuid unique references public.manito_users(id), activity_text text,
 guessed_giver_id uuid references public.manito_users(id), guess_reason text,
 target_updated_at timestamptz, activity_updated_at timestamptz, guess_updated_at timestamptz,
 check(target_id is null or target_id<>user_id), check(guessed_giver_id is null or guessed_giver_id<>user_id),
 check(activity_text is null or length(btrim(activity_text)) between 1 and 2000),
 check((guessed_giver_id is null and guess_reason is null) or (guessed_giver_id is not null and length(btrim(guess_reason)) between 1 and 1000 and guess_reason is not null))
);
create index manito_guess_fk on public.manito_entries(guessed_giver_id);
create table public.manito_settings(id smallint primary key check(id=1), phase text not null default 'ACTIVITY' check(phase in ('ACTIVITY','GUESS','REVEALED')),updated_at timestamptz not null default now(),updated_by uuid references public.manito_users(id));
insert into public.manito_settings(id) values(1);
create table public.manito_sessions(token_hash text primary key,user_id uuid not null references public.manito_users(id),created_at timestamptz not null default now());
create index manito_session_user on public.manito_sessions(user_id);
-- All tables are inaccessible through direct browser queries.
do $$ declare t text; begin foreach t in array array['manito_users','manito_entries','manito_settings','manito_sessions'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select,insert,update,delete on public.%I to manito_executor',t);
 execute format('create policy executor_access on public.%I to manito_executor using (true) with check (true)',t);
end loop; end $$;
grant usage on schema public,extensions,manito_private to manito_executor;
grant create on schema manito_private to manito_executor;
create function manito_private.session_user(p_token text) returns public.manito_users language plpgsql set search_path='' as $$
declare u public.manito_users; begin
 if p_token is null or length(p_token)<>64 then raise exception 'AUTH_REQUIRED'; end if;
 select x.* into u from public.manito_sessions s join public.manito_users x on x.id=s.user_id where s.token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 if u.id is null then raise exception 'AUTH_REQUIRED'; end if; return u;
end $$;
create function manito_private.user_json(u public.manito_users) returns jsonb language sql set search_path='' as $$ select jsonb_build_object('id',u.id,'name',u.name,'isAdmin',u.is_admin,'isParticipant',u.is_participant) $$;
create function manito_private.entry_json(e public.manito_entries) returns jsonb language sql set search_path='' as $$ select case when e.user_id is null then null else jsonb_build_object('userId',e.user_id,'targetId',e.target_id,'activityText',e.activity_text,'guessedGiverId',e.guessed_giver_id,'guessReason',e.guess_reason,'targetUpdatedAt',e.target_updated_at,'activityUpdatedAt',e.activity_updated_at,'guessUpdatedAt',e.guess_updated_at) end $$;
create function manito_private.login(p_name text,p_employee_no text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u public.manito_users; tok text; begin
 if p_employee_no is null or length(p_employee_no) not between 1 and 100 then raise exception 'INVALID_LOGIN'; end if;
 select * into u from public.manito_users where name=btrim(p_name);
 if u.id is null or u.employee_no is null or u.employee_no<>p_employee_no then raise exception 'INVALID_LOGIN'; end if;
 tok:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.manito_sessions(token_hash,user_id) values(encode(extensions.digest(tok,'sha256'),'hex'),u.id);
 return jsonb_build_object('token',tok,'me',manito_private.user_json(u)); end $$;
create function manito_private.logout(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$ begin
 perform manito_private.session_user(p_token); delete from public.manito_sessions where token_hash=encode(extensions.digest(p_token,'sha256'),'hex'); return '{}'::jsonb; end $$;
create function manito_private.get_screen(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u public.manito_users; s public.manito_settings; e public.manito_entries; candidates jsonb:='[]'; admins jsonb; results jsonb; summary jsonb;
begin
 u:=manito_private.session_user(p_token); select * into s from public.manito_settings where id=1; if s.id is null then raise exception 'SETUP_ERROR'; end if;
 select * into e from public.manito_entries where user_id=u.id;
 if u.is_participant or u.is_admin then select coalesce(jsonb_agg(manito_private.user_json(x) order by x.name),'[]') into candidates from public.manito_users x where x.is_participant; end if;
 if u.is_admin then select jsonb_agg(manito_private.user_json(x)||jsonb_build_object('entry',manito_private.entry_json(y)) order by x.name) into admins from public.manito_users x left join public.manito_entries y on y.user_id=x.id; end if;
 if s.phase='REVEALED' then
  if exists(select from public.manito_users x where x.is_participant and not exists(select from public.manito_entries y where y.target_id=x.id)) then raise exception 'SETUP_ERROR'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('userId',x.id,'name',x.name,'actualGiverId',giver.id,'actualGiverName',giver.name,'guessedGiverName',guess.name,'guessReason',mine.guess_reason,'verdict',case when mine.guessed_giver_id is null then 'NOT_SUBMITTED' when mine.guessed_giver_id=giver.id then 'CORRECT' else 'INCORRECT' end,'receivedActivity',received.activity_text,'targetName',target.name,'activityText',mine.activity_text) order by x.name),'[]') into results
  from public.manito_users x left join public.manito_entries mine on mine.user_id=x.id left join public.manito_entries received on received.target_id=x.id left join public.manito_users giver on giver.id=received.user_id left join public.manito_users guess on guess.id=mine.guessed_giver_id left join public.manito_users target on target.id=mine.target_id where x.is_participant;
 end if;
 if u.is_admin or s.phase='REVEALED' then
  select jsonb_build_object('total',count(*),'targets',count(m.target_id),'activities',count(*) filter(where m.target_id is not null and m.activity_text is not null),'guesses',count(m.guessed_giver_id),'correct',case when s.phase='REVEALED' then count(*) filter(where m.guessed_giver_id=r.user_id) else 0 end,'incorrect',case when s.phase='REVEALED' then count(*) filter(where m.guessed_giver_id is not null and m.guessed_giver_id<>r.user_id) else 0 end,'missing',count(*)-count(m.guessed_giver_id),'accuracy',case when s.phase='REVEALED' then round(100.0*count(*) filter(where m.guessed_giver_id=r.user_id)/nullif(count(m.guessed_giver_id),0),1) else null end) into summary
  from public.manito_users x left join public.manito_entries m on m.user_id=x.id left join public.manito_entries r on r.target_id=x.id where x.is_participant;
 end if;
 return jsonb_build_object('phase',s.phase,'updatedAt',s.updated_at,'me',manito_private.user_json(u),'myEntry',manito_private.entry_json(e),'candidates',candidates,'adminData',admins,'results',results,'summary',summary);
end $$;
create function manito_private.write_entry(p_token text,p_action text,p_target uuid default null,p_text text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u public.manito_users; phase text; e public.manito_entries; begin
 u:=manito_private.session_user(p_token); if not u.is_participant then raise exception 'NOT_PARTICIPANT'; end if;
 select s.phase into phase from public.manito_settings s where id=1 for update;
 if phase is null then raise exception 'SETUP_ERROR'; end if;
 if (p_action in ('target','clear','activity') and phase<>'ACTIVITY') or (p_action='guess' and phase<>'GUESS') then raise exception 'PHASE_CLOSED'; end if;
 if p_action not in ('target','clear','activity','guess') then raise exception 'VALIDATION_ERROR'; end if;
 if p_action in ('target','guess') and (p_target is null or p_target=u.id or not exists(select from public.manito_users where id=p_target and is_participant)) then raise exception 'VALIDATION_ERROR'; end if;
 insert into public.manito_entries(user_id) values(u.id) on conflict do nothing;
 if p_action='target' then
  begin update public.manito_entries set target_id=p_target,target_updated_at=now() where user_id=u.id; exception when unique_violation then raise exception 'TARGET_TAKEN'; end;
 elsif p_action='clear' then update public.manito_entries set target_id=null,target_updated_at=now() where user_id=u.id;
 elsif p_action='activity' then
  if not exists(select from public.manito_entries where user_id=u.id and target_id is not null) then raise exception 'TARGET_REQUIRED'; end if;
  if p_text is null or length(btrim(p_text)) not between 1 and 2000 then raise exception 'VALIDATION_ERROR'; end if;
  update public.manito_entries set activity_text=btrim(p_text),activity_updated_at=now() where user_id=u.id;
 else
  if p_text is null or length(btrim(p_text)) not between 1 and 1000 then raise exception 'VALIDATION_ERROR'; end if;
  update public.manito_entries set guessed_giver_id=p_target,guess_reason=btrim(p_text),guess_updated_at=now() where user_id=u.id;
 end if;
 select * into e from public.manito_entries where user_id=u.id; return manito_private.entry_json(e); end $$;
create function manito_private.advance_phase(p_token text,p_expected_phase text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u public.manito_users; s public.manito_settings; begin
 u:=manito_private.session_user(p_token); if not u.is_admin then raise exception 'FORBIDDEN'; end if;
 if p_expected_phase is null or p_expected_phase not in ('ACTIVITY','GUESS','REVEALED') then raise exception 'VALIDATION_ERROR'; end if;
 select * into s from public.manito_settings where id=1 for update;
 if s.id is null then raise exception 'SETUP_ERROR'; end if;
 if s.phase<>p_expected_phase or s.phase='REVEALED' then return jsonb_build_object('phase',s.phase,'updatedAt',s.updated_at); end if;
 if s.phase='ACTIVITY' then
  -- Participant count is derived from the current roster, never hard-coded.
  if exists(
   select from public.manito_users participant
   where participant.is_participant
     and not exists (
       select from public.manito_entries entry
       join public.manito_users target on target.id=entry.target_id
       where entry.user_id=participant.id and target.is_participant
     )
  ) then raise exception 'MISSING_TARGETS'; end if;
 end if;
 update public.manito_settings set phase=case when s.phase='ACTIVITY' then 'GUESS' else 'REVEALED' end,updated_at=now(),updated_by=u.id where id=1 returning * into s;
 return jsonb_build_object('phase',s.phase,'updatedAt',s.updated_at); end $$;
-- Exposed wrappers carry no privileges; private entry points validate the token.
create function public.login(p_name text,p_employee_no text) returns jsonb language sql security invoker set search_path='' as $$ select manito_private.login(p_name,p_employee_no) $$;
create function public.logout(p_token text) returns jsonb language sql security invoker set search_path='' as $$ select manito_private.logout(p_token) $$;
create function public.get_screen(p_token text) returns jsonb language sql security invoker set search_path='' as $$ select manito_private.get_screen(p_token) $$;
create function public.save_target(p_token text,p_target_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select manito_private.write_entry(p_token,'target',p_target_id) $$;
create function public.clear_target(p_token text) returns jsonb language sql security invoker set search_path='' as $$ select manito_private.write_entry(p_token,'clear') $$;
create function public.save_activity(p_token text,p_activity_text text) returns jsonb language sql security invoker set search_path='' as $$ select manito_private.write_entry(p_token,'activity',null,p_activity_text) $$;
create function public.save_guess(p_token text,p_guessed_giver_id uuid,p_reason text) returns jsonb language sql security invoker set search_path='' as $$ select manito_private.write_entry(p_token,'guess',p_guessed_giver_id,p_reason) $$;
create function public.advance_phase(p_token text,p_expected_phase text) returns jsonb language sql security invoker set search_path='' as $$ select manito_private.advance_phase(p_token,p_expected_phase) $$;
-- Assign restricted owner and revoke default execute on EVERY helper.
do $$ declare r record; begin for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='manito_private' loop
 execute format('alter function %s owner to manito_executor',r.sig); execute format('revoke all on function %s from public,anon,authenticated',r.sig);
end loop;
for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('login','logout','get_screen','save_target','clear_target','save_activity','save_guess','advance_phase') loop
 execute format('revoke all on function %s from public,anon,authenticated',r.sig); execute format('grant execute on function %s to anon',r.sig);
end loop; end $$;
grant usage on schema manito_private to anon;
grant execute on function manito_private.login(text,text),manito_private.logout(text),manito_private.get_screen(text),manito_private.write_entry(text,text,uuid,text),manito_private.advance_phase(text,text) to anon;
revoke create on schema manito_private from manito_executor;
commit;
