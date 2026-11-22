import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  adminStats, configured, errorCode, hasSession, initApi, listMessages, listPhotos, moderate, photoUrls,
  signIn, signOut, whoami,
} from '../lib/api';
import type { AdminStats, Message, ModStatus, Photo } from '../lib/types';
import { useLive, type Live } from '../lib/useLive';
import { STATUS_LABEL, errorText } from '../lib/util';
import { ArtDefs, Sunflower } from '../art/Art';
import { Button, Confirm, ConnectionBadge, Empty, Loading, NotConfigured, Notice } from '../ui';
import { EventTab, QuizTab, Section, TvTab } from './Tabs';

type Tab = 'moderar' | 'tv' | 'quiz' | 'evento';

export default function AdminApp() {
  const [state, setState] = useState<'loading' | 'login' | 'denied' | 'ready' | 'error'>('loading');
  const [uid, setUid] = useState<string | null>(null);

  const check = useCallback(async () => {
    setState('loading');
    try {
      initApi('admin');
      if (!(await hasSession())) return setState('login');
      const who = await whoami();
      setUid(who.uid);
      setState(who.is_admin ? 'ready' : 'denied');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    if (configured) void check();
  }, [check]);

  const leave = async () => {
    await signOut().catch(() => undefined);
    setState('login');
  };

  if (!configured) return <NotConfigured />;
  if (state === 'loading') return <Loading />;
  if (state === 'error') {
    return <Centered><Notice onRetry={() => void check()}>{errorText('network')}</Notice></Centered>;
  }
  if (state === 'login') return <Login onDone={() => void check()} />;
  if (state === 'denied') {
    return (
      <Centered>
        <Notice tone="info">
          Este login existe, mas ainda não foi marcado como administrador. No SQL Editor do Supabase, rode:{' '}
          <code className="break-all">insert into public.admins (user_id) values ('{uid}');</code>
        </Notice>
        <Button variant="soft" className="mt-4 w-full" onClick={() => void leave()}>Sair</Button>
      </Centered>
    );
  }
  return <Panel onSignOut={() => void leave()} />;
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="paper relative flex min-h-full items-center justify-center bg-cream p-6">
      <div className="relative w-full max-w-sm">{children}</div>
    </div>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      onDone();
    } catch (err) {
      setError(errorCode(err));
      setBusy(false);
    }
  };
  const field = 'w-full rounded-2xl border-2 border-butter-deep bg-paper px-4 py-3 text-lg';
  return (
    <Centered>
      <ArtDefs />
      <form onSubmit={submit} className="grid gap-3">
        <div className="text-center">
          <Sunflower size={80} />
          <h1 className="font-hand m-0 text-3xl">Painel dos pais</h1>
        </div>
        <label htmlFor="email" className="font-bold">E-mail</label>
        <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required className={field} />
        <label htmlFor="senha" className="font-bold">Senha</label>
        <input id="senha" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className={field} />
        {error && <Notice>{errorText(error)}</Notice>}
        <Button type="submit" busy={busy} disabled={!email || !password} className="mt-2">Entrar</Button>
      </form>
    </Centered>
  );
}

// ------------------------------------------------------------------ painel

const TABS: { id: Tab; label: string }[] = [
  { id: 'moderar', label: 'Aprovar' },
  { id: 'tv', label: 'TV' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'evento', label: 'Evento' },
];

