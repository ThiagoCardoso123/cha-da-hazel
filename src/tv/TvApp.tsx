import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  approvedMessages, approvedPhotos, configured, ensureAnonSession, errorCode, fetchFlowers, initApi,
  photoUrls, tvClaim, tvJoinCode, whoami,
} from '../lib/api';
import { PUBLIC_URL } from '../lib/supabase';
import type { Flower, Message, Photo } from '../lib/types';
import { useLive } from '../lib/useLive';
import { errorText } from '../lib/util';
import { ArtDefs, Rainbow, Sunflower } from '../art/Art';
import { Button, Loading, NotConfigured, Notice } from '../ui';
import { ClosingMode, GardenMode } from './Garden';
import { AlbumMode, GuessesMode, QuizMode } from './Modes';

import { STAGE_H, STAGE_W, type TvContent } from './shared';

export default function TvApp() {
  const [boot, setBoot] = useState<'loading' | 'pair' | 'error' | 'ready'>('loading');
  const [bootError, setBootError] = useState('server');
  const [joinCode, setJoinCode] = useState('');

  const start = useCallback(async (typedKey?: string) => {
    setBoot('loading');
    try {
      initApi('tv');
      await ensureAnonSession();
      let who = await whoami();
      if (!who.is_tv && !who.is_admin) {
        const key = typedKey ?? new URLSearchParams(window.location.search).get('k') ?? '';
        if (!key) return setBoot('pair');
        await tvClaim(key);
        who = await whoami();
      }
      // a chave sai do endereço: não fica visível na TV nem no histórico
      window.history.replaceState(null, '', window.location.pathname);
      setJoinCode(await tvJoinCode());
      setBoot('ready');
    } catch (e) {
      const code = errorCode(e);
      setBootError(code);
      setBoot(code === 'invalid_key' || code === 'too_many_attempts' ? 'pair' : 'error');
    }
  }, []);

  useEffect(() => {
    if (configured) void start();
  }, [start]);

  if (!configured) return <NotConfigured />;
  if (boot === 'loading') return <Loading label="Preparando o Jardim da Hazel…" />;
  if (boot === 'pair') return <Pairing error={bootError === 'server' ? null : bootError} onSubmit={(k) => void start(k)} />;
  if (boot === 'error') {
    return (
      <div className="flex h-full items-center justify-center bg-cream p-8">
        <div className="max-w-md"><Notice onRetry={() => void start()}>{errorText(bootError)}</Notice></div>
      </div>
    );
  }
  return <Screen joinCode={joinCode} />;
}

function Pairing({ error, onSubmit }: { error: string | null; onSubmit: (key: string) => void }) {
  const [key, setKey] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (key.trim()) onSubmit(key.trim());
  };
  return (
    <div className="paper relative flex h-full items-center justify-center bg-cream p-8">
      <ArtDefs />
      <form onSubmit={submit} className="relative w-full max-w-lg rounded-3xl bg-paper p-8 text-center shadow-sm">
        <Sunflower size={90} />
        <h1 className="font-hand m-0 text-4xl">Ligar esta tela</h1>
        <p className="mt-1 text-bark-soft">
          No painel dos pais, abra a aba TV e use “Abrir a TV neste aparelho” ou copie a chave da TV para cá.
        </p>
        <label htmlFor="chave" className="sr-only">Chave da TV</label>
        <input id="chave" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false}
          placeholder="Chave da TV" className="mt-4 w-full rounded-2xl border-2 border-butter-deep bg-paper px-4 py-3 text-center text-xl" />
        {error && <div className="mt-4 text-left"><Notice>{errorText(error)}</Notice></div>}
        <Button type="submit" className="mt-5 w-full" disabled={!key.trim()}>Ligar a TV</Button>
      </form>
    </div>
  );
}

// ------------------------------------------------------------------ conteúdo aprovado

