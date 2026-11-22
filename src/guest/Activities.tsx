import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  castVote, errorCode, myGuess, myMessages, myPhotos, myVote, saveGuess, submitMessage, submitPhoto, uploadPhoto,
} from '../lib/api';
import type { LooksLike, Message, Photo, Round } from '../lib/types';
import { useCountdown, type Live } from '../lib/useLive';
import {
  STATUS_LABEL, draft, errorText, formatCm, formatDay, formatKg, percent, preparePhoto, todayIso, uuid,
  type PreparedPhoto,
} from '../lib/util';
import { Button, Empty, Notice } from '../ui';

const fieldClass = 'w-full rounded-2xl border-2 border-butter-deep bg-paper px-4 py-3 text-lg placeholder:text-bark-soft/60';

function closedReason(live: Live, open: boolean | undefined): string | null {
  if (live.event?.is_closed) return 'O chá foi encerrado e não recebe novos envios.';
  if (open === false) return 'Esta atividade está fechada agora. Os pais podem reabrir a qualquer momento.';
  return null;
}

function StatusChip({ status }: { status: Message['status'] }) {
  const tone = status === 'approved' ? 'bg-leaf-soft text-leaf-deep' : status === 'pending' ? 'bg-butter text-bark' : 'bg-blush-soft text-blush';
  return <span className={`inline-block rounded-full px-3 py-1 text-sm font-bold ${tone}`}>{STATUS_LABEL[status]}</span>;
}

// ------------------------------------------------------------------ A. Recado

const MAX_MESSAGE = 280;

