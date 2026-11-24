/**
 * Única porta de entrada para o Supabase. As telas só falam com este arquivo.
 * Toda escrita de convidado passa por funções do banco (RPC), que validam
 * os dados no servidor; o que aparece aqui é só o transporte.
 */
import { PHOTO_BUCKET, SUPABASE_KEY, SUPABASE_URL, configured, initClient, sb } from './supabase';
import type {
  AdminStats, Area, EventPrivate, EventState, Flower, Guess, GuessSummary, LooksLike,
  Message, ModStatus, Participant, Photo, Question, Round, WhoAmI,
} from './types';

export { configured };

export class ApiError extends Error {
  code: string;
  constructor(code: string, detail?: string) {
    super(detail ?? code);
    this.code = code;
  }
}

export function errorCode(e: unknown): string {
  return e instanceof ApiError ? e.code : 'server';
}

function looksOffline(message: string | undefined): boolean {
  return !navigator.onLine || /failed to fetch|networkerror|load failed|network request failed|fetch/i.test(message ?? '');
}

interface PgResult {
  data: unknown;
  error: { message: string } | null;
}

/** Converte a resposta do Supabase em valor ou ApiError. */
async function run<T>(query: PromiseLike<PgResult>): Promise<T> {
  let res: PgResult;
  try {
    res = await query;
  } catch (e) {
    throw new ApiError('network', String(e));
  }
  if (res.error) {
    throw new ApiError(looksOffline(res.error.message) ? 'network' : 'server', res.error.message);
  }
  return res.data as T;
}

/** As funções do banco devolvem { ok: false, error } para recusas esperadas. */
async function rpc<T = Record<string, unknown>>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const data = await run<unknown>(sb().rpc(fn, args ?? {}));
  if (data && typeof data === 'object' && (data as { ok?: boolean }).ok === false) {
    throw new ApiError(String((data as { error?: string }).error ?? 'server'));
  }
  return data as T;
}

// ------------------------------------------------------------------ sessão

export function initApi(area: Area): void {
  initClient(area);
}

/** Convidados e TV usam sessão anônima: um identificador por aparelho, sem cadastro. */
let anonInFlight: Promise<void> | null = null;

export function ensureAnonSession(): Promise<void> {
  // uma única tentativa por vez: evita criar duas sessões se a tela montar duas vezes
  if (!anonInFlight) {
    anonInFlight = createAnonSession().finally(() => {
      anonInFlight = null;
    });
  }
  return anonInFlight;
}

async function createAnonSession(): Promise<void> {
  let has = false;
  try {
    const { data } = await sb().auth.getSession();
    has = Boolean(data.session);
  } catch {
    /* segue para tentar criar */
  }
  if (has) return;
  let res;
  try {
    res = await sb().auth.signInAnonymously();
  } catch (e) {
    throw new ApiError('network', String(e));
  }
  if (res.error) {
    const message = res.error.message ?? '';
    const status = (res.error as { status?: number }).status;
    // O Supabase limita logins anônimos por endereço IP (todo o Wi-Fi da festa conta como um só).
    if (status === 429 || /rate limit/i.test(message)) throw new ApiError('signin_busy', message);
    throw new ApiError(looksOffline(message) ? 'network' : 'anon_disabled', message);
  }
}

export async function hasSession(): Promise<boolean> {
  const { data } = await sb().auth.getSession();
  return Boolean(data.session);
}

export async function signIn(email: string, password: string): Promise<void> {
  let res;
  try {
    res = await sb().auth.signInWithPassword({ email, password });
  } catch (e) {
    throw new ApiError('network', String(e));
  }
  if (res.error) {
    throw new ApiError(looksOffline(res.error.message) ? 'network' : 'bad_login', res.error.message);
  }
}

export async function signOut(): Promise<void> {
  await sb().auth.signOut();
}

export function whoami(): Promise<WhoAmI> {
  return rpc<WhoAmI>('whoami');
}

export async function serverTime(): Promise<number> {
  const iso = await rpc<string>('server_time');
  return new Date(iso).getTime();
}

// ------------------------------------------------------------------ estado ao vivo

const EVENT_COLS =
  'tv_mode,messages_open,photos_open,guesses_open,quiz_open,is_closed,auto_approve,guest_gallery_enabled,message_seconds,photo_seconds,current_round_id,content_version';

export function fetchEvent(): Promise<EventState> {
  return run<EventState>(sb().from('event').select(EVENT_COLS).eq('id', 1).single());
}

export function fetchRound(id: string): Promise<Round | null> {
  return run<Round | null>(sb().from('quiz_rounds').select('*').eq('id', id).maybeSingle());
}

export interface LiveHandlers {
  onEvent: (e: EventState) => void;
  onRound: (r: Round) => void;
  /** true quando o canal de tempo real está conectado */
  onStatus: (connected: boolean) => void;
  /** só para os pais: algo mudou nas filas de recados/fotos */
  onQueue?: () => void;
}

