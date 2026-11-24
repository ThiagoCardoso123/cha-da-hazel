-- Verificações de permissões e fluxos. Rode em um Postgres local DESCARTÁVEL
-- (nunca no projeto real): 00_simula_supabase.sql, a migração e este arquivo.
\set ON_ERROR_STOP 1
\set QUIET 1
create schema t; grant usage on schema t to authenticated, anon;
create function t.ok(label text, cond boolean) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALHOU: %', label; end if;
  raise notice 'ok  %', label;
end $$;
create function t.denied(label text, q text) returns void language plpgsql as $$
declare n bigint;
begin
  begin
    execute q; get diagnostics n = row_count;
  exception when insufficient_privilege or check_violation then
    raise notice 'ok  % (negado)', label; return;
  end;
  if n = 0 then raise notice 'ok  % (0 linhas)', label; return; end if;
  raise exception 'FALHOU (deveria ser negado): %', label;
end $$;
grant execute on all functions in schema t to authenticated, anon;

insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000000a', 'pais@exemplo.com'),
 ('00000000-0000-0000-0000-000000000001', null),
 ('00000000-0000-0000-0000-000000000002', null),
 ('00000000-0000-0000-0000-000000000003', null),
 ('00000000-0000-0000-0000-0000000000f0', null),
 ('00000000-0000-0000-0000-0000000000ee', null);
insert into public.admins values ('00000000-0000-0000-0000-00000000000a');
update public.event_private set join_code = 'HAZEL', tv_key = 'chave-da-tv';
update public.event set auto_approve = false;  -- os blocos abaixo testam o fluxo com aprovação
\set admin '00000000-0000-0000-0000-00000000000a'
\set ana   '00000000-0000-0000-0000-000000000001'
\set beto  '00000000-0000-0000-0000-000000000002'
\set carla '00000000-0000-0000-0000-000000000003'
\set tv    '00000000-0000-0000-0000-0000000000f0'
\set intruso '00000000-0000-0000-0000-0000000000ee'
\set m1 '10000000-0000-0000-0000-000000000001'
\set m2 '10000000-0000-0000-0000-000000000002'
\set m3 '10000000-0000-0000-0000-000000000003'
\set p1 '20000000-0000-0000-0000-000000000001'

-- ===== sem sessão (anon) =====
set role anon;
select t.denied('anon não lê evento', 'select * from public.event');
select t.denied('anon não executa join_event', $$select public.join_event('HAZEL','x')$$);
reset role;

-- ===== entrada =====
set role authenticated;
select set_config('request.jwt.claim.sub', :'intruso', false);
select t.ok('código errado é recusado', (public.join_event('ERRADO', 'Zé')->>'error') = 'invalid_code');
select t.ok('sem participante: não envia recado', (public.submit_message(:'m3', 'oi')->>'error') = 'not_participant');
select t.ok('intruso não vê rodadas', (select count(*) from public.quiz_rounds) = 0);
select public.join_event('ERRADO', 'Zé') from generate_series(1, 8);
select t.ok('bloqueio após muitas tentativas', (public.join_event('HAZEL', 'Zé')->>'error') = 'too_many_attempts');

select set_config('request.jwt.claim.sub', :'ana', false);
select t.ok('Ana entra (código sem diferenciar maiúsculas)', (public.join_event(' hazel ', '  Ana   Clara ')->'participant'->>'name') = 'Ana Clara');
select t.ok('entrar de novo é idempotente', (public.join_event('qualquer', 'Outra')->'participant'->>'name') = 'Ana Clara');
select t.ok('corrigir nome', (public.rename_me('Ana')->>'ok')::boolean);
select set_config('request.jwt.claim.sub', :'beto', false);
select t.ok('Beto entra', (public.join_event('HAZEL', 'Beto')->>'ok')::boolean);
select t.ok('nome vazio recusado', (public.rename_me('   ')->>'error') = 'invalid_name');

