-- =====================================================================
-- Chá da Hazel — esquema, permissões e funções
-- Rode este arquivo inteiro no SQL Editor do Supabase (projeto novo).
--
-- Modelo de acesso, em resumo:
--   * convidado  = sessão anônima do Supabase Auth que entrou com o código
--                  do evento (linha em public.participants)
--   * TV         = sessão anônima que apresentou a chave da TV
--                  (linha em public.tv_devices)
--   * pais       = usuário com e-mail e senha listado em public.admins
-- Nenhuma tabela aceita escrita direta de convidados: tudo passa por
-- funções que validam os dados no servidor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------

create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.participants (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tv_devices (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Tentativas erradas de código (convidado) ou chave (TV), por sessão.
create table public.access_attempts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  fails   int not null default 0,
  last_at timestamptz not null default now()
);

create table public.messages (
  id             uuid primary key,              -- gerado no celular: reenvio não duplica
  participant_id uuid not null references public.participants (id) on delete cascade,
  author_name    text not null,
  body           text not null check (char_length(body) between 1 and 280),
  status         text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected', 'removed')),
  created_at     timestamptz not null default now(),
  moderated_at   timestamptz,
  approved_at    timestamptz
);
create index messages_status_idx on public.messages (status, created_at);
create index messages_participant_idx on public.messages (participant_id, created_at);

create table public.photos (
  id             uuid primary key,              -- gerado no celular: reenvio não duplica
  participant_id uuid not null references public.participants (id) on delete cascade,
  author_name    text not null,
  caption        text not null default '' check (char_length(caption) <= 120),
  storage_path   text not null unique,
  width          int not null check (width between 1 and 10000),
  height         int not null check (height between 1 and 10000),
  status         text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected', 'removed')),
  created_at     timestamptz not null default now(),
  moderated_at   timestamptz,
  approved_at    timestamptz
);
create index photos_status_idx on public.photos (status, created_at);
create index photos_participant_idx on public.photos (participant_id, created_at);

-- Um girassol por participante com recado aprovado.
create table public.garden_flowers (
  participant_id uuid primary key references public.participants (id) on delete cascade,
  name           text not null,
  seq            bigint generated always as identity,
  created_at     timestamptz not null default now()
);

create table public.guesses (
  participant_id uuid primary key references public.participants (id) on delete cascade,
  author_name    text not null,
  birth_date     date not null,
  weight_g       int not null check (weight_g between 1500 and 6000),
  height_cm      numeric(4, 1) not null check (height_cm between 35 and 65),
  looks_like     text not null check (looks_like in ('mom', 'dad', 'mix')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.quiz_questions (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('quiz', 'poll')),
  prompt           text not null check (char_length(prompt) between 1 and 160),
  options          jsonb not null,
  correct_index    int,
  duration_seconds int not null default 30 check (duration_seconds between 10 and 300),
  position         int not null default 0,
  created_at       timestamptz not null default now(),
  constraint options_shape check (
    jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 4
  ),
  constraint correct_matches_kind check (
    (kind = 'poll' and correct_index is null)
    or (kind = 'quiz' and correct_index is not null
        and correct_index >= 0 and correct_index < jsonb_array_length(options))
  )
);

-- Rodada = uma pergunta colocada no ar. Esta tabela é lida por convidados e
-- pela TV, por isso NÃO guarda a resposta correta enquanto a rodada não for
-- revelada (correct_index e results ficam nulos até lá).
create table public.quiz_rounds (
  id            uuid primary key default gen_random_uuid(),
  question_id   uuid references public.quiz_questions (id) on delete set null,
  kind          text not null check (kind in ('quiz', 'poll')),
  prompt        text not null,
  options       jsonb not null,
  status        text not null default 'open' check (status in ('open', 'closed', 'revealed')),
  opened_at     timestamptz not null default now(),
  closes_at     timestamptz not null,
  total_votes   int not null default 0,
  results       jsonb,
  correct_index int,
  revealed_at   timestamptz
);

-- Gabarito da rodada: só os pais leem.
create table public.quiz_round_keys (
  round_id      uuid primary key references public.quiz_rounds (id) on delete cascade,
  correct_index int
);

create table public.quiz_votes (
  round_id       uuid not null references public.quiz_rounds (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  option_index   int not null,
  created_at     timestamptz not null default now(),
  primary key (round_id, participant_id)        -- um voto por participante por rodada
);

-- Estado do evento (linha única), lido por todas as telas.
create table public.event (
  id                    int primary key default 1 check (id = 1),
  tv_mode               text not null default 'garden'
                        check (tv_mode in ('garden', 'album', 'quiz', 'guesses', 'closing')),
  messages_open         boolean not null default true,
  photos_open           boolean not null default true,
  guesses_open          boolean not null default true,
  quiz_open             boolean not null default true,
  is_closed             boolean not null default false,
  guest_gallery_enabled boolean not null default false,
  message_seconds       int not null default 10 check (message_seconds between 4 and 60),
  photo_seconds         int not null default 7 check (photo_seconds between 3 and 60),
  current_round_id      uuid references public.quiz_rounds (id) on delete set null,
  content_version       bigint not null default 0,
  updated_at            timestamptz not null default now()
);

-- Segredos do evento: só os pais leem.
create table public.event_private (
  id        int primary key default 1 check (id = 1),
  join_code text not null check (char_length(join_code) between 4 and 12),
  tv_key    text not null
);

insert into public.event (id) values (1);

insert into public.event_private (id, join_code, tv_key)
values (
  1,
  -- 5 caracteres sem letras/números que se confundem (0/O, 1/I)
  (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
     from generate_series(1, 5)),
  replace(gen_random_uuid()::text, '-', '')
);

-- Perguntas sugeridas, todas como ENQUETE (sem resposta correta).
-- Para virar quiz, os pais editam no painel e marcam a resposta.
insert into public.quiz_questions (kind, prompt, options, duration_seconds, position) values
  ('poll', 'Quem escolheu o nome Hazel?',                              '["Mamãe", "Papai"]', 30, 1),
  ('poll', 'Quem vai tirar mais fotos?',                                '["Mamãe", "Papai"]', 30, 2),
  ('poll', 'Quem vai cantar para ela dormir?',                          '["Mamãe", "Papai"]', 30, 3),
  ('poll', 'Quem vai se emocionar primeiro com a primeira palavra?',    '["Mamãe", "Papai"]', 30, 4),
  ('poll', 'Quem vai trocar mais fraldas?',                             '["Mamãe", "Papai"]', 30, 5);

-- ---------------------------------------------------------------------
-- Funções auxiliares de papel
-- ---------------------------------------------------------------------

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

create function public.is_tv() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tv_devices where user_id = (select auth.uid()));
$$;

create function public.is_participant() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.participants where id = (select auth.uid()));
$$;

-- Versão de leitura para convidados, liberada pelos pais após o evento.
create function public.gallery_open() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select guest_gallery_enabled from public.event where id = 1), false)
     and exists (select 1 from public.participants where id = (select auth.uid()));
