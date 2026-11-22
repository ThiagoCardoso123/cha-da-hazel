import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  allGuesses, closeRound, deleteQuestion, downloadPhoto, errorCode, getPrivate, listMessages, listPhotos,
  listQuestions, openRound, revealRound, rotateTvKey, saveQuestion, setJoinCode, updateEvent,
} from '../lib/api';
import { PUBLIC_URL } from '../lib/supabase';
import type { AdminStats, EventPrivate, EventState, Question, RoundKind, TvMode } from '../lib/types';
import { useCountdown, type Live } from '../lib/useLive';
import { STATUS_LABEL, errorText, makeZip, saveBlob, slug, toCsv } from '../lib/util';
import { Button, Confirm, Empty, Notice } from '../ui';

const field = 'w-full rounded-2xl border-2 border-butter-deep bg-paper px-4 py-3 text-lg';

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="m-0 text-xl font-bold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Aplica uma mudança no evento e reflete na hora neste aparelho. */
function usePatch(live: Live) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const patch = useCallback(async (p: Partial<EventState>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      live.setEvent(await updateEvent(p));
      return true;
    } catch (err) {
      setError(errorCode(err));
      return false;
    } finally {
      setBusy(false);
    }
  }, [live]);
  return { patch, busy, error, setError };
}

// ------------------------------------------------------------------ aba: TV

const MODES: { id: TvMode; label: string; hint: string }[] = [
  { id: 'garden', label: 'Jardim ao vivo', hint: 'Girassóis e recados aprovados' },
  { id: 'album', label: 'Álbum da festa', hint: 'Fotos aprovadas em sequência' },
  { id: 'quiz', label: 'Hora do quiz', hint: 'Pergunta, contagem e resultado' },
  { id: 'guesses', label: 'Palpites', hint: 'Resumo dos palpites' },
  { id: 'closing', label: 'Encerramento', hint: 'Jardim completo e frase final' },
];