-- ===== recados =====
select set_config('request.jwt.claim.sub', :'ana', false);
select t.ok('Ana envia recado', (public.submit_message(:'m1', 'Bem-vinda, Hazel! Com carinho, coração.')->>'status') = 'pending');
select t.ok('reenvio não duplica', (public.submit_message(:'m1', 'Bem-vinda, Hazel! Com carinho, coração.')->>'duplicate')::boolean);
select t.ok('uma linha só', (select count(*) from public.messages) = 1);
select t.ok('recado longo demais recusado', (public.submit_message(:'m3', repeat('a', 281))->>'error') = 'invalid_body');
select t.denied('convidado não insere direto', $$insert into public.messages (id, participant_id, author_name, body, status) values (gen_random_uuid(), auth.uid(), 'x', 'x', 'approved')$$);
select t.denied('convidado não se aprova', $$update public.messages set status = 'approved'$$);
select t.ok('convidado não modera via função', (public.admin_moderate('message', :'m1', 'approved')->>'error') = 'forbidden');
select t.denied('convidado não muda a TV', $$update public.event set tv_mode = 'closing'$$);
select t.denied('convidado não lê segredos', 'select * from public.event_private');
select t.denied('convidado não lê perguntas', 'select * from public.quiz_questions');
select t.denied('convidado não lê gabarito', 'select * from public.quiz_round_keys');
select t.denied('convidado não vira admin', $$insert into public.admins values (auth.uid())$$);
select t.ok('convidado não vê o jardim', (select count(*) from public.garden_flowers) = 0);

select set_config('request.jwt.claim.sub', :'beto', false);
select t.ok('Beto não vê recado pendente da Ana', (select count(*) from public.messages) = 0);
select t.ok('Beto não usa id de recado alheio', (public.submit_message(:'m1', 'x')->>'error') = 'invalid_id');
select t.ok('Beto envia', (public.submit_message(:'m2', 'Felicidades!')->>'ok')::boolean);
select t.ok('Beto não vê outros participantes', (select count(*) from public.participants) = 1);

-- ===== TV =====
select set_config('request.jwt.claim.sub', :'tv', false);
select t.ok('TV com chave errada', (public.tv_claim('nada')->>'error') = 'invalid_key');
select t.ok('sem parear: sem código', (public.tv_bootstrap()->>'error') = 'forbidden');
select t.ok('TV pareia', (public.tv_claim('chave-da-tv')->>'ok')::boolean);
select t.ok('TV recebe código', (public.tv_bootstrap()->>'join_code') = 'HAZEL');
select t.ok('TV não vê pendentes', (select count(*) from public.messages) = 0);
select t.denied('TV não controla o modo', $$update public.event set tv_mode = 'album'$$);

-- ===== moderação =====
select set_config('request.jwt.claim.sub', :'admin', false);
select t.ok('pais veem a fila', (select count(*) from public.messages where status = 'pending') = 2);
select t.ok('aprovar', (public.admin_moderate('message', :'m1', 'approved')->>'changed')::boolean);
select t.ok('aprovar de novo não repete', not (public.admin_moderate('message', :'m1', 'approved')->>'changed')::boolean);
select t.ok('girassol nasceu', (select name from public.garden_flowers) = 'Ana');
select t.ok('versão de conteúdo avançou uma vez', (select content_version from public.event) = 1);
select t.ok('rejeitar', (public.admin_moderate('message', :'m2', 'rejected')->>'ok')::boolean);

select set_config('request.jwt.claim.sub', :'tv', false);
select t.ok('TV vê só o aprovado', (select count(*) from public.messages) = 1);
select t.ok('TV vê o girassol', (select count(*) from public.garden_flowers) = 1);
select t.denied('TV não lê palpites individuais', 'select * from public.guesses');

select set_config('request.jwt.claim.sub', :'ana', false);
select t.ok('Ana corrige o nome de novo', (public.rename_me('Aninha')->>'ok')::boolean);
select set_config('request.jwt.claim.sub', :'tv', false);
select t.ok('renomear não muda a TV sem nova aprovação', (select name from public.garden_flowers) = 'Ana');
select set_config('request.jwt.claim.sub', :'ana', false);
select t.ok('segundo recado da Ana', (public.submit_message(:'m3', 'Mais um beijo')->>'ok')::boolean);
select set_config('request.jwt.claim.sub', :'admin', false);
select public.admin_moderate('message', :'m3', 'approved');
select t.ok('sem girassol duplicado', (select count(*) from public.garden_flowers) = 1);
select t.ok('girassol recebe nome corrigido após nova aprovação', (select name from public.garden_flowers) = 'Aninha');
select public.admin_moderate('message', :'m3', 'removed');
select t.ok('remover um recado mantém a flor', (select count(*) from public.garden_flowers) = 1);
select public.admin_moderate('message', :'m1', 'removed');
select t.ok('sem recados aprovados, a flor sai', (select count(*) from public.garden_flowers) = 0);
select public.admin_moderate('message', :'m1', 'approved');