$$;

create function public.clean_text(p text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(btrim(coalesce(p, ''), E' \t\n\r'), '[ \t]+', ' ', 'g');
$$;

create function public.bump_content() returns void
language sql security definer set search_path = '' as $$
  update public.event set content_version = content_version + 1, updated_at = now() where id = 1;
$$;

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger event_touch before update on public.event
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Funções gerais
-- ---------------------------------------------------------------------

create function public.server_time() returns timestamptz
language sql stable set search_path = '' as $$ select now(); $$;

create function public.whoami() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'uid', (select auth.uid()),
    'is_admin', public.is_admin(),
    'is_tv', public.is_tv(),
    'participant', (select jsonb_build_object('id', p.id, 'name', p.name)
                      from public.participants p where p.id = (select auth.uid()))
  );
$$;

-- Registra tentativa errada e devolve true se a sessão está bloqueada.
create function public.access_blocked(p_uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.access_attempts
     where user_id = p_uid and fails >= 8 and last_at > now() - interval '10 minutes'
  );
$$;

create function public.access_fail(p_uid uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.access_attempts (user_id, fails, last_at) values (p_uid, 1, now())
  on conflict (user_id) do update
    set fails = case when public.access_attempts.last_at < now() - interval '10 minutes'
                     then 1 else public.access_attempts.fails + 1 end,
        last_at = now();
$$;

-- ---------------------------------------------------------------------
-- Convidados
-- ---------------------------------------------------------------------

create function public.join_event(p_code text, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_name text := public.clean_text(p_name);
  v_row  public.participants;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'no_session'); end if;

  select * into v_row from public.participants where id = v_uid;
  if found then
    return jsonb_build_object('ok', true, 'participant', jsonb_build_object('id', v_row.id, 'name', v_row.name));
  end if;

  if (select is_closed from public.event where id = 1) then
    return jsonb_build_object('ok', false, 'error', 'event_closed');
  end if;
  if public.access_blocked(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
  end if;
  if upper(btrim(coalesce(p_code, ''))) is distinct from (select upper(join_code) from public.event_private where id = 1) then
    perform public.access_fail(v_uid);
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 30 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;

  insert into public.participants (id, name) values (v_uid, v_name)
  on conflict (id) do nothing;
  select * into v_row from public.participants where id = v_uid;
  return jsonb_build_object('ok', true, 'participant', jsonb_build_object('id', v_row.id, 'name', v_row.name));
end $$;

-- Corrige o nome. O girassol já plantado só muda de nome quando um novo
-- recado for aprovado: assim nenhum nome chega à TV sem passar pelos pais.
create function public.rename_me(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_name text := public.clean_text(p_name);
begin
  if char_length(v_name) < 1 or char_length(v_name) > 30 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  update public.participants set name = v_name, updated_at = now() where id = v_uid;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_participant'); end if;
  return jsonb_build_object('ok', true, 'participant', jsonb_build_object('id', v_uid, 'name', v_name));
end $$;

create function public.submit_message(p_id uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_body  text := btrim(coalesce(p_body, ''), E' \t\n\r');
  v_name  text;
  v_event public.event;
  v_old   public.messages;
begin
  select name into v_name from public.participants where id = v_uid;
  if v_name is null then return jsonb_build_object('ok', false, 'error', 'not_participant'); end if;

  -- reenvio do mesmo recado (toque repetido ou nova tentativa): não duplica
  select * into v_old from public.messages where id = p_id;
  if found then
    if v_old.participant_id = v_uid then
      return jsonb_build_object('ok', true, 'duplicate', true, 'status', v_old.status);
    end if;
    return jsonb_build_object('ok', false, 'error', 'invalid_id');
  end if;

  select * into v_event from public.event where id = 1;
  if v_event.is_closed then return jsonb_build_object('ok', false, 'error', 'event_closed'); end if;
  if not v_event.messages_open then return jsonb_build_object('ok', false, 'error', 'activity_closed'); end if;
  if p_id is null then return jsonb_build_object('ok', false, 'error', 'invalid_id'); end if;
  if char_length(v_body) < 1 or char_length(v_body) > 280 then
    return jsonb_build_object('ok', false, 'error', 'invalid_body');
  end if;

  if (select count(*) from public.messages
       where participant_id = v_uid and created_at > now() - interval '1 minute') >= 3
     or (select count(*) from public.messages where participant_id = v_uid) >= 30 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  insert into public.messages (id, participant_id, author_name, body)
  values (p_id, v_uid, v_name, v_body)
  on conflict (id) do nothing;
  return jsonb_build_object('ok', true, 'duplicate', false, 'status', 'pending');
end $$;

-- Registra uma foto que JÁ foi enviada ao armazenamento em <uid>/<id>.jpg.
create function public.submit_photo(p_id uuid, p_caption text, p_width int, p_height int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := auth.uid();
  v_caption text := public.clean_text(p_caption);
  v_name    text;
  v_path    text;
  v_event   public.event;
  v_old     public.photos;
begin
  select name into v_name from public.participants where id = v_uid;
  if v_name is null then return jsonb_build_object('ok', false, 'error', 'not_participant'); end if;

  select * into v_old from public.photos where id = p_id;
  if found then
    if v_old.participant_id = v_uid then
      return jsonb_build_object('ok', true, 'duplicate', true, 'status', v_old.status);
    end if;
    return jsonb_build_object('ok', false, 'error', 'invalid_id');
  end if;

  select * into v_event from public.event where id = 1;
  if v_event.is_closed then return jsonb_build_object('ok', false, 'error', 'event_closed'); end if;
  if not v_event.photos_open then return jsonb_build_object('ok', false, 'error', 'activity_closed'); end if;
  if p_id is null then return jsonb_build_object('ok', false, 'error', 'invalid_id'); end if;
  if char_length(v_caption) > 120 then return jsonb_build_object('ok', false, 'error', 'invalid_caption'); end if;
  if p_width is null or p_height is null or p_width < 1 or p_height < 1
     or p_width > 10000 or p_height > 10000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_size');
  end if;

  v_path := v_uid::text || '/' || p_id::text || '.jpg';
  if not exists (select 1 from storage.objects where bucket_id = 'hazel-photos' and name = v_path) then
    return jsonb_build_object('ok', false, 'error', 'file_missing');
  end if;

  if (select count(*) from public.photos
       where participant_id = v_uid and created_at > now() - interval '1 minute') >= 6
     or (select count(*) from public.photos where participant_id = v_uid) >= 40 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  insert into public.photos (id, participant_id, author_name, caption, storage_path, width, height)
  values (p_id, v_uid, v_name, v_caption, v_path, p_width, p_height)
  on conflict (id) do nothing;
  return jsonb_build_object('ok', true, 'duplicate', false, 'status', 'pending');
end $$;

create function public.save_guess(p_birth_date date, p_weight_g int, p_height_cm numeric, p_looks_like text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text;
  v_event public.event;
begin
  select name into v_name from public.participants where id = v_uid;
  if v_name is null then return jsonb_build_object('ok', false, 'error', 'not_participant'); end if;

  select * into v_event from public.event where id = 1;
  if v_event.is_closed then return jsonb_build_object('ok', false, 'error', 'event_closed'); end if;
  if not v_event.guesses_open then return jsonb_build_object('ok', false, 'error', 'activity_closed'); end if;

  if p_birth_date is null or p_birth_date < current_date - 7 or p_birth_date > current_date + 366 then
    return jsonb_build_object('ok', false, 'error', 'invalid_date');
  end if;
  if p_weight_g is null or p_weight_g < 1500 or p_weight_g > 6000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_weight');
  end if;
  if p_height_cm is null or p_height_cm < 35 or p_height_cm > 65 then
    return jsonb_build_object('ok', false, 'error', 'invalid_height');
  end if;
  if p_looks_like is null or p_looks_like not in ('mom', 'dad', 'mix') then
    return jsonb_build_object('ok', false, 'error', 'invalid_looks');
  end if;

  insert into public.guesses (participant_id, author_name, birth_date, weight_g, height_cm, looks_like)
  values (v_uid, v_name, p_birth_date, p_weight_g, round(p_height_cm, 1), p_looks_like)
  on conflict (participant_id) do update
    set author_name = excluded.author_name,
        birth_date  = excluded.birth_date,
        weight_g    = excluded.weight_g,
        height_cm   = excluded.height_cm,
        looks_like  = excluded.looks_like,
        updated_at  = now();
  return jsonb_build_object('ok', true);
end $$;

-- Voto: um por participante por rodada; prazo conferido pelo relógio do servidor.
create function public.cast_vote(p_round uuid, p_option int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_round public.quiz_rounds;
  v_event public.event;
  v_prev  int;
begin
  if not exists (select 1 from public.participants where id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_participant');
  end if;

  -- trava a rodada: voto e encerramento nunca se cruzam
  select * into v_round from public.quiz_rounds where id = p_round for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'round_not_found'); end if;

  select option_index into v_prev from public.quiz_votes
   where round_id = p_round and participant_id = v_uid;
  if found then
    return jsonb_build_object('ok', true, 'already', true, 'option', v_prev);
  end if;

  select * into v_event from public.event where id = 1;
  if v_event.is_closed then return jsonb_build_object('ok', false, 'error', 'event_closed'); end if;
  if not v_event.quiz_open then return jsonb_build_object('ok', false, 'error', 'activity_closed'); end if;
  if v_round.status <> 'open' or clock_timestamp() >= v_round.closes_at then
    return jsonb_build_object('ok', false, 'error', 'round_closed');
  end if;
  if p_option is null or p_option < 0 or p_option >= jsonb_array_length(v_round.options) then
    return jsonb_build_object('ok', false, 'error', 'invalid_option');
  end if;

  insert into public.quiz_votes (round_id, participant_id, option_index)
  values (p_round, v_uid, p_option);
  update public.quiz_rounds set total_votes = total_votes + 1 where id = p_round;
  return jsonb_build_object('ok', true, 'already', false, 'option', p_option);
end $$;

-- ---------------------------------------------------------------------
-- TV
-- ---------------------------------------------------------------------

create function public.tv_claim(p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'no_session'); end if;
  if exists (select 1 from public.tv_devices where user_id = v_uid) then
    return jsonb_build_object('ok', true);
  end if;
  if public.access_blocked(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
  end if;
  if coalesce(p_key, '') = '' or p_key is distinct from (select tv_key from public.event_private where id = 1) then
    perform public.access_fail(v_uid);
    return jsonb_build_object('ok', false, 'error', 'invalid_key');
  end if;
  insert into public.tv_devices (user_id) values (v_uid) on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;

-- A TV precisa do código do evento para montar o QR Code.
create function public.tv_bootstrap() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_tv() or public.is_admin()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  return jsonb_build_object('ok', true,
    'join_code', (select join_code from public.event_private where id = 1));
end $$;

-- Resumo dos palpites para a TV: só números agregados, sem nomes.
create function public.guess_summary() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb;
begin
  if not (public.is_tv() or public.is_admin()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  select jsonb_build_object(
    'ok', true,
    'total', count(*),
    'looks', jsonb_build_object(
      'mom', count(*) filter (where looks_like = 'mom'),
      'dad', count(*) filter (where looks_like = 'dad'),
      'mix', count(*) filter (where looks_like = 'mix')),
    'weight', case when count(*) = 0 then null else jsonb_build_object(
      'avg', round(avg(weight_g)), 'min', min(weight_g), 'max', max(weight_g)) end,
    'height', case when count(*) = 0 then null else jsonb_build_object(
      'avg', round(avg(height_cm), 1), 'min', min(height_cm), 'max', max(height_cm)) end
  ) into v from public.guesses;

  return v || jsonb_build_object('dates', coalesce((
    select jsonb_agg(jsonb_build_object('date', d.birth_date, 'count', d.n) order by d.n desc, d.birth_date)
      from (select birth_date, count(*) as n from public.guesses
             group by birth_date order by count(*) desc, birth_date limit 8) d
  ), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------
-- Pais (painel)
-- ---------------------------------------------------------------------

create function public.admin_moderate(p_kind text, p_id uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_msg   public.messages;
  v_photo public.photos;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if p_status not in ('approved', 'rejected', 'removed') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;

  if p_kind = 'message' then
    -- trava a linha: dois aparelhos aprovando ao mesmo tempo não se atropelam
    select * into v_msg from public.messages where id = p_id for update;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    if v_msg.status = p_status then return jsonb_build_object('ok', true, 'changed', false); end if;

    update public.messages
       set status = p_status,
           moderated_at = now(),
           approved_at = case when p_status = 'approved' then now() else approved_at end
     where id = p_id;

    if p_status = 'approved' then
      insert into public.garden_flowers (participant_id, name)
      values (v_msg.participant_id, v_msg.author_name)
      on conflict (participant_id) do update set name = excluded.name;
    elsif not exists (select 1 from public.messages
                       where participant_id = v_msg.participant_id and status = 'approved') then
      delete from public.garden_flowers where participant_id = v_msg.participant_id;
    end if;

  elsif p_kind = 'photo' then
    select * into v_photo from public.photos where id = p_id for update;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    if v_photo.status = p_status then return jsonb_build_object('ok', true, 'changed', false); end if;

    update public.photos
       set status = p_status,
           moderated_at = now(),
           approved_at = case when p_status = 'approved' then now() else approved_at end
     where id = p_id;
  else
    return jsonb_build_object('ok', false, 'error', 'invalid_kind');
  end if;

  perform public.bump_content();
  return jsonb_build_object('ok', true, 'changed', true);
end $$;

create function public.admin_open_round(p_question uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_event public.event;
  v_q     public.quiz_questions;
  v_cur   public.quiz_rounds;
  v_id    uuid;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  select * into v_event from public.event where id = 1 for update;
  if v_event.is_closed then return jsonb_build_object('ok', false, 'error', 'event_closed'); end if;

  if v_event.current_round_id is not null then
    select * into v_cur from public.quiz_rounds where id = v_event.current_round_id;
    if found and v_cur.status = 'open' and clock_timestamp() < v_cur.closes_at then
      return jsonb_build_object('ok', false, 'error', 'round_in_progress');
    end if;
    -- rodada anterior cujo tempo acabou sem ninguém encerrar
    update public.quiz_rounds set status = 'closed'
     where id = v_event.current_round_id and status = 'open';
  end if;

  select * into v_q from public.quiz_questions where id = p_question;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  insert into public.quiz_rounds (question_id, kind, prompt, options, closes_at)
  values (v_q.id, v_q.kind, v_q.prompt, v_q.options,
          clock_timestamp() + make_interval(secs => v_q.duration_seconds))
  returning id into v_id;
  insert into public.quiz_round_keys (round_id, correct_index) values (v_id, v_q.correct_index);

  update public.event set current_round_id = v_id where id = 1;
  return jsonb_build_object('ok', true, 'round_id', v_id);
end $$;

create function public.admin_close_round(p_round uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_round public.quiz_rounds;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select * into v_round from public.quiz_rounds where id = p_round for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_round.status = 'open' then
    update public.quiz_rounds
       set status = 'closed', closes_at = least(closes_at, clock_timestamp())
     where id = p_round;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Revela: só aqui o resultado e a resposta correta passam a existir na
-- tabela pública de rodadas.
create function public.admin_reveal_round(p_round uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_round   public.quiz_rounds;
  v_results jsonb;
  v_total   int;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select * into v_round from public.quiz_rounds where id = p_round for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_round.status = 'revealed' then return jsonb_build_object('ok', true); end if;
  if v_round.status = 'open' and clock_timestamp() < v_round.closes_at then
    return jsonb_build_object('ok', false, 'error', 'still_open');
  end if;

  select jsonb_agg(coalesce(c.n, 0) order by i.idx), coalesce(sum(c.n), 0)::int
    into v_results, v_total
    from generate_series(0, jsonb_array_length(v_round.options) - 1) as i(idx)
    left join (select option_index, count(*)::int as n from public.quiz_votes
                where round_id = p_round group by option_index) c
           on c.option_index = i.idx;

  update public.quiz_rounds
     set status = 'revealed',
         results = v_results,
         total_votes = v_total,
         correct_index = (select correct_index from public.quiz_round_keys where round_id = p_round),
         revealed_at = now()
   where id = p_round;
  return jsonb_build_object('ok', true);
end $$;

create function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  return jsonb_build_object(
    'ok', true,
    'participants', (select count(*) from public.participants),
    'flowers', (select count(*) from public.garden_flowers),
    'guesses', (select count(*) from public.guesses),
    'messages_pending', (select count(*) from public.messages where status = 'pending'),
    'messages_approved', (select count(*) from public.messages where status = 'approved'),
    'messages_total', (select count(*) from public.messages),
    'photos_pending', (select count(*) from public.photos where status = 'pending'),
    'photos_approved', (select count(*) from public.photos where status = 'approved'),
    'photos_total', (select count(*) from public.photos)
  );
end $$;

-- Troca a chave da TV e desconecta todas as TVs pareadas.
create function public.admin_rotate_tv_key() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_key text := replace(gen_random_uuid()::text, '-', '');
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  update public.event_private set tv_key = v_key where id = 1;
  delete from public.tv_devices where true;
  return jsonb_build_object('ok', true, 'tv_key', v_key);
end $$;

-- ---------------------------------------------------------------------
-- Permissões de tabela e RLS
-- ---------------------------------------------------------------------

alter table public.admins          enable row level security;
alter table public.participants    enable row level security;
alter table public.tv_devices      enable row level security;
alter table public.access_attempts enable row level security;
alter table public.messages        enable row level security;
alter table public.photos          enable row level security;
alter table public.garden_flowers  enable row level security;
alter table public.guesses         enable row level security;
alter table public.quiz_questions  enable row level security;
alter table public.quiz_rounds     enable row level security;
alter table public.quiz_round_keys enable row level security;
alter table public.quiz_votes      enable row level security;
alter table public.event           enable row level security;
alter table public.event_private   enable row level security;

revoke all on
  public.admins, public.participants, public.tv_devices, public.access_attempts,
  public.messages, public.photos, public.garden_flowers, public.guesses,
  public.quiz_questions, public.quiz_rounds, public.quiz_round_keys, public.quiz_votes,
  public.event, public.event_private
from anon, authenticated, public;

grant select on
  public.participants, public.messages, public.photos, public.garden_flowers,
  public.guesses, public.quiz_questions, public.quiz_rounds, public.quiz_round_keys,
  public.quiz_votes, public.event, public.event_private
to authenticated;
grant update on public.event, public.event_private to authenticated;
grant insert, update, delete on public.quiz_questions to authenticated;

-- Estado do evento: qualquer sessão lê; só os pais alteram.
create policy event_read on public.event for select to authenticated using (true);
create policy event_admin_update on public.event for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy event_private_admin_read on public.event_private for select to authenticated
  using (public.is_admin());
create policy event_private_admin_update on public.event_private for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy participants_read on public.participants for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

-- Recados: o autor vê os seus; os pais veem todos; a TV só os aprovados.
create policy messages_read on public.messages for select to authenticated
  using (
    participant_id = (select auth.uid())
    or public.is_admin()
    or (status = 'approved' and (public.is_tv() or public.gallery_open()))
  );

create policy photos_read on public.photos for select to authenticated
  using (
    participant_id = (select auth.uid())
    or public.is_admin()
    or (status = 'approved' and (public.is_tv() or public.gallery_open()))
  );

create policy flowers_read on public.garden_flowers for select to authenticated
  using (public.is_admin() or public.is_tv() or public.gallery_open());

create policy guesses_read on public.guesses for select to authenticated
  using (participant_id = (select auth.uid()) or public.is_admin());

create policy questions_admin_all on public.quiz_questions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy rounds_read on public.quiz_rounds for select to authenticated
  using (public.is_participant() or public.is_tv() or public.is_admin());

create policy round_keys_admin_read on public.quiz_round_keys for select to authenticated
  using (public.is_admin());

-- Votos: cada um vê só o próprio (a TV recebe apenas totais).
create policy votes_read on public.quiz_votes for select to authenticated
  using (participant_id = (select auth.uid()) or public.is_admin());

-- ---------------------------------------------------------------------
-- Permissões de função
-- ---------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon;
revoke execute on function
  public.bump_content(), public.access_fail(uuid), public.access_blocked(uuid),
  public.touch_updated_at()
from authenticated;

grant execute on function
  public.is_admin(), public.is_tv(), public.is_participant(), public.gallery_open(),
  public.clean_text(text), public.server_time(), public.whoami(),
  public.join_event(text, text), public.rename_me(text),
  public.submit_message(uuid, text), public.submit_photo(uuid, text, int, int),
  public.save_guess(date, int, numeric, text), public.cast_vote(uuid, int),
  public.tv_claim(text), public.tv_bootstrap(), public.guess_summary(),
  public.admin_moderate(text, uuid, text), public.admin_open_round(uuid),
  public.admin_close_round(uuid), public.admin_reveal_round(uuid),
  public.admin_stats(), public.admin_rotate_tv_key()
to authenticated;

-- ---------------------------------------------------------------------
-- Armazenamento das fotos (bucket privado)
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hazel-photos', 'hazel-photos', false, 4194304, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = 4194304, allowed_mime_types = array['image/jpeg'];

create function public.can_upload_photo(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_event public.event;
begin
  if v_uid is null then return false; end if;
  if not exists (select 1 from public.participants where id = v_uid) then return false; end if;
  -- só na própria pasta, com nome <uuid>.jpg
  if p_name !~ ('^' || v_uid::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$') then
    return false;
  end if;
  select * into v_event from public.event where id = 1;
  if v_event.is_closed or not v_event.photos_open then return false; end if;
  -- teto de arquivos por participante
  if (select count(*) from storage.objects
       where bucket_id = 'hazel-photos' and name like v_uid::text || '/%') >= 45 then
    return false;
  end if;
  return true;
end $$;

create function public.can_view_photo(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin()
      or p_name like (select auth.uid())::text || '/%'
      or exists (select 1 from public.photos p
                  where p.storage_path = p_name and p.status = 'approved'
                    and (public.is_tv() or public.gallery_open()));
$$;

revoke execute on function public.can_upload_photo(text), public.can_view_photo(text) from public, anon;
grant execute on function public.can_upload_photo(text), public.can_view_photo(text) to authenticated;

create policy hazel_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'hazel-photos' and public.can_upload_photo(name));

create policy hazel_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'hazel-photos' and public.can_view_photo(name));

create policy hazel_photos_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'hazel-photos' and public.is_admin());

-- ---------------------------------------------------------------------
-- Tempo real
-- ---------------------------------------------------------------------
-- As assinaturas respeitam as políticas acima: convidados recebem só o
-- estado do evento e as rodadas; os pais recebem também recados e fotos.

alter publication supabase_realtime add table
  public.event, public.quiz_rounds, public.messages, public.photos;