function Panel({ onSignOut }: { onSignOut: () => void }) {
  const live = useLive(true, { admin: true });
  const [tab, setTab] = useState<Tab>('moderar');
  const [stats, setStats] = useState<AdminStats | null>(null);

  const loadStats = useCallback(() => {
    adminStats().then(setStats).catch(() => undefined);
  }, []);
  useEffect(loadStats, [loadStats, live.queueTick, live.event?.content_version]);
  useEffect(() => {
    const id = window.setInterval(loadStats, 20000);
    return () => window.clearInterval(id);
  }, [loadStats]);

  const pending = stats ? stats.messages_pending + stats.photos_pending : 0;

  return (
    <div className="paper relative min-h-full bg-cream">
      <ArtDefs />
      <div className="relative mx-auto w-full max-w-2xl px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between gap-3">
          <p className="font-hand m-0 text-2xl">Painel do Chá da Hazel</p>
          <ConnectionBadge online={live.online} />
        </header>
        {live.event?.is_closed && (
          <div className="mt-2"><Notice tone="info">Evento encerrado: novos envios estão bloqueados. O conteúdo continua guardado.</Notice></div>
        )}
        <main className="mt-4">
          {tab === 'moderar' && <ModerationTab live={live} stats={stats} onChanged={loadStats} />}
          {tab === 'tv' && <TvTab live={live} />}
          {tab === 'quiz' && <QuizTab live={live} />}
          {tab === 'evento' && <EventTab live={live} stats={stats} onSignOut={onSignOut} />}
        </main>
      </div>

      <nav aria-label="Seções do painel"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-butter-deep bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-4">
          {TABS.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}
              className={`relative min-h-16 px-1 text-base font-bold ${tab === t.id ? 'text-bark' : 'text-bark-soft'}`}>
              <span className={`inline-block rounded-full px-4 py-2 ${tab === t.id ? 'bg-butter' : ''}`}>{t.label}</span>
              {t.id === 'moderar' && pending > 0 && (
                <span className="absolute right-[14%] top-2 min-w-6 rounded-full bg-blush px-1.5 text-center text-sm leading-6 text-paper"
                  aria-label={`${pending} aguardando aprovação`}>{pending}</span>
              )}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

// ------------------------------------------------------------------ aba: aprovar

function ModerationTab({ live, stats, onChanged }: { live: Live; stats: AdminStats | null; onChanged: () => void }) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const urlsRef = useRef<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [history, setHistory] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: 'message' | 'photo'; id: string; label: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, p] = await Promise.all([listMessages('all'), listPhotos('all')]);
      setMessages(m);
      setPhotos(p);
      setLoadError(false);
      const need = p.map((x) => x.storage_path).filter((path) => !urlsRef.current[path]);
      if (need.length) {
        urlsRef.current = { ...urlsRef.current, ...(await photoUrls(need)) };
        setUrls(urlsRef.current);
      }
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, live.queueTick, live.event?.content_version]);
  useEffect(() => {
    const id = window.setInterval(() => void load(), 20000);
    return () => window.clearInterval(id);
  }, [load]);

  const act = async (kind: 'message' | 'photo', id: string, status: ModStatus) => {
    if (busyId) return;
    setBusyId(id);
    setError(null);
    try {
      await moderate(kind, id, status);
      // reflete na hora; a lista completa é recarregada em seguida
      if (kind === 'message') setMessages((list) => list?.map((x) => (x.id === id ? { ...x, status } : x)) ?? list);
      else setPhotos((list) => list?.map((x) => (x.id === id ? { ...x, status } : x)) ?? list);
      onChanged();
      void load();
    } catch (err) {
      setError(errorCode(err));
    } finally {
      setBusyId(null);
      setConfirm(null);
    }
  };

  if (messages === null || photos === null) {
    return loadError
      ? <Notice onRetry={() => void load()}>{errorText('network')}</Notice>
      : <p className="text-bark-soft">Carregando filas…</p>;
  }

  const pendingM = messages.filter((m) => m.status === 'pending');
  const pendingP = photos.filter((p) => p.status === 'pending');
  const doneM = messages.filter((m) => m.status !== 'pending').reverse();
  const doneP = photos.filter((p) => p.status !== 'pending').reverse();

  return (
    <div>
      {stats && (
        <dl className="mb-5 grid grid-cols-4 gap-2 text-center">
          {[
            ['Convidados', stats.participants],
            ['Girassóis', stats.flowers],
            ['Recados', stats.messages_total],
            ['Fotos', stats.photos_total],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-paper px-1 py-3 shadow-sm">
              <dd className="m-0 text-2xl font-bold tabular-nums">{value}</dd>
              <dt className="text-sm text-bark-soft">{label}</dt>
            </div>
          ))}
        </dl>
      )}
      {error && <div className="mb-4"><Notice>{errorText(error)}</Notice></div>}
      {loadError && <div className="mb-4"><Notice onRetry={() => void load()}>Não foi possível atualizar as filas agora.</Notice></div>}

      <Section title={`Recados aguardando (${pendingM.length})`}>
        {pendingM.length === 0 && <Empty title="Nenhum recado na fila" seed="fila-recados">Os novos aparecem aqui sozinhos.</Empty>}
        <div className="grid gap-3">
          {pendingM.map((m) => (
            <article key={m.id} className="rounded-3xl bg-paper p-4 shadow-sm">
              <p className="m-0 font-bold">{m.author_name}</p>
              <p className="m-0 mt-1 whitespace-pre-wrap break-words text-lg">{m.body}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button onClick={() => void act('message', m.id, 'approved')} busy={busyId === m.id} disabled={busyId !== null}>Aprovar</Button>
                <Button variant="soft" onClick={() => void act('message', m.id, 'rejected')} disabled={busyId !== null}>Recusar</Button>
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section title={`Fotos aguardando (${pendingP.length})`}>
        {pendingP.length === 0 && <Empty title="Nenhuma foto na fila" seed="fila-fotos">As novas aparecem aqui sozinhas.</Empty>}
        <div className="grid gap-3">
          {pendingP.map((p) => (
            <article key={p.id} className="rounded-3xl bg-paper p-4 shadow-sm">
              {urls[p.storage_path]
                ? <img src={urls[p.storage_path]} alt={`Foto enviada por ${p.author_name}`} loading="lazy"
                    className="max-h-80 w-full rounded-2xl bg-butter/40 object-contain" />
                : <div className="flex h-40 items-center justify-center rounded-2xl bg-butter/40 text-bark-soft">Carregando prévia…</div>}
              <p className="m-0 mt-2 font-bold">{p.author_name}</p>
              {p.caption && <p className="m-0 break-words">{p.caption}</p>}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button onClick={() => void act('photo', p.id, 'approved')} busy={busyId === p.id} disabled={busyId !== null}>Aprovar</Button>
                <Button variant="soft" onClick={() => void act('photo', p.id, 'rejected')} disabled={busyId !== null}>Recusar</Button>
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section title="Já avaliados"
        aside={<button type="button" className="min-h-11 font-bold text-leaf-deep underline underline-offset-4" onClick={() => setHistory((v) => !v)}
          aria-expanded={history}>{history ? 'Ocultar' : `Mostrar (${doneM.length + doneP.length})`}</button>}>
        {history && (
          <div className="grid gap-2">
            {doneM.length + doneP.length === 0 && <p className="m-0 text-bark-soft">Nada avaliado ainda.</p>}
            {doneP.map((p) => (
              <HistoryRow key={p.id} status={p.status} disabled={busyId !== null}
                onApprove={() => void act('photo', p.id, 'approved')}
                onRemove={() => setConfirm({ kind: 'photo', id: p.id, label: `a foto de ${p.author_name}` })}>
                <span className="flex items-center gap-3">
                  {urls[p.storage_path] && <img src={urls[p.storage_path]} alt="" loading="lazy" className="h-14 w-14 rounded-xl object-cover" />}
                  <span className="min-w-0"><strong>{p.author_name}</strong>{p.caption ? `: ${p.caption}` : ' (foto)'}</span>
                </span>
              </HistoryRow>
            ))}
            {doneM.map((m) => (
              <HistoryRow key={m.id} status={m.status} disabled={busyId !== null}
                onApprove={() => void act('message', m.id, 'approved')}
                onRemove={() => setConfirm({ kind: 'message', id: m.id, label: `o recado de ${m.author_name}` })}>
                <span><strong>{m.author_name}</strong>: {m.body}</span>
              </HistoryRow>
            ))}
          </div>
        )}
      </Section>

      {confirm && (
        <Confirm
          title="Retirar da TV?"
          body={<>Vamos retirar {confirm.label} da exibição. O conteúdo não é apagado e pode ser aprovado de novo.</>}
          confirmLabel="Retirar da TV" busy={busyId === confirm.id}
          onConfirm={() => void act(confirm.kind, confirm.id, 'removed')} onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

function HistoryRow({ status, children, onApprove, onRemove, disabled }: {
  status: ModStatus; children: ReactNode; onApprove: () => void; onRemove: () => void; disabled: boolean;
}) {
  return (
    <div className="rounded-2xl bg-paper p-3 shadow-sm">
      <div className="break-words">{children}</div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${status === 'approved' ? 'bg-leaf-soft text-leaf-deep' : 'bg-blush-soft text-blush'}`}>
          {status === 'approved' ? 'Na TV' : STATUS_LABEL[status]}
        </span>
        {status === 'approved'
          ? <Button variant="danger" className="min-h-10 px-4 py-1 text-base" onClick={onRemove} disabled={disabled}>Retirar da TV</Button>
          : <Button variant="soft" className="min-h-10 px-4 py-1 text-base" onClick={onApprove} disabled={disabled}>Aprovar</Button>}
      </div>
    </div>
  );
}
