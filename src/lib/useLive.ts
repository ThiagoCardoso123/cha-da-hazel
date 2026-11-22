import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchEvent, fetchRound, serverTime, subscribeLive } from './api';
import type { EventState, Round } from './types';

export interface Live {
  event: EventState | null;
  round: Round | null;
  /** canal de tempo real conectado e última consulta bem-sucedida */
  online: boolean;
  /** relógio do servidor em ms (corrige relógio errado do aparelho) */
  now: () => number;
  /** muda quando chega aviso de fila (só pais) */
  queueTick: number;
  refresh: () => Promise<void>;
  setEvent: (e: EventState) => void;
}

/**
 * Estado ao vivo compartilhado por celular, TV e painel.
 * Três camadas, para aguentar internet instável:
 *  1. tempo real (Supabase Realtime), com reconexão automática;
 *  2. nova consulta completa sempre que o canal reconecta, a aba volta
 *     ao primeiro plano ou o aparelho volta a ficar online;
 *  3. consulta de segurança a cada 15 s, caso um aviso se perca.
 */
export function useLive(enabled: boolean, opts: { admin?: boolean } = {}): Live {
  const [event, setEventState] = useState<EventState | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [channelUp, setChannelUp] = useState(false);
  const [fetchOk, setFetchOk] = useState(true);
  const [browserOnline, setBrowserOnline] = useState(navigator.onLine);
  const [queueTick, setQueueTick] = useState(0);
  const offset = useRef(0);
  const roundId = useRef<string | null>(null);
  const admin = Boolean(opts.admin);

  const syncClock = useCallback(async () => {
    const t0 = Date.now();
    const server = await serverTime();
    const t1 = Date.now();
    offset.current = server - (t0 + t1) / 2;
  }, []);

  const loadRound = useCallback(async (id: string | null) => {
    roundId.current = id;
    if (!id) {
      setRound(null);
      return;
    }
    const r = await fetchRound(id);
    if (roundId.current === id) setRound(r);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const e = await fetchEvent();
      setEventState(e);
      await loadRound(e.current_round_id);
      setFetchOk(true);
    } catch {
      setFetchOk(false);
    }
  }, [loadRound]);

  const applyEvent = useCallback((e: EventState) => {
    setEventState(e);
    if (e.current_round_id !== roundId.current) void loadRound(e.current_round_id).catch(() => undefined);
  }, [loadRound]);

  useEffect(() => {
    if (!enabled) return;
    void syncClock().catch(() => undefined);
    void refresh();

    const stop = subscribeLive({
      onEvent: applyEvent,
      onRound: (r) => {
        if (r.id === roundId.current) setRound(r);
      },
      onStatus: (up) => {
        setChannelUp(up);
        if (up) {
          void refresh();
          void syncClock().catch(() => undefined);
        }
      },
      onQueue: admin ? () => setQueueTick((n) => n + 1) : undefined,
    });

    const poll = window.setInterval(() => void refresh(), 15000);
    const onOnline = () => {
      setBrowserOnline(true);
      void refresh();
    };
    const onOffline = () => setBrowserOnline(false);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stop();
      window.clearInterval(poll);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, admin, applyEvent, refresh, syncClock]);

  const now = useCallback(() => Date.now() + offset.current, []);

  return {
    event,
    round,
    online: browserOnline && fetchOk && channelUp,
    now,
    queueTick,
    refresh,
    setEvent: applyEvent,
  };
}

/** Segundos restantes de uma rodada, pelo relógio do servidor. */
export function useCountdown(closesAt: string | null, now: () => number): number {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!closesAt) {
      setLeft(0);
      return;
    }
    const end = new Date(closesAt).getTime();
    const tick = () => setLeft(Math.max(0, Math.ceil((end - now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [closesAt, now]);
  return left;
}