-- ===== fotos =====
select set_config('request.jwt.claim.sub', :'ana', false);
select t.ok('foto sem arquivo é recusada', (public.submit_photo(:'p1', 'oi', 800, 600)->>'error') = 'file_missing');
select t.denied('upload fora da própria pasta', $$insert into storage.objects (bucket_id, name) values ('hazel-photos', '00000000-0000-0000-0000-000000000002/20000000-0000-0000-0000-000000000001.jpg')$$);
select t.denied('upload com nome fora do padrão', $$insert into storage.objects (bucket_id, name) values ('hazel-photos', '00000000-0000-0000-0000-000000000001/virus.exe')$$);
insert into storage.objects (bucket_id, name) values ('hazel-photos', :'ana' || '/' || :'p1' || '.jpg');
select t.ok('foto registrada', (public.submit_photo(:'p1', 'Mesa de doces', 800, 600)->>'status') = 'pending');
select t.ok('reenvio de foto não duplica', (public.submit_photo(:'p1', 'Mesa de doces', 800, 600)->>'duplicate')::boolean);
select set_config('request.jwt.claim.sub', :'beto', false);
select t.ok('Beto não vê arquivo da Ana', (select count(*) from storage.objects) = 0);
select set_config('request.jwt.claim.sub', :'tv', false);
select t.ok('TV não vê arquivo pendente', (select count(*) from storage.objects) = 0);
select set_config('request.jwt.claim.sub', :'admin', false);
select t.ok('pais veem arquivo pendente', (select count(*) from storage.objects) = 1);
select public.admin_moderate('photo', :'p1', 'approved');
select set_config('request.jwt.claim.sub', :'tv', false);
select t.ok('TV vê arquivo aprovado', (select count(*) from storage.objects) = 1);
select t.ok('TV vê foto aprovada', (select count(*) from public.photos) = 1);
select set_config('request.jwt.claim.sub', :'beto', false);
select t.ok('convidado não vê foto aprovada de outro (sem galeria)', (select count(*) from public.photos) = 0);

-- ===== palpites =====
select t.ok('palpite inválido', (public.save_guess(current_date + 30, 900, 50, 'mix')->>'error') = 'invalid_weight');
select t.ok('palpite Beto', (public.save_guess(current_date + 30, 3200, 49.5, 'mom')->>'ok')::boolean);
select t.ok('editar palpite', (public.save_guess(current_date + 31, 3300, 50, 'dad')->>'ok')::boolean);
select t.ok('um palpite por sessão', (select count(*) from public.guesses) = 1);
select set_config('request.jwt.claim.sub', :'ana', false);
select t.ok('palpite Ana', (public.save_guess(current_date + 31, 3500, 51, 'mix')->>'ok')::boolean);
select t.ok('Ana não vê palpite do Beto', (select count(*) from public.guesses) = 1);
select t.ok('convidado não lê resumo', (public.guess_summary()->>'error') = 'forbidden');
select set_config('request.jwt.claim.sub', :'tv', false);
select t.ok('resumo: total', (public.guess_summary()->>'total')::int = 2);
select t.ok('resumo: média de peso', (public.guess_summary()->'weight'->>'avg')::int = 3400);
select t.ok('resumo: data mais escolhida', (public.guess_summary()->'dates'->0->>'count')::int = 2);