/** Assina as mudanças em tempo real. Devolve a função que cancela. */
export function subscribeLive(h: LiveHandlers): () => void {
  let channel = sb()
    .channel(`hazel-live-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'event' }, (p: { new: unknown }) => {
      if (p.new && typeof p.new === 'object' && 'tv_mode' in p.new) h.onEvent(p.new as EventState);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'quiz_rounds' }, (p: { new: unknown }) => {
      if (p.new && typeof p.new === 'object' && 'closes_at' in p.new) h.onRound(p.new as Round);
    });
  if (h.onQueue) {
    const notify = h.onQueue;
    channel = channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => notify())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photos' }, () => notify());
  }
  channel.subscribe((status: string) => h.onStatus(status === 'SUBSCRIBED'));
  return () => {
    void sb().removeChannel(channel);
  };
}

// ------------------------------------------------------------------ convidados

export async function joinEvent(code: string, name: string): Promise<Participant> {
  const r = await rpc<{ participant: Participant }>('join_event', { p_code: code, p_name: name });
  return r.participant;
}

export async function renameMe(name: string): Promise<Participant> {
  const r = await rpc<{ participant: Participant }>('rename_me', { p_name: name });
  return r.participant;
}

export async function submitMessage(id: string, body: string): Promise<void> {
  await rpc('submit_message', { p_id: id, p_body: body });
}

async function myId(): Promise<string> {
  const { data } = await sb().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new ApiError('no_session');
  return id;
}

export async function myMessages(): Promise<Message[]> {
  const uid = await myId();
  return run<Message[]>(
    sb().from('messages').select('*').eq('participant_id', uid).order('created_at', { ascending: false }),
  );
}

export async function myPhotos(): Promise<Photo[]> {
  const uid = await myId();
  return run<Photo[]>(
    sb().from('photos').select('*').eq('participant_id', uid).order('created_at', { ascending: false }),
  );
}

/**
 * Envia o arquivo já comprimido para <uid>/<id>.jpg com barra de progresso.
 * Repetir o envio do mesmo id é seguro: se o arquivo já chegou, conta como sucesso.
 */
export async function uploadPhoto(id: string, blob: Blob, onProgress: (fraction: number) => void): Promise<void> {
  const { data } = await sb().auth.getSession();
  const session = data.session;
  if (!session) throw new ApiError('no_session');
  const path = `${session.user.id}/${id}.jpg`;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/${PHOTO_BUCKET}/${path}`);
    xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
    xhr.setRequestHeader('apikey', SUPABASE_KEY);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('Content-Type', 'image/jpeg');
    xhr.timeout = 120000;
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onProgress(ev.loaded / ev.total);
    };
    xhr.onload = () => {
      const text = xhr.responseText || '';
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      if (xhr.status === 409 || /duplicate|already exists|"409"/i.test(text)) return resolve();
      if (xhr.status === 413 || /too large|exceeded/i.test(text)) return reject(new ApiError('file_too_large', text));
      if (xhr.status === 415 || /mime/i.test(text)) return reject(new ApiError('invalid_file', text));
      if (xhr.status === 401 || xhr.status === 403 || /row-level security|unauthorized/i.test(text)) {
        return reject(new ApiError('upload_refused', text));
      }
      reject(new ApiError('server', text));
    };
    xhr.onerror = () => reject(new ApiError('network'));
    xhr.ontimeout = () => reject(new ApiError('network'));
    xhr.send(blob);
  });
}

export async function submitPhoto(id: string, caption: string, width: number, height: number): Promise<void> {
  await rpc('submit_photo', { p_id: id, p_caption: caption, p_width: width, p_height: height });
}

export async function myGuess(): Promise<Guess | null> {
  const uid = await myId();
  return run<Guess | null>(sb().from('guesses').select('*').eq('participant_id', uid).maybeSingle());
}

export async function saveGuess(g: {
  birth_date: string; weight_g: number; height_cm: number; looks_like: LooksLike;
}): Promise<void> {
  await rpc('save_guess', {
    p_birth_date: g.birth_date, p_weight_g: g.weight_g, p_height_cm: g.height_cm, p_looks_like: g.looks_like,
  });
}

export async function myVote(roundId: string): Promise<number | null> {
  const uid = await myId();
  const row = await run<{ option_index: number } | null>(
    sb().from('quiz_votes').select('option_index').eq('round_id', roundId).eq('participant_id', uid).maybeSingle(),
  );
  return row ? row.option_index : null;
}

/** Devolve a opção que ficou registrada (a primeira, se já havia voto). */
export async function castVote(roundId: string, option: number): Promise<number> {
  const r = await rpc<{ option: number }>('cast_vote', { p_round: roundId, p_option: option });
  return r.option;
}

// ------------------------------------------------------------------ conteúdo aprovado (TV e lembranças)

