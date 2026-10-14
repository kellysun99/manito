-- Run only on an empty TEST installation. Test modifications are rolled back.
begin;
do $$ begin if exists(select from public.manito_entries) or exists(select from public.manito_users) then raise exception 'Use an empty test database'; end if; end $$;
create temporary table test_tokens(name text,token text);
insert into public.manito_users(name,employee_no,is_admin,is_participant) values('테스트관리자','000001',true,false);
insert into public.manito_users(name,employee_no,is_participant) select '팀원'||lpad(i::text,2,'0'),'001234',true from generate_series(1,3) i;
insert into public.manito_users(name,employee_no) select '비참가'||i,'005678' from generate_series(1,4) i;
insert into test_tokens select name,public.login(name,case when is_admin then '000001' when is_participant then '001234' else '005678' end)->>'token' from public.manito_users;
do $$ declare tok text; admin_tok text; other uuid; answer jsonb; begin
 select token into tok from test_tokens where name='팀원01'; select token into admin_tok from test_tokens where name='테스트관리자';
 select id into other from public.manito_users where name='팀원02';
 if (select employee_no from public.manito_users where name='팀원01')<>'001234' then raise exception 'Employee number was altered'; end if;
 begin perform public.login('팀원01','1234'); raise exception 'Expected INVALID_LOGIN'; exception when raise_exception then if sqlerrm<>'INVALID_LOGIN' then raise; end if; end;
 begin perform public.get_screen('bad'); raise exception 'Expected AUTH_REQUIRED'; exception when raise_exception then if sqlerrm<>'AUTH_REQUIRED' then raise; end if; end;
 perform public.save_target(tok,other); perform public.save_activity(tok,'음료를 가져다줬어요');
 begin perform public.save_target((select token from test_tokens where name='팀원03'),other); raise exception 'Expected TARGET_TAKEN'; exception when raise_exception then if sqlerrm<>'TARGET_TAKEN' then raise; end if; end;
 begin perform public.advance_phase(tok,'ACTIVITY'); raise exception 'Expected FORBIDDEN'; exception when raise_exception then if sqlerrm<>'FORBIDDEN' then raise; end if; end;
 begin perform public.advance_phase(admin_tok,'ACTIVITY'); raise exception 'Expected MISSING_TARGETS'; exception when raise_exception then if sqlerrm<>'MISSING_TARGETS' then raise; end if; end;
 answer:=public.get_screen(tok); if answer->'adminData'<>'null'::jsonb or answer->'results'<>'null'::jsonb then raise exception 'Pre-reveal leak'; end if;
end $$;
-- Complete a cycle: each participant cares for the next participant.
do $$ declare r record; target uuid; begin for r in select name,token from test_tokens where name like '팀원%' order by name loop
 select id into target from public.manito_users where name='팀원'||lpad(((right(r.name,2)::int %3)+1)::text,2,'0'); perform public.save_target(r.token,target); end loop; end $$;
select public.advance_phase((select token from test_tokens where name='테스트관리자'),'ACTIVITY');
do $$ declare t text; actual uuid; begin
 select token into t from test_tokens where name='팀원01'; select id into actual from public.manito_users where name='팀원03';
 begin perform public.save_activity(t,'late'); raise exception 'Expected PHASE_CLOSED'; exception when raise_exception then if sqlerrm<>'PHASE_CLOSED' then raise; end if; end;
 perform public.save_guess(t,actual,'작은 힌트를 봤어요');
end $$;
select public.advance_phase((select token from test_tokens where name='테스트관리자'),'GUESS');
do $$ declare s jsonb; begin
 s:=public.get_screen((select token from test_tokens where name='팀원01'));
 if s->'summary'->>'correct'<>'1' or s->'summary'->>'missing'<>'2' or s->'summary'->>'accuracy'<>'100.0' then raise exception 'Summary incorrect'; end if;
 if jsonb_array_length(s->'results')<>3 then raise exception 'Result count incorrect'; end if;
end $$;
-- RLS bypass attempts using the actual browser role.
set local role anon;
do $$ begin
 begin perform * from public.manito_users; raise exception 'Direct read allowed'; exception when insufficient_privilege then null; end;
 begin perform manito_private.session_user(repeat('0',64)); raise exception 'Helper execution allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;