-- ===== quiz =====
select set_config('request.jwt.claim.sub', :'admin', false);
insert into public.quiz_questions (id, kind, prompt, options, correct_index, duration_seconds)
values ('30000000-0000-0000-0000-000000000001', 'quiz', 'Pergunta de teste?', '["A","B","C"]', 2, 10);
select t.denied('quiz sem resposta correta é inválido', $$insert into public.quiz_questions (kind, prompt, options) values ('quiz', 'x', '["A","B"]')$$);
select (public.admin_open_round('30000000-0000-0000-0000-000000000001')->>'round_id') as rid \gset
select t.ok('não abre duas rodadas ao mesmo tempo', (public.admin_open_round('30000000-0000-0000-0000-000000000001')->>'error') = 'round_in_progress');
select t.ok('não revela com a rodada aberta', (public.admin_reveal_round(:'rid')->>'error') = 'still_open');

select set_config('request.jwt.claim.sub', :'ana', false);
select t.ok('convidado vê a rodada sem gabarito', (select correct_index is null and results is null from public.quiz_rounds where id = :'rid'));
select t.ok('linha pública não tem a resposta', (select to_jsonb(r)->>'correct_index' is null from public.quiz_rounds r where id = :'rid'));
select t.ok('opção inválida', (public.cast_vote(:'rid', 7)->>'error') = 'invalid_option');
select t.ok('Ana vota', (public.cast_vote(:'rid', 2)->>'ok')::boolean);
select t.ok('segundo voto não troca o primeiro', (public.cast_vote(:'rid', 0)->>'option')::int = 2);
select t.denied('voto direto na tabela', $$insert into public.quiz_votes values ('$$ || :'rid' || $$', auth.uid(), 1)$$);
select set_config('request.jwt.claim.sub', :'beto', false);
select t.ok('Beto vota', (public.cast_vote(:'rid', 0)->>'ok')::boolean);
select t.ok('Beto não vê voto da Ana', (select count(*) from public.quiz_votes) = 1);
select set_config('request.jwt.claim.sub', :'tv', false);
select t.ok('TV vê total, não votos', (select total_votes from public.quiz_rounds where id = :'rid') = 2 and (select count(*) from public.quiz_votes) = 0);

select set_config('request.jwt.claim.sub', :'admin', false);
select t.ok('encerrar', (public.admin_close_round(:'rid')->>'ok')::boolean);
select set_config('request.jwt.claim.sub', :'carla', false);
select public.join_event('HAZEL', 'Carla');
select t.ok('voto após encerrar é recusado', (public.cast_vote(:'rid', 1)->>'error') = 'round_closed');
select t.ok('encerrada ainda sem gabarito', (select correct_index is null from public.quiz_rounds where id = :'rid'));
select set_config('request.jwt.claim.sub', :'admin', false);
select t.ok('revelar', (public.admin_reveal_round(:'rid')->>'ok')::boolean);
select set_config('request.jwt.claim.sub', :'carla', false);
select t.ok('resultado e resposta após revelar', (select results = '[1,0,1]'::jsonb and correct_index = 2 and status = 'revealed' from public.quiz_rounds where id = :'rid'));

-- prazo do servidor: rodada vencida recusa voto mesmo sem ninguém encerrar
select set_config('request.jwt.claim.sub', :'admin', false);
select (public.admin_open_round((select id from public.quiz_questions where kind = 'poll' order by position limit 1))->>'round_id') as rid2 \gset
reset role;
update public.quiz_rounds set closes_at = now() - interval '1 second' where id = :'rid2';
set role authenticated;
select set_config('request.jwt.claim.sub', :'carla', false);
select t.ok('prazo vencido recusa voto', (public.cast_vote(:'rid2', 0)->>'error') = 'round_closed');
select set_config('request.jwt.claim.sub', :'admin', false);
select t.ok('revela rodada vencida (enquete)', (public.admin_reveal_round(:'rid2')->>'ok')::boolean);
select t.ok('enquete não tem resposta correta', (select correct_index is null and results = '[0,0]'::jsonb from public.quiz_rounds where id = :'rid2'));