export function approvedMessages(): Promise<Message[]> {
  return run<Message[]>(
    sb().from('messages').select('*').eq('status', 'approved').order('approved_at', { ascending: true }),
  );
}

export function approvedPhotos(): Promise<Photo[]> {
  return run<Photo[]>(
    sb().from('photos').select('*').eq('status', 'approved').order('approved_at', { ascending: true }),
  );
}

export function fetchFlowers(): Promise<Flower[]> {
  return run<Flower[]>(sb().from('garden_flowers').select('participant_id,name,seq').order('seq', { ascending: true }));
}

/** Endereços temporários (1 h) para fotos de um bucket privado. */
export async function photoUrls(paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (paths.length === 0) return out;
  let res;
  try {
    res = await sb().storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600);
  } catch (e) {
    throw new ApiError('network', String(e));
  }
  if (res.error) throw new ApiError(looksOffline(res.error.message) ? 'network' : 'server', res.error.message);
  for (const item of res.data ?? []) {
    if (item.path && item.signedUrl) out[item.path] = item.signedUrl;
  }
  return out;
}

// ------------------------------------------------------------------ TV

export async function tvClaim(key: string): Promise<void> {
  await rpc('tv_claim', { p_key: key });
}

export async function tvJoinCode(): Promise<string> {
  const r = await rpc<{ join_code: string }>('tv_bootstrap');
  return r.join_code;
}

export function guessSummary(): Promise<GuessSummary> {
  return rpc<GuessSummary>('guess_summary');
}

// ------------------------------------------------------------------ pais

export function adminStats(): Promise<AdminStats> {
  return rpc<AdminStats>('admin_stats');
}

export function listMessages(status: ModStatus | 'all'): Promise<Message[]> {
  let q = sb().from('messages').select('*');
  if (status !== 'all') q = q.eq('status', status);
  return run<Message[]>(q.order('created_at', { ascending: true }));
}

export function listPhotos(status: ModStatus | 'all'): Promise<Photo[]> {
  let q = sb().from('photos').select('*');
  if (status !== 'all') q = q.eq('status', status);
  return run<Photo[]>(q.order('created_at', { ascending: true }));
}

export async function moderate(kind: 'message' | 'photo', id: string, status: ModStatus): Promise<void> {
  await rpc('admin_moderate', { p_kind: kind, p_id: id, p_status: status });
}

export async function updateEvent(patch: Partial<EventState>): Promise<EventState> {
  return run<EventState>(sb().from('event').update(patch).eq('id', 1).select(EVENT_COLS).single());
}

export function getPrivate(): Promise<EventPrivate> {
  return run<EventPrivate>(sb().from('event_private').select('join_code,tv_key').eq('id', 1).single());
}

export async function setJoinCode(code: string): Promise<void> {
  await run(sb().from('event_private').update({ join_code: code }).eq('id', 1).select('id').single());
}

export async function rotateTvKey(): Promise<string> {
  const r = await rpc<{ tv_key: string }>('admin_rotate_tv_key');
  return r.tv_key;
}

export function listQuestions(): Promise<Question[]> {
  return run<Question[]>(
    sb().from('quiz_questions').select('*').order('position', { ascending: true }).order('created_at', { ascending: true }),
  );
}

export async function saveQuestion(q: Omit<Question, 'id'> & { id?: string }): Promise<void> {
  const row = {
    kind: q.kind,
    prompt: q.prompt,
    options: q.options,
    correct_index: q.kind === 'quiz' ? q.correct_index : null,
    duration_seconds: q.duration_seconds,
    position: q.position,
  };
  if (q.id) {
    await run(sb().from('quiz_questions').update(row).eq('id', q.id).select('id').single());
  } else {
    await run(sb().from('quiz_questions').insert(row).select('id').single());
  }
}

export async function deleteQuestion(id: string): Promise<void> {
  await run(sb().from('quiz_questions').delete().eq('id', id).select('id'));
}

export async function openRound(questionId: string): Promise<void> {
  await rpc('admin_open_round', { p_question: questionId });
}

export async function closeRound(roundId: string): Promise<void> {
  await rpc('admin_close_round', { p_round: roundId });
}

export async function revealRound(roundId: string): Promise<void> {
  await rpc('admin_reveal_round', { p_round: roundId });
}

export function allGuesses(): Promise<Guess[]> {
  return run<Guess[]>(sb().from('guesses').select('*').order('updated_at', { ascending: true }));
}

/** Baixa o arquivo de uma foto (para o pacote .zip dos pais). */
export async function downloadPhoto(path: string): Promise<Blob> {
  let res;
  try {
    res = await sb().storage.from(PHOTO_BUCKET).download(path);
  } catch (e) {
    throw new ApiError('network', String(e));
  }
  if (res.error || !res.data) throw new ApiError('server', res.error?.message);
  return res.data;
}
