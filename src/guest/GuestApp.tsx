import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  approvedMessages, approvedPhotos, configured, ensureAnonSession, errorCode, initApi, joinEvent,
  photoUrls, renameMe, whoami,
} from '../lib/api';
import type { Message, Participant, Photo } from '../lib/types';
import { useLive, type Live } from '../lib/useLive';
import { errorText } from '../lib/util';
import { ArtDefs, Rainbow, Sunflower } from '../art/Art';
import { Button, ConnectionBadge, Empty, Loading, NotConfigured, Notice } from '../ui';
import { AlbumView, GuessView, MessageView, QuizView } from './Activities';

type View = 'home' | 'message' | 'album' | 'guess' | 'quiz' | 'memories';

export default function GuestApp() {
  const [boot, setBoot] = useState<'loading' | 'error' | 'ready'>('loading');
  const [bootError, setBootError] = useState('server');
  const [me, setMe] = useState<Participant | null>(null);
  const [view, setView] = useState<View>('home');
  const live = useLive(boot === 'ready');

  const start = useCallback(async () => {
    setBoot('loading');
    try {
      initApi('guest');
      await ensureAnonSession();
      const who = await whoami();
      setMe(who.participant);
      setBoot('ready');
    } catch (e) {
      setBootError(errorCode(e));
      setBoot('error');
    }
  }, []);

  useEffect(() => {
    if (configured) void start();
  }, [start]);

  // Rodada aberta: leva quem está na tela inicial direto para a pergunta.
  const round = live.round;
  const roundOpen = Boolean(
    round && round.status === 'open' && new Date(round.closes_at).getTime() > live.now()
    && live.event?.quiz_open && !live.event?.is_closed,
  );
  const lastAutoRound = useRef<string | null>(null);
  useEffect(() => {
    if (!me || !round || !roundOpen) return;
    if (lastAutoRound.current === round.id) return;
    lastAutoRound.current = round.id;
    setView((v) => (v === 'home' ? 'quiz' : v));
  }, [me, round, roundOpen]);

  if (!configured) return <NotConfigured />;
  if (boot === 'loading') return <Loading label="Abrindo o jardim…" />;
  if (boot === 'error') {
    return (
      <Page>
        <div className="mx-auto mt-16 max-w-sm">
          <Notice onRetry={() => void start()}>{errorText(bootError)}</Notice>
        </div>
      </Page>
    );
  }

  if (!me) {
    return (
      <Page>
        <Welcome closed={Boolean(live.event?.is_closed)} onJoined={setMe} />
      </Page>
    );
  }

  const back = () => setView('home');
  return (
    <Page>
      <ArtDefs />
      {view === 'home' && <Home me={me} onRename={setMe} live={live} roundOpen={roundOpen} go={setView} />}
      {view !== 'home' && (
        <Shell
          title={TITLES[view]}
          online={live.online}
          onBack={back}
          banner={roundOpen && view !== 'quiz'
            ? <button type="button" onClick={() => setView('quiz')}
                className="anim-rise w-full rounded-2xl bg-petal px-4 py-3 text-left font-bold text-bark">
                O quiz começou. Toque para responder.
              </button>
            : null}
        >
          {view === 'message' && <MessageView live={live} />}
          {view === 'album' && <AlbumView live={live} />}
          {view === 'guess' && <GuessView live={live} />}
          {view === 'quiz' && <QuizView live={live} />}
          {view === 'memories' && <Memories />}
        </Shell>
      )}
    </Page>
  );
}

const TITLES: Record<View, string> = {
  home: '',
  message: 'Recado para a Hazel',
  album: 'Álbum da festa',
  guess: 'Palpites da Hazel',
  quiz: 'Quiz dos papais',
  memories: 'Lembranças do chá',
};

function Page({ children }: { children: ReactNode }) {
  return (
    <div className="paper relative min-h-full bg-cream">
      <div className="relative mx-auto min-h-full w-full max-w-md px-5 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))]">
        {children}
      </div>
    </div>
  );
}

function Shell({ title, online, onBack, banner, children }: {
  title: string; online: boolean; onBack: () => void; banner?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="anim-fade">
      <div className="flex min-h-11 items-center justify-between">
        <button type="button" onClick={onBack} className="-ml-2 min-h-11 rounded-xl px-2 font-bold text-leaf-deep">
          ‹ Voltar
        </button>
        <ConnectionBadge online={online} />
      </div>
      <h1 className="font-hand mb-2 mt-3 text-[1.9rem] text-bark">{title}</h1>
      {banner && <div className="mb-4">{banner}</div>}
      {children}
    </div>
  );
}

// ------------------------------------------------------------------ entrada

