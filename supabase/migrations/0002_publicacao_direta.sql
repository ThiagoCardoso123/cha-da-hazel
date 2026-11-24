-- =====================================================================
-- Chá da Hazel — publicação direta (sem aprovação prévia)
-- Rode depois de 0001. Recados e fotos passam a ir direto para a TV;
-- os pais continuam podendo retirar qualquer item pelo painel.
-- A aprovação prévia pode ser religada em Painel > Evento.
-- =====================================================================

alter table public.event add column auto_approve boolean not null default true;

create or replace function public.submit_message(p_id uuid, p_body text) returns jsonb
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

  if v_event.auto_approve then
    -- sem moderação prévia: vai direto para a TV e já planta o girassol
    insert into public.messages (id, participant_id, author_name, body, status, moderated_at, approved_at)
    values (p_id, v_uid, v_name, v_body, 'approved', now(), now())
    on conflict (id) do nothing;
    if found then
      insert into public.garden_flowers (participant_id, name) values (v_uid, v_name)
      on conflict (participant_id) do update set name = excluded.name;
      perform public.bump_content();
    end if;
    return jsonb_build_object('ok', true, 'duplicate', false, 'status', 'approved');
  end if;

  insert into public.messages (id, participant_id, author_name, body)
  values (p_id, v_uid, v_name, v_body)
  on conflict (id) do nothing;
  return jsonb_build_object('ok', true, 'duplicate', false, 'status', 'pending');
end $$;

create or replace function public.submit_photo(p_id uuid, p_caption text, p_width int, p_height int) returns jsonb
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

  if v_event.auto_approve then
    insert into public.photos (id, participant_id, author_name, caption, storage_path, width, height,
                               status, moderated_at, approved_at)
    values (p_id, v_uid, v_name, v_caption, v_path, p_width, p_height, 'approved', now(), now())
    on conflict (id) do nothing;
    if found then perform public.bump_content(); end if;
    return jsonb_build_object('ok', true, 'duplicate', false, 'status', 'approved');
  end if;

  insert into public.photos (id, participant_id, author_name, caption, storage_path, width, height)
  values (p_id, v_uid, v_name, v_caption, v_path, p_width, p_height)
  on conflict (id) do nothing;
  return jsonb_build_object('ok', true, 'duplicate', false, 'status', 'pending');
end $$;