function useTvContent(version: number | undefined): TvContent {
  const [flowers, setFlowers] = useState<Flower[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [queueSignal, setQueueSignal] = useState(0);
  const queue = useRef<Message[]>([]);
  const seenMessages = useRef<Set<string> | null>(null);
  const seenFlowers = useRef<Set<string> | null>(null);
  const urlsRef = useRef<Record<string, string>>({});
  const urlsAt = useRef(0);
  const loading = useRef(false);

  const load = useCallback(async (forceUrls = false) => {
    if (loading.current) return;
    loading.current = true;
    try {
      const [f, m, p] = await Promise.all([fetchFlowers(), approvedMessages(), approvedPhotos()]);

      // Recados novos entram na fila; os que já existiam quando a TV abriu, não.
      const approvedIds = new Set(m.map((x) => x.id));
      if (seenMessages.current === null) {
        seenMessages.current = approvedIds;
      } else {
        const news = m.filter((x) => !seenMessages.current!.has(x.id));
        news.forEach((x) => seenMessages.current!.add(x.id));
        // Muitas aprovações de uma vez: só as 8 mais recentes ganham cartão imediato.
        // As demais continuam no rodízio normal do jardim, sem sequência interminável.
        queue.current = [...queue.current, ...news].filter((x) => approvedIds.has(x.id)).slice(-8);
        if (news.length) setQueueSignal((n) => n + 1);
      }

      if (seenFlowers.current === null) {
        seenFlowers.current = new Set(f.map((x) => x.participant_id));
      } else {
        const born = f.filter((x) => !seenFlowers.current!.has(x.participant_id)).map((x) => x.participant_id);
        if (born.length) {
          born.forEach((id) => seenFlowers.current!.add(id));
          setFresh(new Set(born));
          window.setTimeout(() => setFresh(new Set()), 6000);
        }
      }

      setFlowers(f);
      setMessages(m);
      setPhotos(p);

      // Endereços assinados valem 1 h: renova os que faltam e todos a cada 40 min.
      const stale = forceUrls || Date.now() - urlsAt.current > 40 * 60 * 1000;
      const need = p.map((x) => x.storage_path).filter((path) => stale || !urlsRef.current[path]);
      if (need.length) {
        const signed = await photoUrls(need);
        urlsRef.current = stale ? signed : { ...urlsRef.current, ...signed };
        if (stale) urlsAt.current = Date.now();
        setUrls(urlsRef.current);
      }
    } catch {
      /* sem conexão: mantém o que já está na tela e tenta de novo no próximo ciclo */
    } finally {
      loading.current = false;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, version]);

  useEffect(() => {
    const id = window.setInterval(() => void load(), 20000);
    const onOnline = () => void load();
    window.addEventListener('online', onOnline);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('online', onOnline);
    };
  }, [load]);

  const reloadUrls = useCallback(() => void load(true), [load]);
  return { flowers, messages, photos, urls, queue, queueSignal, fresh, reloadUrls };
}

// ------------------------------------------------------------------ palco 16:9

function Screen({ joinCode: initialCode }: { joinCode: string }) {
  const live = useLive(true);
  const [joinCode, setJoinCode] = useState(initialCode);

  // Se os pais trocarem o código do evento, o QR Code acompanha em até 1 minuto.
  useEffect(() => {
    const id = window.setInterval(() => {
      tvJoinCode().then(setJoinCode).catch(() => undefined);
    }, 60000);
    return () => window.clearInterval(id);
  }, []);
  const content = useTvContent(live.event?.content_version);
  const [scale, setScale] = useState(1);
  const [controls, setControls] = useState(true);
  const [isFull, setIsFull] = useState(Boolean(document.fullscreenElement));
  const [offlineShown, setOfflineShown] = useState(false);

  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  }, []);

  useEffect(() => {
    let hide = window.setTimeout(() => setControls(false), 8000);
    const wake = () => {
      setControls(true);
      window.clearTimeout(hide);
      hide = window.setTimeout(() => setControls(false), 4000);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') toggleFull();
    };
    const onFull = () => setIsFull(Boolean(document.fullscreenElement));
    window.addEventListener('mousemove', wake);
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFull);
    return () => {
      window.clearTimeout(hide);
      window.removeEventListener('mousemove', wake);
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFull);
    };
  }, [toggleFull]);

  // Pede ao navegador para não apagar a tela (quando ele permite).
  useEffect(() => {
    type Lock = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Lock> } };
    let lock: Lock | null = null;
    const ask = () => {
      if (document.visibilityState === 'visible' && nav.wakeLock) {
        nav.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => undefined);
      }
    };
    ask();
    document.addEventListener('visibilitychange', ask);
    return () => {
      document.removeEventListener('visibilitychange', ask);
      void lock?.release().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (live.online) return setOfflineShown(false);
    const id = window.setTimeout(() => setOfflineShown(true), 6000);
    return () => window.clearTimeout(id);
  }, [live.online]);

  const ev = live.event;
  const mode = ev?.tv_mode ?? 'garden';
  const showQr = Boolean(ev && !ev.is_closed && mode !== 'closing');

  return (
    <div className={`fixed inset-0 overflow-hidden bg-[#f6ecd0] ${controls ? '' : 'cursor-none'}`}>
      <ArtDefs />
      <div
        className="paper absolute left-1/2 top-1/2 overflow-hidden bg-cream"
        style={{ width: STAGE_W, height: STAGE_H, transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        <Sky rainbow={mode === 'garden' || mode === 'closing'} />
        <div key={mode} className="anim-fade absolute inset-0">
          {mode === 'garden' && <GardenMode content={content} seconds={ev?.message_seconds ?? 10} />}
          {mode === 'album' && <AlbumMode content={content} seconds={ev?.photo_seconds ?? 7} />}
          {mode === 'quiz' && <QuizMode live={live} />}
          {mode === 'guesses' && <GuessesMode />}
          {mode === 'closing' && <ClosingMode content={content} />}
        </div>

        {mode !== 'closing' && <Title compact={mode !== 'garden'} />}
        {showQr && <QrCard joinCode={joinCode} />}

        {offlineShown && (
          <div role="status" className="anim-fade absolute bottom-[54px] left-[96px] flex items-center gap-3 rounded-full bg-paper/90 px-6 py-3 text-[24px] text-bark-soft">
            <span className="inline-block h-3 w-3 rounded-full bg-petal-deep" aria-hidden="true" />
            Reconectando. A tela continua de onde parou.
          </div>
        )}
      </div>

      <div className={`absolute bottom-4 left-4 flex max-w-md flex-col gap-2 rounded-2xl bg-paper/95 p-4 text-sm text-bark shadow-lg transition-opacity duration-500
        ${controls ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        <Button onClick={toggleFull} className="min-h-10 text-base">
          {isFull ? 'Sair da tela cheia' : 'Entrar em tela cheia'} (tecla F)
        </Button>
        <p className="m-0 text-bark-soft">
          Deixe esta aba aberta. O modo da TV é trocado pelo painel dos pais, no celular. Este aviso some sozinho.
        </p>
      </div>
    </div>
  );
}

function Sky({ rainbow }: { rainbow: boolean }) {
  return (
    <div className="absolute inset-0" aria-hidden="true">
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #fff6d8 0%, #fffaea 45%, #fffdf3 100%)' }} />
      <div className="absolute transition-opacity duration-1000" style={{ left: 1010, top: 356, opacity: rainbow ? 1 : 0 }}>
        <Rainbow width={430} opacity={0.7} />
      </div>
      <svg className="absolute inset-0" width={STAGE_W} height={STAGE_H} viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}>
        <g filter="url(#aquarela-forte)">
          <path d="M-40 640 C 240 540, 520 600, 800 570 S 1380 520, 1960 610 V 1120 H -40 Z" fill="#dfebcf" opacity="0.9" />
          <path d="M-40 700 C 320 640, 640 690, 980 650 S 1620 640, 1960 680 V 1120 H -40 Z" fill="#d0e2bd" opacity="0.9" />
        </g>
      </svg>
    </div>
  );
}

function Title({ compact }: { compact: boolean }) {
  return (
    <div className="absolute" style={{ left: 96, top: compact ? 34 : 46 }}>
      <p className="font-hand m-0 text-bark" style={{ fontSize: compact ? 64 : 118, lineHeight: 1.45 }}>Chá da Hazel</p>
      {!compact && (
        <p className="m-0 text-bark-soft" style={{ fontSize: 34, marginTop: -8, maxWidth: 900 }}>
          Hoje, cada um de vocês faz parte da nossa história.
        </p>
      )}
    </div>
  );
}

function QrCard({ joinCode }: { joinCode: string }) {
  const url = `${PUBLIC_URL}/?c=${encodeURIComponent(joinCode)}`;
  const short = PUBLIC_URL.replace(/^https?:\/\//, '');
  return (
    <div className="absolute rounded-[36px] bg-paper text-center shadow-[0_6px_0_rgba(138,90,59,0.12)]"
      style={{ right: 96, top: 54, width: 330, padding: '26px 24px 22px' }}>
      <p className="m-0 font-bold text-bark" style={{ fontSize: 30, lineHeight: 1.15 }}>Participe pelo celular</p>
      <div className="mx-auto mt-4 rounded-2xl bg-white p-3" style={{ width: 254 }}>
        <QRCodeSVG value={url} size={230} level="M" bgColor="#ffffff" fgColor="#3d2c1f" />
      </div>
      <p className="m-0 mt-3 break-all text-bark" style={{ fontSize: short.length > 24 ? 20 : 24, lineHeight: 1.2 }}>{short}</p>
      <p className="m-0 mt-1 text-bark-soft" style={{ fontSize: 22 }}>
        código <strong className="tracking-widest text-bark" style={{ fontSize: 28 }}>{joinCode}</strong>
      </p>
    </div>
  );
}