-- ===== atividades fechadas e encerramento =====
update public.event set messages_open = false where id = 1;
select set_config('request.jwt.claim.sub', :'carla', false);
select t.ok('atividade fechada bloqueia recado', (public.submit_message(gen_random_uuid(), 'oi')->>'error') = 'activity_closed');
select set_config('request.jwt.claim.sub', :'admin', false);
update public.event set messages_open = true, is_closed = true where id = 1;
select set_config('request.jwt.claim.sub', :'carla', false);
select t.ok('evento encerrado bloqueia recado', (public.submit_message(gen_random_uuid(), 'oi')->>'error') = 'event_closed');
select t.ok('evento encerrado bloqueia palpite', (public.save_guess(current_date + 30, 3200, 50, 'mix')->>'error') = 'event_closed');
select t.denied('evento encerrado bloqueia upload', $$insert into storage.objects (bucket_id, name) values ('hazel-photos', '00000000-0000-0000-0000-000000000003/20000000-0000-0000-0000-000000000009.jpg')$$);
select t.ok('sem galeria: convidado não lê recados dos outros', (select count(*) from public.messages) = 0);
select set_config('request.jwt.claim.sub', :'admin', false);
select t.ok('conteúdo preservado', (select count(*) from public.messages) = 3);
select set_config('request.jwt.claim.sub', :'admin', false);
update public.event set guest_gallery_enabled = true where id = 1;
select set_config('request.jwt.claim.sub', :'carla', false);
select t.ok('galeria liberada: convidado lê aprovados', (select count(*) from public.messages) = 1 and (select count(*) from public.photos) = 1);
select t.ok('galeria liberada: nunca pendentes/rejeitados', (select bool_and(status = 'approved') from public.messages));
select set_config('request.jwt.claim.sub', :'intruso', false);
select t.ok('quem não participou não lê a galeria', (select count(*) from public.messages) = 0);

-- ===== troca da chave da TV =====
select set_config('request.jwt.claim.sub', :'admin', false);
select t.ok('trocar chave', (public.admin_rotate_tv_key()->>'ok')::boolean);
select set_config('request.jwt.claim.sub', :'tv', false);
select t.ok('TV antiga perde acesso', (select count(*) from public.messages) = 0);
reset role;

-- ===== publicação direta (sem aprovação prévia) =====
set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
update public.event set is_closed = false, guest_gallery_enabled = false, auto_approve = true where id = 1;
select content_version as v0 from public.event \gset
select set_config('request.jwt.claim.sub', :'carla', false);
select t.ok('direto: recado já sai aprovado', (public.submit_message('10000000-0000-0000-0000-0000000000d1', 'Oi, Hazel!')->>'status') = 'approved');
select t.ok('direto: reenvio não duplica', (public.submit_message('10000000-0000-0000-0000-0000000000d1', 'Oi, Hazel!')->>'duplicate')::boolean);
insert into storage.objects (bucket_id, name) values ('hazel-photos', :'carla' || '/20000000-0000-0000-0000-0000000000d2.jpg');
select t.ok('direto: foto já sai aprovada', (public.submit_photo('20000000-0000-0000-0000-0000000000d2', '', 800, 600)->>'status') = 'approved');
select t.denied('direto: convidado continua sem mudar a configuração', $$update public.event set auto_approve = false$$);
reset role;
insert into public.tv_devices values (:'tv') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub', :'tv', false);
select t.ok('direto: TV vê o recado e o girassol na hora', (select count(*) from public.messages where body = 'Oi, Hazel!') = 1 and (select count(*) from public.garden_flowers where name = 'Carla') = 1);
select t.ok('direto: TV vê a foto na hora', (select count(*) from public.photos where id = '20000000-0000-0000-0000-0000000000d2') = 1);
select t.ok('direto: TV foi avisada (uma vez por item)', (select content_version from public.event) = :v0 + 2);
select set_config('request.jwt.claim.sub', :'admin', false);
select t.ok('direto: pais retiram da TV', (public.admin_moderate('message', '10000000-0000-0000-0000-0000000000d1', 'removed')->>'changed')::boolean);
select set_config('request.jwt.claim.sub', :'tv', false);
select t.ok('direto: retirado some da TV, com o girassol', (select count(*) from public.messages where body = 'Oi, Hazel!') = 0 and (select count(*) from public.garden_flowers where name = 'Carla') = 0);
reset role;
\echo TODAS AS VERIFICACOES PASSARAM