export function MessageView({ live }: { live: Live }) {
  // O rascunho guarda também o id do envio: tentar de novo reusa o mesmo id e não duplica.
  const [item, setItem] = useState(() => draft.get('message', { id: uuid(), body: '' }));
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);
  const [mine, setMine] = useState<Message[]>([]);
  const version = live.event?.content_version;

  const loadMine = useCallback(() => {
    myMessages().then(setMine).catch(() => undefined);
  }, []);
  useEffect(loadMine, [loadMine, version]);

  const setBody = (body: string) => {
    const next = { ...item, body };
    setItem(next);
    draft.set('message', next);
    setJustSent(false);
  };

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    if (inFlight.current || !item.body.trim()) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await submitMessage(item.id, item.body);
      // só aqui, com a confirmação do servidor, o rascunho é descartado
      draft.clear('message');
      setItem({ id: uuid(), body: '' });
      setJustSent(true);
      loadMine();
    } catch (err) {
      setError(errorCode(err));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const blocked = closedReason(live, live.event?.messages_open);
  const left = MAX_MESSAGE - item.body.length;

  return (
    <div className="grid gap-5">
      {blocked ? (
        <Notice tone="info">{blocked}</Notice>
      ) : (
        <form onSubmit={send} className="grid gap-3">
          <label htmlFor="recado" className="text-bark-soft">
            Deixe um carinho, um conselho ou um desejo. Ela vai ler quando crescer.
          </label>
          <textarea
            id="recado" value={item.body} onChange={(e) => setBody(e.target.value)} maxLength={MAX_MESSAGE} rows={6}
            placeholder="Querida Hazel…" aria-describedby="recado-contador" className={`${fieldClass} resize-none`}
          />
          <div className="flex items-center justify-between text-sm text-bark-soft">
            <span id="recado-contador" aria-live="polite" className={left <= 20 ? 'font-bold text-blush' : ''}>
              {left} {left === 1 ? 'caractere restante' : 'caracteres restantes'}
            </span>
          </div>
          {error && <Notice onRetry={() => void send()}>{errorText(error)}</Notice>}
          {busy && <p role="status" className="m-0 text-bark-soft">Enviando seu recado…</p>}
          <Button type="submit" busy={busy} disabled={!item.body.trim()}>Enviar recado</Button>
        </form>
      )}

      {justSent && (
        <Notice tone="ok">
          Recado enviado. Ele aguarda a aprovação dos pais e, depois disso, aparece na TV com o seu girassol.
        </Notice>
      )}

      {mine.length > 0 && (
        <section aria-label="Seus recados" className="grid gap-3">
          <h2 className="m-0 text-lg font-bold">Seus recados</h2>
          {mine.map((m) => (
            <div key={m.id} className="rounded-2xl bg-paper p-4 shadow-sm">
              <p className="m-0 whitespace-pre-wrap break-words">{m.body}</p>
              <div className="mt-2"><StatusChip status={m.status} /></div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ B. Álbum

type Stage = 'idle' | 'preparing' | 'ready' | 'uploading' | 'saving' | 'done' | 'error';

export function AlbumView({ live }: { live: Live }) {
  const [stage, setStage] = useState<Stage>('idle');
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [photoId, setPhotoId] = useState(uuid);
  const [caption, setCaption] = useState(() => draft.get('caption', ''));
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<Photo[]>([]);
  const inFlight = useRef(false);
  const uploaded = useRef(false);
  const version = live.event?.content_version;

  const loadMine = useCallback(() => {
    myPhotos().then(setMine).catch(() => undefined);
  }, []);
  useEffect(loadMine, [loadMine, version]);

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.previewUrl);
  }, [photo]);

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setStage('preparing');
    try {
      const prepared = await preparePhoto(file);
      setPhoto(prepared);
      setPhotoId(uuid());
      uploaded.current = false;
      setStage('ready');
    } catch (err) {
      setPhoto(null);
      setError(err instanceof Error && err.message in { invalid_file: 1, file_too_large: 1 } ? err.message : 'invalid_file');
      setStage('idle');
    }
  };

  const send = async () => {
    if (inFlight.current || !photo) return;
    inFlight.current = true;
    setError(null);
    try {
      if (!uploaded.current) {
        setStage('uploading');
        setProgress(0);
        await uploadPhoto(photoId, photo.blob, setProgress);
        uploaded.current = true;
      }
      setStage('saving');
      await submitPhoto(photoId, caption, photo.width, photo.height);
      draft.clear('caption');
      setCaption('');
      setPhoto(null);
      setStage('done');
      loadMine();
    } catch (err) {
      setError(errorCode(err));
      setStage('error');
    } finally {
      inFlight.current = false;
    }
  };

  const reset = () => {
    setPhoto(null);
    setError(null);
    setStage('idle');
  };

  const blocked = closedReason(live, live.event?.photos_open);
  const sending = stage === 'uploading' || stage === 'saving';
  const pct = Math.round(progress * 100);

  return (
    <div className="grid gap-5">
      {blocked && <Notice tone="info">{blocked}</Notice>}

      {!blocked && !photo && (
        <div className="grid gap-3">
          <p className="m-0 text-bark-soft">
            As fotos são reduzidas antes do envio para gastar pouca internet. Elas aparecem na TV depois que os pais aprovarem.
          </p>
          {stage === 'done' && (
            <Notice tone="ok">Foto enviada. Ela aguarda a aprovação dos pais. Quer mandar mais uma?</Notice>
          )}
          {error && <Notice>{errorText(error)}</Notice>}
          {stage === 'preparing' ? (
            <p role="status" className="m-0 py-6 text-center text-bark-soft">Preparando a foto…</p>
          ) : (
            <>
              <label className="flex min-h-14 cursor-pointer items-center justify-center rounded-2xl bg-petal px-5 py-3 text-lg font-bold text-bark shadow-[0_3px_0_var(--color-petal-deep)] focus-within:outline focus-within:outline-3 focus-within:outline-leaf-deep">
                Tirar uma foto
                <input type="file" accept="image/*" capture="environment" onChange={pick} className="sr-only" />
              </label>
              <label className="flex min-h-14 cursor-pointer items-center justify-center rounded-2xl border border-butter-deep bg-butter px-5 py-3 text-lg font-bold text-bark focus-within:outline focus-within:outline-3 focus-within:outline-leaf-deep">
                Escolher da galeria
                <input type="file" accept="image/*" onChange={pick} className="sr-only" />
              </label>
            </>
          )}
        </div>
      )}

      {!blocked && photo && (
        <div className="grid gap-3">
          <div className="rounded-3xl bg-paper p-3 shadow-sm">
            <img src={photo.previewUrl} alt="Prévia da foto escolhida" className="max-h-[50vh] w-full rounded-2xl object-contain" />
          </div>
          <label htmlFor="legenda" className="font-bold">Legenda <span className="font-normal text-bark-soft">(opcional)</span></label>
          <input
            id="legenda" value={caption} maxLength={120} disabled={sending}
            onChange={(e) => { setCaption(e.target.value); draft.set('caption', e.target.value); }}
            placeholder="Ex.: a mesa de doces" className={fieldClass}
          />

          {sending && (
            <div role="status" aria-live="polite">
              <div className="h-3 overflow-hidden rounded-full bg-butter" aria-hidden="true">
                <div className="h-full rounded-full bg-leaf-deep transition-[width] duration-300" style={{ width: `${stage === 'saving' ? 100 : pct}%` }} />
              </div>
              <p className="m-0 mt-1 text-sm text-bark-soft">
                {stage === 'uploading' ? `Enviando foto… ${pct}%` : 'Registrando a foto…'}
              </p>
            </div>
          )}
          {stage === 'error' && error && <Notice onRetry={() => void send()}>{errorText(error)}</Notice>}

          <Button onClick={() => void send()} busy={sending}>{stage === 'error' ? 'Enviar de novo' : 'Enviar foto'}</Button>
          <Button variant="soft" onClick={reset} disabled={sending}>Escolher outra foto</Button>
        </div>
      )}

      {mine.length > 0 && (
        <section aria-label="Suas fotos" className="grid gap-2">
          <h2 className="m-0 text-lg font-bold">Suas fotos enviadas</h2>
          <ul className="m-0 grid list-none gap-2 p-0">
            {mine.map((p, i) => (
              <li key={p.id} className="flex items-center justify-between gap-3 rounded-2xl bg-paper px-4 py-3 shadow-sm">
                <span className="min-w-0 truncate">{p.caption || `Foto ${mine.length - i}`}</span>
                <StatusChip status={p.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ C. Palpites

interface GuessForm {
  birth_date: string;
  weight: string; // gramas
  height: string; // cm
  looks_like: LooksLike | '';
}

const LOOKS: { value: LooksLike; label: string }[] = [
  { value: 'mom', label: 'Mamãe' },
  { value: 'dad', label: 'Papai' },
  { value: 'mix', label: 'Uma mistura dos dois' },
];

export function GuessView({ live }: { live: Live }) {
  const [form, setForm] = useState<GuessForm>(() => draft.get('guess', { birth_date: '', weight: '', height: '', looks_like: '' }));
  const [saved, setSaved] = useState<null | 'existing' | 'now'>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    myGuess()
      .then((g) => {
        if (!alive || !g) return;
        setSaved('existing');
        // o rascunho local (se houver) vence: pode ser uma edição ainda não salva
        if (!draft.get<GuessForm | null>('guess', null)) {
          setForm({
            birth_date: g.birth_date, weight: String(g.weight_g),
            height: String(g.height_cm).replace('.', ','), looks_like: g.looks_like,
          });
        }
      })
      .catch(() => undefined)
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const patch = (p: Partial<GuessForm>) => {
    const next = { ...form, ...p };
    setForm(next);
    draft.set('guess', next);
    if (saved === 'now') setSaved('existing');
  };

  const weight = Number(form.weight);
  const height = Number(form.height.replace(',', '.'));
  const complete = Boolean(form.birth_date && form.weight && form.height && form.looks_like);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (inFlight.current || !complete || !form.looks_like) return;
    if (!Number.isFinite(weight) || !Number.isInteger(weight)) return setError('invalid_weight');
    if (!Number.isFinite(height)) return setError('invalid_height');
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await saveGuess({ birth_date: form.birth_date, weight_g: weight, height_cm: height, looks_like: form.looks_like });
      draft.clear('guess');
      setSaved('now');
    } catch (err) {
      setError(errorCode(err));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const blocked = closedReason(live, live.event?.guesses_open);
  if (loading) return <p className="text-bark-soft">Carregando seu palpite…</p>;

  if (blocked) {
    return (
      <div className="grid gap-4">
        <Notice tone="info">{blocked}</Notice>
        {saved && form.looks_like && (
          <div className="rounded-2xl bg-paper p-4 shadow-sm">
            <h2 className="m-0 mb-2 text-lg font-bold">Seu palpite</h2>
            <p className="m-0">Nasce em {formatDay(form.birth_date, true)}</p>
            <p className="m-0">{formatKg(weight)} e {formatCm(height)}</p>
            <p className="m-0">Vai parecer: {LOOKS.find((l) => l.value === form.looks_like)?.label.toLowerCase()}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <p className="m-0 text-bark-soft">É só uma brincadeira: ninguém aqui prevê o futuro. Você pode mudar seu palpite enquanto a atividade estiver aberta.</p>

      <div>
        <label htmlFor="dia" className="mb-1 block font-bold">Em que dia ela nasce?</label>
        <input id="dia" type="date" value={form.birth_date} min={todayIso()} max={todayIso(365)}
          onChange={(e) => patch({ birth_date: e.target.value })} className={fieldClass} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="peso" className="mb-1 block font-bold">Peso, em gramas</label>
          <input id="peso" inputMode="numeric" pattern="[0-9]*" value={form.weight} placeholder="3200" maxLength={4}
            onChange={(e) => patch({ weight: e.target.value.replace(/\D/g, '') })} aria-describedby="peso-ajuda" className={fieldClass} />
          <p id="peso-ajuda" className="m-0 mt-1 min-h-5 text-sm text-bark-soft">
            {form.weight && Number.isFinite(weight) ? `= ${formatKg(weight)}` : 'Ex.: 3200 g = 3,2 kg'}
          </p>
        </div>
        <div>
          <label htmlFor="altura" className="mb-1 block font-bold">Altura, em cm</label>
          <input id="altura" inputMode="decimal" value={form.height} placeholder="49,5" maxLength={4}
            onChange={(e) => patch({ height: e.target.value.replace(/[^\d.,]/g, '') })} aria-describedby="altura-ajuda" className={fieldClass} />
          <p id="altura-ajuda" className="m-0 mt-1 min-h-5 text-sm text-bark-soft">Centímetros</p>
        </div>
      </div>

      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-2 font-bold">Com quem ela vai parecer?</legend>
        <div className="grid gap-2">
          {LOOKS.map((l) => (
            <label key={l.value}
              className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-3 text-lg font-bold
                focus-within:outline focus-within:outline-3 focus-within:outline-leaf-deep
                ${form.looks_like === l.value ? 'border-petal-deep bg-butter' : 'border-butter-deep/70 bg-paper'}`}>
              <input type="radio" name="parece" value={l.value} checked={form.looks_like === l.value}
                onChange={() => patch({ looks_like: l.value })} className="h-5 w-5 accent-[var(--color-leaf-deep)]" />
              {l.label}
            </label>
          ))}
        </div>
      </fieldset>

      {error && <Notice onRetry={() => void submit()}>{errorText(error)}</Notice>}
      {saved === 'now' && <Notice tone="ok">Palpite guardado. Você pode mudar enquanto a atividade estiver aberta.</Notice>}
      <Button type="submit" busy={busy} disabled={!complete}>{saved ? 'Atualizar palpite' : 'Guardar palpite'}</Button>
    </form>
  );
}

// ------------------------------------------------------------------ D. Quiz

export const OPTION_STYLES = [
  { letter: 'A', bg: '#f7df85', fg: '#55402f' },
  { letter: 'B', bg: '#c9dcb8', fg: '#3f5735' },
  { letter: 'C', bg: '#f3c9bf', fg: '#6e2f28' },
  { letter: 'D', bg: '#c5d9ea', fg: '#2f4a63' },
];

export function QuizView({ live }: { live: Live }) {
  const round = live.round;
  const blocked = closedReason(live, live.event?.quiz_open);
  if (blocked) return <Notice tone="info">{blocked}</Notice>;
  if (!round) {
    return (
      <Empty title="Nenhuma pergunta no ar" seed="quiz">
        Quando os pais abrirem uma rodada, a pergunta aparece aqui sozinha. Pode deixar esta tela aberta.
      </Empty>
    );
  }
  return <RoundCard key={round.id} round={round} live={live} />;
}

function RoundCard({ round, live }: { round: Round; live: Live }) {
  const [vote, setVote] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTry, setLastTry] = useState<number | null>(null);
  const left = useCountdown(round.status === 'open' ? round.closes_at : null, live.now);

  // Recupera o voto já dado (reconexão ou recarregamento da página).
  const recover = useCallback(() => {
    myVote(round.id)
      .then((v) => { setVote(v); setChecked(true); })
      .catch(() => setChecked(true));
  }, [round.id]);
  useEffect(recover, [recover]);

  const open = round.status === 'open' && left > 0;

  const choose = async (index: number) => {
    if (inFlight.current || vote !== null) return;
    inFlight.current = true;
    setBusy(index);
    setLastTry(index);
    setError(null);
    try {
      setVote(await castVote(round.id, index));
    } catch (err) {
      setError(errorCode(err));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const revealed = round.status === 'revealed' && round.results;
  const total = revealed ? round.results!.reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-leaf-soft px-3 py-1 text-sm font-bold text-leaf-deep">
          {round.kind === 'quiz' ? 'Quiz' : 'Enquete'}
        </span>
        {open && (
          <span role="timer" aria-live="off" className="rounded-full bg-butter px-3 py-1 text-lg font-bold tabular-nums">
            {left} s
          </span>
        )}
      </div>
      <h2 className="m-0 text-2xl font-bold leading-snug">{round.prompt}</h2>

      {!revealed && (
        <div className="grid gap-3">
          {round.options.map((opt, i) => {
            const s = OPTION_STYLES[i % OPTION_STYLES.length];
            const chosen = vote === i;
            return (
              <button key={i} type="button" onClick={() => void choose(i)}
                disabled={!open || vote !== null || !checked || busy !== null}
                aria-pressed={chosen}
                className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 px-3 py-3 text-left text-xl font-bold transition
                  disabled:cursor-default ${chosen ? 'border-bark' : 'border-transparent'}
                  ${vote !== null && !chosen ? 'opacity-45' : ''} ${!open && vote === null ? 'opacity-60' : ''}`}
                style={{ background: s.bg, color: s.fg }}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paper/80" aria-hidden="true">{s.letter}</span>
                <span className="min-w-0 flex-1 break-words">{opt}</span>
                {busy === i && <span className="text-base font-normal">Enviando…</span>}
                {chosen && <span className="text-base">Sua resposta</span>}
              </button>
            );
          })}
        </div>
      )}

      {error && error !== 'round_closed' && (
        <Notice onRetry={lastTry !== null && open ? () => void choose(lastTry) : undefined}>{errorText(error)}</Notice>
      )}

      {!revealed && vote !== null && (
        <Notice tone="ok">
          Resposta registrada: {OPTION_STYLES[vote % 4].letter}. {round.kind === 'quiz' ? 'O resultado aparece quando os pais revelarem.' : 'O resultado aparece na TV em instantes.'}
        </Notice>
      )}
      {!revealed && vote === null && !open && checked && (
        <Notice tone="info">O tempo desta rodada acabou. Acompanhe o resultado na TV.</Notice>
      )}

      {revealed && (
        <div className="grid gap-3">
          {round.options.map((opt, i) => {
            const s = OPTION_STYLES[i % OPTION_STYLES.length];
            const n = round.results![i] ?? 0;
            const correct = round.kind === 'quiz' && round.correct_index === i;
            return (
              <div key={i} className={`rounded-2xl border-2 bg-paper p-3 ${correct ? 'border-leaf-deep' : 'border-transparent'}`}>
                <div className="flex items-baseline justify-between gap-3 text-lg font-bold">
                  <span className="min-w-0 break-words">{s.letter}. {opt}{vote === i ? ' (sua resposta)' : ''}</span>
                  <span className="shrink-0 tabular-nums">{percent(n, total)}%</span>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-cream" aria-hidden="true">
                  <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${percent(n, total)}%`, background: s.bg }} />
                </div>
                <p className="m-0 mt-1 text-sm text-bark-soft">
                  {n} {n === 1 ? 'voto' : 'votos'}
                  {correct && <strong className="ml-2 text-leaf-deep">Resposta certa</strong>}
                </p>
              </div>
            );
          })}
          {round.kind === 'quiz' && vote !== null && round.correct_index !== null && (
            <Notice tone={vote === round.correct_index ? 'ok' : 'info'}>
              {vote === round.correct_index ? 'Você acertou!' : 'Não foi desta vez. A próxima pergunta vem aí.'}
            </Notice>
          )}
        </div>
      )}
    </div>
  );
}