export function TvTab({ live }: { live: Live }) {
  const ev = live.event;
  const { patch, busy, error } = usePatch(live);
  const [secret, setSecret] = useState<EventPrivate | null>(null);
  const [code, setCode] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [working, setWorking] = useState(false);

  const loadSecret = useCallback(() => {
    getPrivate().then((s) => { setSecret(s); setCode(s.join_code); }).catch(() => undefined);
  }, []);
  useEffect(loadSecret, [loadSecret]);

  if (!ev) return <p className="text-bark-soft">Carregando…</p>;
  const tvLink = secret ? `${PUBLIC_URL}/tv?k=${secret.tv_key}` : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tvLink);
      setNote('Link da TV copiado. Abra-o no computador ligado à TV.');
    } catch {
      setNote('Não foi possível copiar. Selecione o link e copie manualmente.');
    }
  };

  const saveCode = async (e: FormEvent) => {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (clean.length < 4 || clean.length > 12) return setLocalError('O código precisa ter de 4 a 12 caracteres.');
    setWorking(true);
    setLocalError(null);
    try {
      await setJoinCode(clean);
      setNote('Código do evento atualizado. O QR Code da TV muda em até 1 minuto (ou recarregue a TV).');
      loadSecret();
    } catch (err) {
      setLocalError(errorText(errorCode(err)));
    } finally {
      setWorking(false);
    }
  };

  const rotate = async () => {
    setWorking(true);
    try {
      const key = await rotateTvKey();
      setSecret((s) => (s ? { ...s, tv_key: key } : s));
      setNote('Chave trocada. As TVs antigas perderam o acesso: abra o novo link na TV.');
    } catch (err) {
      setLocalError(errorText(errorCode(err)));
    } finally {
      setWorking(false);
      setConfirmRotate(false);
    }
  };

  return (
    <div>
      {error && <div className="mb-4"><Notice>{errorText(error)}</Notice></div>}
      <Section title="O que a TV mostra agora">
        <div className="grid gap-2" role="radiogroup" aria-label="Modo da TV">
          {MODES.map((m) => {
            const on = ev.tv_mode === m.id;
            return (
              <button key={m.id} type="button" role="radio" aria-checked={on} disabled={busy}
                onClick={() => { if (!on) void patch({ tv_mode: m.id }); }}
                className={`flex min-h-16 items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3 text-left
                  ${on ? 'border-petal-deep bg-butter' : 'border-butter-deep/60 bg-paper'}`}>
                <span>
                  <span className="block text-lg font-bold">{m.label}</span>
                  <span className="block text-bark-soft">{m.hint}</span>
                </span>
                {on && <span className="shrink-0 rounded-full bg-petal px-3 py-1 text-sm font-bold">Na tela</span>}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Tempo de exibição">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block font-bold">Cada recado</span>
            <select value={ev.message_seconds} disabled={busy} onChange={(e) => void patch({ message_seconds: Number(e.target.value) })} className={field}>
              {[6, 8, 10, 12, 15, 20, 30].map((n) => <option key={n} value={n}>{n} segundos</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-bold">Cada foto</span>
            <select value={ev.photo_seconds} disabled={busy} onChange={(e) => void patch({ photo_seconds: Number(e.target.value) })} className={field}>
              {[4, 5, 7, 10, 15, 20].map((n) => <option key={n} value={n}>{n} segundos</option>)}
            </select>
          </label>
        </div>
      </Section>

      <Section title="Ligar a TV">
        <p className="m-0 mb-2 text-bark-soft">
          Abra este link no computador conectado à TV. Ele contém a chave da TV: não compartilhe com os convidados.
        </p>
        <input readOnly value={tvLink} aria-label="Link da TV" onFocus={(e) => e.target.select()} className={`${field} text-base`} />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button variant="soft" onClick={() => void copy()} disabled={!secret}>Copiar link</Button>
          <a href={tvLink || undefined} target="_blank" rel="noreferrer"
            className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-butter-deep bg-butter px-4 py-3 text-center text-lg font-bold text-bark no-underline">
            Abrir a TV neste aparelho
          </a>
        </div>
        <Button variant="ghost" className="mt-1 px-0" onClick={() => setConfirmRotate(true)} disabled={!secret}>Trocar a chave da TV</Button>
      </Section>

      <Section title="Código do evento">
        <form onSubmit={saveCode}>
          <p className="m-0 mb-2 text-bark-soft">Já vai dentro do QR Code. Quem digitar o endereço à mão informa este código, mostrado na TV.</p>
          <div className="flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} aria-label="Código do evento"
              autoCapitalize="characters" spellCheck={false} className={`${field} tracking-widest`} />
            <Button type="submit" variant="soft" busy={working} disabled={!secret || code.trim().toUpperCase() === secret.join_code}>Salvar</Button>
          </div>
        </form>
      </Section>

      {localError && <div className="mb-4"><Notice>{localError}</Notice></div>}
      {note && <div className="mb-4"><Notice tone="ok">{note}</Notice></div>}

      {confirmRotate && (
        <Confirm title="Trocar a chave da TV?" confirmLabel="Trocar chave" busy={working}
          body="Toda TV já ligada perde o acesso na hora e precisará abrir o novo link. Use se o link vazou."
          onConfirm={() => void rotate()} onCancel={() => setConfirmRotate(false)} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ aba: quiz

type Draft = Omit<Question, 'id'> & { id?: string };
const LETTERS = ['A', 'B', 'C', 'D'];

export function QuizTab({ live }: { live: Live }) {
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Question | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const { patch } = usePatch(live);
  const round = live.round;
  const left = useCountdown(round && round.status === 'open' ? round.closes_at : null, live.now);
  const running = Boolean(round && round.status === 'open' && left > 0);

  const load = useCallback(() => {
    listQuestions().then(setQuestions).catch(() => setError('network'));
  }, []);
  useEffect(load, [load]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await fn();
      await live.refresh();
    } catch (err) {
      setError(errorCode(err));
    } finally {
      setBusy(null);
    }
  };

  const start = (q: Question) => run(q.id, async () => {
    await openRound(q.id);
    if (live.event?.tv_mode !== 'quiz') await patch({ tv_mode: 'quiz' });
  });

  const clear = () => run('clear', async () => {
    if (round && round.status === 'open') await closeRound(round.id);
    await patch({ current_round_id: null });
    setConfirmClear(false);
  });

  const remove = (q: Question) => run(`del-${q.id}`, async () => {
    await deleteQuestion(q.id);
    setConfirmDelete(null);
    load();
  });

  if (editing) {
    return <QuestionForm initial={editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />;
  }

  return (
    <div>
      {error && <div className="mb-4"><Notice>{errorText(error)}</Notice></div>}
      {live.event?.is_closed && <div className="mb-4"><Notice tone="info">Com o evento encerrado não é possível abrir rodadas.</Notice></div>}

      <Section title="Rodada no ar">
        {!round && <p className="m-0 rounded-2xl bg-paper p-4 text-bark-soft shadow-sm">Nenhuma rodada no ar. Escolha uma pergunta abaixo.</p>}
        {round && (
          <div className="rounded-3xl bg-paper p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-full bg-leaf-soft px-3 py-1 text-sm font-bold text-leaf-deep">{round.kind === 'quiz' ? 'Quiz' : 'Enquete'}</span>
              <span className="font-bold tabular-nums">
                {running ? `Aberta: ${left} s` : round.status === 'revealed' ? 'Resultado revelado' : 'Encerrada, aguardando revelar'}
              </span>
            </div>
            <p className="m-0 mt-2 text-lg font-bold">{round.prompt}</p>
            <p className="m-0 text-bark-soft">{round.total_votes} {round.total_votes === 1 ? 'resposta' : 'respostas'}</p>
            {round.status === 'revealed' && round.results && (
              <ul className="m-0 mt-2 list-none p-0">
                {round.options.map((o, i) => (
                  <li key={i} className={round.correct_index === i ? 'font-bold text-leaf-deep' : ''}>
                    {LETTERS[i]}. {o}: {round.results![i] ?? 0}{round.correct_index === i ? ' (resposta certa)' : ''}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 grid gap-2">
              {running && <Button onClick={() => void run('close', () => closeRound(round.id))} busy={busy === 'close'}>Encerrar agora</Button>}
              {!running && round.status !== 'revealed' && (
                <Button onClick={() => void run('reveal', () => revealRound(round.id))} busy={busy === 'reveal'}>
                  {round.kind === 'quiz' ? 'Revelar resposta e resultado' : 'Mostrar resultado'}
                </Button>
              )}
              <Button variant="soft" onClick={() => (running ? setConfirmClear(true) : void clear())} busy={busy === 'clear'}>Tirar da tela</Button>
            </div>
            {live.event?.tv_mode !== 'quiz' && (
              <p className="m-0 mt-3 text-bark-soft">
                A TV não está no modo quiz.{' '}
                <button type="button" className="min-h-11 font-bold text-leaf-deep underline underline-offset-4" onClick={() => void patch({ tv_mode: 'quiz' })}>
                  Mostrar o quiz na TV
                </button>
              </p>
            )}
          </div>
        )}
      </Section>

      <Section title="Perguntas"
        aside={<Button variant="soft" className="min-h-10 px-4 py-1 text-base"
          onClick={() => setEditing({ kind: 'poll', prompt: '', options: ['Mamãe', 'Papai'], correct_index: null, duration_seconds: 30, position: (questions?.length ?? 0) + 1 })}>
          Nova pergunta
        </Button>}>
        {questions === null && <p className="text-bark-soft">Carregando…</p>}
        {questions?.length === 0 && <Empty title="Nenhuma pergunta cadastrada" seed="perguntas">Crie a primeira em “Nova pergunta”.</Empty>}
        <div className="grid gap-3">
          {questions?.map((q) => (
            <article key={q.id} className="rounded-3xl bg-paper p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-bold">
                <span className="rounded-full bg-leaf-soft px-3 py-1 text-leaf-deep">{q.kind === 'quiz' ? 'Quiz' : 'Enquete'}</span>
                <span className="text-bark-soft">{q.duration_seconds} s</span>
              </div>
              <p className="m-0 mt-2 text-lg font-bold">{q.prompt}</p>
              <p className="m-0 text-bark-soft">
                {q.options.map((o, i) => `${LETTERS[i]}. ${o}${q.correct_index === i ? ' (certa)' : ''}`).join('   ')}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button className="col-span-2" onClick={() => void start(q)} busy={busy === q.id} disabled={busy !== null || running || Boolean(live.event?.is_closed)}>
                  Colocar no ar
                </Button>
                <Button variant="soft" onClick={() => setEditing(q)} disabled={busy !== null}>Editar</Button>
                <Button variant="danger" onClick={() => setConfirmDelete(q)} disabled={busy !== null}>Excluir</Button>
              </div>
            </article>
          ))}
        </div>
        {running && <p className="mt-3 text-bark-soft">Encerre a rodada aberta para colocar outra pergunta no ar.</p>}
      </Section>

      {confirmDelete && (
        <Confirm title="Excluir esta pergunta?" confirmLabel="Excluir pergunta" busy={busy === `del-${confirmDelete.id}`}
          body={<>“{confirmDelete.prompt}” sai da lista. Rodadas já realizadas e seus votos continuam guardados.</>}
          onConfirm={() => void remove(confirmDelete)} onCancel={() => setConfirmDelete(null)} />
      )}
      {confirmClear && (
        <Confirm title="Tirar a rodada aberta da tela?" confirmLabel="Encerrar e tirar" busy={busy === 'clear'}
          body="A rodada será encerrada agora, sem revelar o resultado."
          onConfirm={() => void clear()} onCancel={() => setConfirmClear(false)} />
      )}
    </div>
  );
}

function QuestionForm({ initial, onCancel, onSaved }: { initial: Draft; onCancel: () => void; onSaved: () => void }) {
  const [q, setQ] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setKind = (kind: RoundKind) => setQ({ ...q, kind, correct_index: kind === 'poll' ? null : q.correct_index });
  const setOption = (i: number, value: string) => setQ({ ...q, options: q.options.map((o, j) => (j === i ? value : o)) });
  const addOption = () => setQ({ ...q, options: [...q.options, ''] });
  const removeOption = (i: number) => setQ({
    ...q,
    options: q.options.filter((_, j) => j !== i),
    correct_index: q.correct_index === null ? null : q.correct_index === i ? null : q.correct_index > i ? q.correct_index - 1 : q.correct_index,
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const options = q.options.map((o) => o.trim());
    if (!q.prompt.trim()) return setError('Escreva a pergunta.');
    if (options.some((o) => !o)) return setError('Preencha todas as alternativas ou remova as vazias.');
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return setError('Há alternativas repetidas.');
    if (q.kind === 'quiz' && q.correct_index === null) return setError('Marque qual alternativa é a resposta certa.');
    setBusy(true);
    setError(null);
    try {
      await saveQuestion({ ...q, prompt: q.prompt.trim(), options });
      onSaved();
    } catch (err) {
      setError(errorText(errorCode(err)));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <h2 className="m-0 text-xl font-bold">{q.id ? 'Editar pergunta' : 'Nova pergunta'}</h2>

      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-2 font-bold">Tipo</legend>
        <div className="grid grid-cols-2 gap-2">
          {([['poll', 'Enquete', 'Sem resposta certa'], ['quiz', 'Quiz', 'Com resposta certa']] as const).map(([kind, label, hint]) => (
            <label key={kind} className={`cursor-pointer rounded-2xl border-2 p-3 focus-within:outline focus-within:outline-3 focus-within:outline-leaf-deep
              ${q.kind === kind ? 'border-petal-deep bg-butter' : 'border-butter-deep/60 bg-paper'}`}>
              <input type="radio" name="tipo" className="sr-only" checked={q.kind === kind} onChange={() => setKind(kind)} />
              <span className="block text-lg font-bold">{label}</span>
              <span className="block text-sm text-bark-soft">{hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="mb-1 block font-bold">Pergunta</span>
        <textarea value={q.prompt} onChange={(e) => setQ({ ...q, prompt: e.target.value })} maxLength={160} rows={2} className={`${field} resize-none`} />
      </label>

      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-2 font-bold">
          Alternativas{q.kind === 'quiz' && <span className="font-normal text-bark-soft"> (marque a certa)</span>}
        </legend>
        <div className="grid gap-2">
          {q.options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              {q.kind === 'quiz' && (
                <input type="radio" name="certa" checked={q.correct_index === i} onChange={() => setQ({ ...q, correct_index: i })}
                  aria-label={`Alternativa ${LETTERS[i]} é a resposta certa`} className="h-6 w-6 shrink-0 accent-[var(--color-leaf-deep)]" />
              )}
              <span className="w-5 shrink-0 font-bold" aria-hidden="true">{LETTERS[i]}</span>
              <input value={o} onChange={(e) => setOption(i, e.target.value)} maxLength={60} aria-label={`Alternativa ${LETTERS[i]}`} className={field} />
              {q.options.length > 2 && (
                <button type="button" onClick={() => removeOption(i)} aria-label={`Remover alternativa ${LETTERS[i]}`}
                  className="min-h-11 min-w-11 shrink-0 rounded-xl text-xl font-bold text-blush">×</button>
              )}
            </div>
          ))}
        </div>
        {q.options.length < 4 && (
          <Button type="button" variant="ghost" className="px-0" onClick={addOption}>Adicionar alternativa</Button>
        )}
      </fieldset>

      <label className="block">
        <span className="mb-1 block font-bold">Tempo para responder</span>
        <select value={q.duration_seconds} onChange={(e) => setQ({ ...q, duration_seconds: Number(e.target.value) })} className={field}>
          {[15, 20, 30, 45, 60, 90, 120].map((n) => <option key={n} value={n}>{n} segundos</option>)}
        </select>
      </label>

      {error && <Notice>{error}</Notice>}
      <div className="grid grid-cols-2 gap-2">
        <Button type="submit" busy={busy}>Salvar pergunta</Button>
        <Button type="button" variant="soft" onClick={onCancel} disabled={busy}>Cancelar</Button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ aba: evento

const ACTIVITIES: { key: 'messages_open' | 'photos_open' | 'guesses_open' | 'quiz_open'; label: string }[] = [
  { key: 'messages_open', label: 'Recado para a Hazel' },
  { key: 'photos_open', label: 'Álbum da festa' },
  { key: 'guesses_open', label: 'Palpites da Hazel' },
  { key: 'quiz_open', label: 'Quiz dos papais' },
];

const LOOKS_CSV = { mom: 'Mamãe', dad: 'Papai', mix: 'Mistura dos dois' } as const;

export function EventTab({ live, stats, onSignOut }: { live: Live; stats: AdminStats | null; onSignOut: () => void }) {
  const ev = live.event;
  const { patch, busy, error } = usePatch(live);
  const [confirm, setConfirm] = useState<'close' | 'reopen' | 'gallery' | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportNote, setExportNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  if (!ev) return <p className="text-bark-soft">Carregando…</p>;

  const exportMessages = async () => {
    setExporting('recados');
    setExportNote(null);
    try {
      const rows = await listMessages('all');
      saveBlob(toCsv(
        ['Autor', 'Recado', 'Situação', 'Enviado em'],
        rows.map((m) => [m.author_name, m.body, STATUS_LABEL[m.status], new Date(m.created_at).toLocaleString('pt-BR')]),
      ), 'cha-da-hazel-recados.csv');
      setExportNote({ tone: 'ok', text: `${rows.length} recados exportados.` });
    } catch (err) {
      setExportNote({ tone: 'error', text: errorText(errorCode(err)) });
    } finally {
      setExporting(null);
    }
  };

  const exportGuesses = async () => {
    setExporting('palpites');
    setExportNote(null);
    try {
      const rows = await allGuesses();
      saveBlob(toCsv(
        ['Autor', 'Dia do nascimento', 'Peso (g)', 'Altura (cm)', 'Vai parecer com'],
        rows.map((g) => [
          g.author_name, g.birth_date.split('-').reverse().join('/'), g.weight_g,
          String(g.height_cm).replace('.', ','), LOOKS_CSV[g.looks_like],
        ]),
      ), 'cha-da-hazel-palpites.csv');
      setExportNote({ tone: 'ok', text: `${rows.length} palpites exportados.` });
    } catch (err) {
      setExportNote({ tone: 'error', text: errorText(errorCode(err)) });
    } finally {
      setExporting(null);
    }
  };

  const exportPhotos = async () => {
    setExporting('fotos');
    setExportNote(null);
    try {
      const rows = await listPhotos('approved');
      if (rows.length === 0) {
        setExportNote({ tone: 'error', text: 'Ainda não há fotos aprovadas para baixar.' });
        return;
      }
      const files: { name: string; data: Uint8Array }[] = [];
      for (let i = 0; i < rows.length; i++) {
        setExporting(`fotos ${i + 1}/${rows.length}`);
        const blob = await downloadPhoto(rows[i].storage_path);
        const n = String(i + 1).padStart(3, '0');
        files.push({ name: `${n}-${slug(rows[i].author_name)}.jpg`, data: new Uint8Array(await blob.arrayBuffer()) });
      }
      const legend = toCsv(['Arquivo', 'Autor', 'Legenda'], rows.map((p, i) => [files[i].name, p.author_name, p.caption]));
      files.push({ name: 'legendas.csv', data: new Uint8Array(await legend.arrayBuffer()) });
      saveBlob(makeZip(files), 'cha-da-hazel-fotos.zip');
      setExportNote({ tone: 'ok', text: `${rows.length} fotos reunidas em um arquivo .zip.` });
    } catch (err) {
      setExportNote({ tone: 'error', text: errorText(errorCode(err)) });
    } finally {
      setExporting(null);
    }
  };

  const doConfirm = async () => {
    if (confirm === 'close') await patch({ is_closed: true, tv_mode: 'closing' });
    if (confirm === 'reopen') await patch({ is_closed: false, guest_gallery_enabled: false });
    if (confirm === 'gallery') await patch({ guest_gallery_enabled: true });
    setConfirm(null);
  };

  return (
    <div>
      {error && <div className="mb-4"><Notice>{errorText(error)}</Notice></div>}

      <Section title="Atividades">
        <div className="grid gap-2">
          {ACTIVITIES.map((a) => {
            const on = ev[a.key];
            return (
              <div key={a.key} className="flex items-center justify-between gap-3 rounded-2xl bg-paper px-4 py-3 shadow-sm">
                <span className="text-lg font-bold">{a.label}</span>
                <button type="button" role="switch" aria-checked={on} aria-label={`${a.label}: ${on ? 'aberta' : 'fechada'}`}
                  disabled={busy || ev.is_closed} onClick={() => void patch({ [a.key]: !on } as Partial<EventState>)}
                  className={`min-h-11 min-w-28 rounded-full px-4 font-bold disabled:opacity-50 ${on ? 'bg-leaf-soft text-leaf-deep' : 'bg-blush-soft text-blush'}`}>
                  {on ? 'Aberta' : 'Fechada'}
                </button>
              </div>
            );
          })}
        </div>
        {ev.is_closed && <p className="mt-2 text-bark-soft">Com o evento encerrado, todas as atividades ficam bloqueadas.</p>}
      </Section>

      {stats && (
        <Section title="Números">
          <dl className="m-0 grid grid-cols-2 gap-2">
            {[
              ['Convidados', stats.participants], ['Girassóis no jardim', stats.flowers],
              ['Recados aprovados', `${stats.messages_approved} de ${stats.messages_total}`],
              ['Fotos aprovadas', `${stats.photos_approved} de ${stats.photos_total}`],
              ['Palpites', stats.guesses], ['Aguardando aprovação', stats.messages_pending + stats.photos_pending],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-paper px-4 py-3 shadow-sm">
                <dt className="text-sm text-bark-soft">{label}</dt>
                <dd className="m-0 text-xl font-bold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      <Section title="Guardar as lembranças">
        <div className="grid gap-2">
          <Button variant="soft" onClick={() => void exportMessages()} busy={exporting === 'recados'} disabled={exporting !== null}>Baixar recados (CSV)</Button>
          <Button variant="soft" onClick={() => void exportGuesses()} busy={exporting === 'palpites'} disabled={exporting !== null}>Baixar palpites (CSV)</Button>
          <Button variant="soft" onClick={() => void exportPhotos()} busy={Boolean(exporting?.startsWith('fotos'))} disabled={exporting !== null}>
            {exporting?.startsWith('fotos ') ? `Baixando ${exporting.slice(6)}…` : 'Baixar fotos aprovadas (.zip)'}
          </Button>
        </div>
        <p className="mt-2 text-sm text-bark-soft">Os CSV abrem no Excel e no Google Planilhas com acentos corretos. Use o Wi-Fi para baixar as fotos.</p>
        {exportNote && <Notice tone={exportNote.tone}>{exportNote.text}</Notice>}
      </Section>

      <Section title="Fim da festa">
        {!ev.is_closed ? (
          <>
            <p className="m-0 mb-2 text-bark-soft">Encerrar bloqueia novos recados, fotos, palpites e votos. Nada é apagado e a TV vai para o encerramento.</p>
            <Button variant="danger" className="w-full" onClick={() => setConfirm('close')} disabled={busy}>Encerrar o evento</Button>
          </>
        ) : (
          <div className="grid gap-3">
            <div className="rounded-2xl bg-paper p-4 shadow-sm">
              <p className="m-0 text-lg font-bold">Lembranças para os convidados</p>
              <p className="m-0 mb-3 text-bark-soft">
                {ev.guest_gallery_enabled
                  ? 'Liberadas: quem participou vê, no próprio celular, os recados e fotos aprovados.'
                  : 'Fechadas: só vocês têm acesso ao conteúdo. Nada fica público sem a sua decisão.'}
              </p>
              {ev.guest_gallery_enabled
                ? <Button variant="soft" className="w-full" onClick={() => void patch({ guest_gallery_enabled: false })} disabled={busy}>Fechar as lembranças</Button>
                : <Button variant="soft" className="w-full" onClick={() => setConfirm('gallery')} disabled={busy}>Liberar para quem participou</Button>}
            </div>
            <Button variant="ghost" onClick={() => setConfirm('reopen')} disabled={busy}>Reabrir o evento</Button>
          </div>
        )}
      </Section>

      <Button variant="ghost" onClick={onSignOut}>Sair do painel</Button>

      {confirm === 'close' && (
        <Confirm title="Encerrar o evento?" confirmLabel="Encerrar evento" busy={busy}
          body="Os convidados não poderão mais enviar nada. Todo o conteúdo fica guardado e você pode reabrir depois."
          onConfirm={() => void doConfirm()} onCancel={() => setConfirm(null)} />
      )}
      {confirm === 'reopen' && (
        <Confirm title="Reabrir o evento?" confirmLabel="Reabrir evento" busy={busy}
          body="Os convidados voltam a poder enviar recados, fotos, palpites e votos. As lembranças para convidados são fechadas."
          onConfirm={() => void doConfirm()} onCancel={() => setConfirm(null)} />
      )}
      {confirm === 'gallery' && (
        <Confirm title="Liberar as lembranças?" confirmLabel="Liberar lembranças" busy={busy}
          body="Quem participou da festa poderá ver, no próprio celular, todos os recados e fotos aprovados. Você pode fechar de novo quando quiser."
          onConfirm={() => void doConfirm()} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}