function Welcome({ closed, onJoined }: { closed: boolean; onJoined: (p: Participant) => void }) {
  const urlCode = useRef(new URLSearchParams(window.location.search).get('c') ?? '');
  const [name, setName] = useState('');
  const [code, setCode] = useState(urlCode.current);
  const [askCode, setAskCode] = useState(!urlCode.current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const p = await joinEvent(code, name);
      // tira o código do endereço para não ficar em capturas de tela
      window.history.replaceState(null, '', window.location.pathname);
      onJoined(p);
    } catch (err) {
      const c = errorCode(err);
      if (c === 'invalid_code') setAskCode(true);
      setError(c);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[85vh] flex-col items-center justify-center text-center">
      <ArtDefs />
      <div className="anim-fade"><Rainbow width={230} opacity={0.75} /></div>
      <div className="-mt-[5.2rem] anim-bloom"><Sunflower size={128} seed="hazel" /></div>
      <h1 className="font-hand anim-rise m-0 mt-1 text-[2.9rem] text-bark" style={{ animationDelay: '0.5s' }}>
        Chá da Hazel
      </h1>
      <p className="anim-rise m-0 max-w-xs text-lg text-bark-soft" style={{ animationDelay: '0.8s' }}>
        Hoje, cada um de vocês faz parte da nossa história.
      </p>

      {closed ? (
        <div className="mt-8 w-full">
          <Notice tone="info">O chá foi encerrado e não recebe novos participantes. Obrigado pelo carinho!</Notice>
        </div>
      ) : (
        <form onSubmit={submit} className="anim-rise mt-8 w-full text-left" style={{ animationDelay: '1.1s' }} noValidate>
          <label htmlFor="nome" className="mb-1 block font-bold">Como você quer ser chamado?</label>
          <input
            id="nome" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} required
            autoComplete="given-name" autoCapitalize="words" enterKeyHint="go" placeholder="Seu primeiro nome"
            className="w-full rounded-2xl border-2 border-butter-deep bg-paper px-4 py-3 text-xl placeholder:text-bark-soft/60"
          />
          {askCode && (
            <div className="mt-4">
              <label htmlFor="codigo" className="mb-1 block font-bold">Código do evento</label>
              <input
                id="codigo" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12}
                autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false}
                aria-describedby="codigo-ajuda"
                className="w-full rounded-2xl border-2 border-butter-deep bg-paper px-4 py-3 text-xl tracking-widest"
              />
              <p id="codigo-ajuda" className="m-0 mt-1 text-sm text-bark-soft">Aparece na TV, abaixo do QR Code.</p>
            </div>
          )}
          {error && <div className="mt-4"><Notice>{errorText(error)}</Notice></div>}
          <Button type="submit" busy={busy} disabled={!name.trim() || (askCode && !code.trim())} className="mt-5 w-full">
            Entrar na festa
          </Button>
          <p className="mt-4 text-center text-sm text-bark-soft">
            Sem cadastro. Fotos e recados aprovados pelos pais poderão aparecer na TV da festa.
          </p>
        </form>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ tela inicial

function Home({ me, onRename, live, roundOpen, go }: {
  me: Participant; onRename: (p: Participant) => void; live: Live; roundOpen: boolean; go: (v: View) => void;
}) {
  const ev = live.event;
  const closed = Boolean(ev?.is_closed);
  const [renaming, setRenaming] = useState(false);

  return (
    <div className="anim-fade">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="font-hand m-0 text-[1.7rem] text-bark">Chá da Hazel</p>
          {!renaming && (
            <p className="m-0 text-bark-soft">
              Olá, <strong className="text-bark">{me.name}</strong>.{' '}
              <button type="button" onClick={() => setRenaming(true)} className="min-h-11 font-bold text-leaf-deep underline underline-offset-4">
                Corrigir nome
              </button>
            </p>
          )}
        </div>
        <div className="-mt-1 shrink-0"><Sunflower size={62} seed={me.id} stem={0.7} /></div>
      </header>

      {renaming && <RenameForm me={me} onDone={(p) => { if (p) onRename(p); setRenaming(false); }} />}

      <div className="mt-2 min-h-8"><ConnectionBadge online={live.online} /></div>

      {closed && (
        <div className="mb-4">
          <Notice tone="info">
            O chá foi encerrado. Obrigado por fazer parte deste dia — tudo o que você enviou ficou guardado para os pais.
          </Notice>
        </div>
      )}

      <nav aria-label="Atividades" className="mt-2 grid gap-3">
        <ActivityButton
          title="Recado para a Hazel" hint="Escreva uma mensagem e plante seu girassol no jardim"
          state={closed ? 'Encerrado' : ev && !ev.messages_open ? 'Fechado agora' : null}
          icon={<IconLetter />} onClick={() => go('message')}
        />
        <ActivityButton
          title="Álbum da festa" hint="Envie fotos de hoje para a TV"
          state={closed ? 'Encerrado' : ev && !ev.photos_open ? 'Fechado agora' : null}
          icon={<IconCamera />} onClick={() => go('album')}
        />
        <ActivityButton
          title="Palpites da Hazel" hint="Dia, peso, altura e com quem ela vai parecer"
          state={closed ? 'Encerrado' : ev && !ev.guesses_open ? 'Fechado agora' : null}
          icon={<IconStar />} onClick={() => go('guess')}
        />
        <ActivityButton
          title="Quiz dos papais" hint={roundOpen ? 'Tem pergunta no ar agora' : 'As perguntas aparecem aqui e na TV'}
          state={closed ? 'Encerrado' : roundOpen ? 'No ar' : null} highlight={roundOpen}
          icon={<IconQuestion />} onClick={() => go('quiz')}
        />
        {closed && ev?.guest_gallery_enabled && (
          <ActivityButton
            title="Lembranças do chá" hint="Recados e fotos que apareceram na TV"
            state={null} icon={<IconHeart />} onClick={() => go('memories')}
          />
        )}
      </nav>
    </div>
  );
}

function RenameForm({ me, onDone }: { me: Participant; onDone: (p: Participant | null) => void }) {
  const [name, setName] = useState(me.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await renameMe(name));
    } catch (err) {
      setError(errorCode(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="anim-rise mt-3 rounded-3xl border border-butter-deep bg-paper p-4">
      <label htmlFor="novo-nome" className="mb-1 block font-bold">Seu nome</label>
      <input id="novo-nome" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} autoFocus
        className="w-full rounded-2xl border-2 border-butter-deep bg-paper px-4 py-3 text-lg" />
      <p className="m-0 mt-1 text-sm text-bark-soft">
        Vale para os próximos envios. No jardim da TV, o nome muda quando um novo recado seu for aprovado.
      </p>
      {error && <div className="mt-3"><Notice>{errorText(error)}</Notice></div>}
      <div className="mt-3 flex gap-2">
        <Button type="submit" busy={busy} disabled={!name.trim()} className="flex-1">Salvar nome</Button>
        <Button type="button" variant="soft" onClick={() => onDone(null)} disabled={busy}>Cancelar</Button>
      </div>
    </form>
  );
}

function ActivityButton({ title, hint, state, icon, onClick, highlight = false }: {
  title: string; hint: string; state: string | null; icon: ReactNode; onClick: () => void; highlight?: boolean;
}) {
  return (
    <button
      type="button" onClick={onClick}
      className={`flex min-h-[5.5rem] w-full items-center gap-4 rounded-3xl border-2 px-4 py-4 text-left transition active:scale-[0.99]
        ${highlight ? 'border-petal-deep bg-butter' : 'border-butter-deep/70 bg-paper'}`}
    >
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-butter text-seed" aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xl font-bold leading-tight text-bark">{title}</span>
        <span className="block text-base leading-snug text-bark-soft">{hint}</span>
      </span>
      {state && (
        <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${highlight ? 'bg-petal text-bark' : 'bg-leaf-soft text-leaf-deep'}`}>
          {state}
        </span>
      )}
    </button>
  );
}

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const IconLetter = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" {...stroke}><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="m4 7.5 8 6 8-6" /></svg>
);
const IconCamera = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" {...stroke}><path d="M4 8.5h3l1.5-2.5h7L17 8.5h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13.2" r="3.4" /></svg>
);
const IconStar = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" {...stroke}><path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8L12 3.5Z" /></svg>
);
const IconQuestion = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.3c-.7.4-1.1.9-1.1 1.7" /><path d="M12 17h.01" /></svg>
);
const IconHeart = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" {...stroke}><path d="M12 20s-7-4.4-7-9.6A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.4C19 15.6 12 20 12 20Z" /></svg>
);

// ------------------------------------------------------------------ lembranças (só se os pais liberarem, após o evento)

function Memories() {
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [messages, setMessages] = useState<Message[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setState('loading');
    try {
      const [m, p] = await Promise.all([approvedMessages(), approvedPhotos()]);
      setMessages(m);
      setPhotos(p);
      setUrls(await photoUrls(p.map((x) => x.storage_path)));
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (state === 'loading') return <p className="text-bark-soft">Carregando lembranças…</p>;
  if (state === 'error') return <Notice onRetry={() => void load()}>{errorText('network')}</Notice>;
  if (messages.length === 0 && photos.length === 0) {
    return <Empty title="Ainda não há lembranças aqui">Volte mais tarde.</Empty>;
  }
  return (
    <div className="grid gap-6">
      {photos.length > 0 && (
        <section aria-label="Fotos">
          <div className="grid grid-cols-2 gap-3">
            {photos.map((p) => (
              <figure key={p.id} className="m-0 rounded-2xl bg-paper p-2 shadow-sm">
                {urls[p.storage_path] && (
                  <img src={urls[p.storage_path]} alt={p.caption || `Foto enviada por ${p.author_name}`} loading="lazy"
                    className="aspect-square w-full rounded-xl bg-butter/40 object-contain" />
                )}
                <figcaption className="px-1 pt-1 text-sm text-bark-soft">{p.caption ? `${p.caption} — ` : ''}{p.author_name}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
      <section aria-label="Recados" className="grid gap-3">
        {messages.map((m) => (
          <blockquote key={m.id} className="m-0 rounded-2xl bg-paper p-4 shadow-sm">
            <p className="m-0 whitespace-pre-wrap text-lg">{m.body}</p>
            <footer className="mt-2 text-bark-soft">{m.author_name}</footer>
          </blockquote>
        ))}
      </section>
    </div>
  );
}
