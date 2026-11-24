import { useEffect, useMemo, useRef, useState } from 'react';
import type { Flower, Message } from '../lib/types';
import { hash } from '../lib/util';
import { Bee, SunflowerHead } from '../art/Art';
import { STAGE_H, STAGE_W, type TvContent } from './shared';

// ------------------------------------------------------------------ canteiros

/**
 * Três fileiras desencontradas, 7 flores cada. Os lugares são fixos e largos
 * o bastante para que as plaquinhas de nome nunca se encostem.
 */
const ROWS = [
  { y: 610, base: 742, scale: 0.84, x0: 230 }, // fundo
  { y: 765, base: 897, scale: 0.92, x0: 350 }, // meio
  { y: 920, base: 1052, scale: 1.0, x0: 230 }, // frente
];
const SLOT_GAP = 240;
const CENTER_OUT = [3, 2, 4, 1, 5, 0, 6];
export const PER_PAGE = 21;

/** Ordem de plantio: do centro para as bordas, da frente para o fundo. */
const SLOTS = [2, 1, 0].flatMap((row) => CENTER_OUT.map((col) => ({ row, col })));

function Bed({ index }: { index: number }) {
  const paths = [
    'M-40 742 C 300 716, 620 752, 960 730 S 1640 722, 1960 744 V 1120 H -40 Z',
    'M-40 898 C 280 880, 700 908, 1020 888 S 1600 876, 1960 900 V 1120 H -40 Z',
    'M-40 1050 C 360 1034, 760 1056, 1100 1040 S 1700 1036, 1960 1052 V 1120 H -40 Z',
  ];
  const fills = ['#bdd6a8', '#a9c893', '#96b97f'];
  return (
    <svg className="absolute inset-0" width={STAGE_W} height={STAGE_H} viewBox={`0 0 ${STAGE_W} ${STAGE_H}`} aria-hidden="true">
      <path d={paths[index]} fill={fills[index]} filter="url(#aquarela)" />
    </svg>
  );
}

/** Onde fica a flor que ocupa a posição `index` (0–20) da página. */
export function spotOf(flower: Flower, index: number) {
  const slot = SLOTS[index % PER_PAGE];
  const row = ROWS[slot.row];
  const r = hash(flower.participant_id);
  return {
    slot,
    row,
    r,
    size: Math.round(124 * row.scale),
    x: row.x0 + slot.col * SLOT_GAP + Math.round((r - 0.5) * 26),
    y: row.y + Math.round((hash(flower.participant_id + 'y') - 0.5) * 18),
  };
}

function Planted({ flower, index, fresh }: { flower: Flower; index: number; fresh: boolean }) {
  const { row, r, size, x, y } = spotOf(flower, index);
  const stemH = row.base - y + 20;
  return (
    <div className="absolute" style={{ left: x - 110, top: y - size / 2, width: 220, height: size / 2 + stemH }}>
      <div
        className={`absolute inset-0 ${fresh ? '' : 'anim-sway'}`}
        style={{ willChange: 'transform', animationDuration: `${6 + r * 4}s`, animationDelay: `${-r * 5}s` }}
      >
        <svg className={`absolute ${fresh ? 'anim-grow' : ''}`} style={{ left: 60, top: size / 2 - 4 }} width={100} height={stemH}
          viewBox={`0 0 100 ${stemH}`} aria-hidden="true">
          <path d={`M50 0 C 46 ${stemH * 0.3}, 54 ${stemH * 0.6}, 50 ${stemH}`} stroke="#7d9a6a" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d={`M50 ${stemH * 0.74} C 30 ${stemH * 0.62}, 12 ${stemH * 0.68}, 8 ${stemH * 0.82} C 26 ${stemH * 0.88}, 42 ${stemH * 0.84}, 50 ${stemH * 0.74} Z`} fill="#a9c296" />
          <path d={`M50 ${stemH * 0.84} C 70 ${stemH * 0.72}, 88 ${stemH * 0.78}, 92 ${stemH * 0.92} C 74 ${stemH * 0.98}, 58 ${stemH * 0.94}, 50 ${stemH * 0.84} Z`} fill="#93b07f" />
        </svg>
        <div className={`absolute ${fresh ? 'anim-bloom' : ''}`}
          style={{ left: 110 - size / 2, top: 0, width: size, height: size, animationDelay: fresh ? '0.7s' : undefined }}>
          <SunflowerHead size={size} seed={flower.participant_id} />
        </div>
      </div>
      <div className="absolute left-0 flex w-full justify-center" style={{ top: size - 2 }}>
        <div
          className={`max-w-[204px] truncate rounded-full bg-paper px-4 text-center font-bold text-bark shadow-[0_2px_0_rgba(138,90,59,0.18)] ${fresh ? 'anim-rise' : ''}`}
          style={{ fontSize: Math.round(27 * row.scale), lineHeight: '38px', animationDelay: fresh ? '1.6s' : undefined }}
        >
          {flower.name}
        </div>
      </div>
    </div>
  );
}

/**
 * Jardim paginado: 21 flores por página, páginas alternando sozinhas.
 * `focusId` leva o jardim à página daquela flor e segura a troca enquanto durar.
 */
export function FlowerField({ flowers, fresh, pagerTop = 296, focusId = null, roamingBee = false }: {
  flowers: Flower[]; fresh: Set<string>; pagerTop?: number; focusId?: string | null; roamingBee?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(flowers.length / PER_PAGE));
  const [page, setPage] = useState(0);
  const held = useRef(false);
  held.current = focusId !== null;

  useEffect(() => {
    if (pages <= 1) return;
    const id = window.setInterval(() => {
      if (!held.current) setPage((p) => (p + 1) % pages);
    }, 14000);
    return () => window.clearInterval(id);
  }, [pages]);

  // Flor nova ou flor em foco: mostra a página onde ela está.
  useEffect(() => {
    const idx = focusId !== null
      ? flowers.findIndex((f) => f.participant_id === focusId)
      : fresh.size > 0 ? flowers.findIndex((f) => fresh.has(f.participant_id)) : -1;
    if (idx >= 0) setPage(Math.floor(idx / PER_PAGE));
  }, [fresh, flowers, focusId]);

  const current = Math.min(page, pages - 1);
  const visible = flowers.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE);
  const byRow = (row: number) => visible.map((f, i) => ({ f, i })).filter((x) => SLOTS[x.i].row === row);

  return (
    <div className="absolute inset-0">
      {[0, 1, 2].map((row) => (
        <div key={row} className="absolute inset-0">
          <div key={current} className="anim-fade absolute inset-0">
            {byRow(row).map(({ f, i }) => (
              <Planted key={f.participant_id} flower={f} index={i} fresh={fresh.has(f.participant_id)} />
            ))}
          </div>
          <Bed index={row} />
        </div>
      ))}
      {roamingBee && flowers.length > 0 && (
        <div className="bee absolute left-0 top-0">
          <div className="bee-bob"><Bee /></div>
        </div>
      )}
      {pages > 1 && (
        <p className="absolute m-0 rounded-full bg-paper/85 px-5 text-bark-soft" style={{ left: 96, top: pagerTop, fontSize: 24, lineHeight: '44px' }}>
          Jardim {current + 1} de {pages} ({flowers.length} girassóis)
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ modo 1: jardim ao vivo

function MessageCard({ message }: { message: Message }) {
  const len = message.body.length;
  const fontSize = len <= 70 ? 66 : len <= 140 ? 54 : len <= 210 ? 46 : 40;
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ paddingRight: 300, paddingTop: 120 }}>
      <div className="anim-fade absolute inset-0 bg-cream/60" />
      <figure className="anim-card relative m-0 rounded-[44px] bg-paper shadow-[0_10px_0_rgba(138,90,59,0.14)]"
        style={{ width: 1180, padding: '64px 76px 52px', transform: 'rotate(-0.6deg)' }}>
        <div className="absolute" style={{ right: 44, top: -58 }}><SunflowerHead size={128} seed={message.participant_id} /></div>
        <blockquote className="m-0 whitespace-pre-wrap break-words text-bark" style={{ fontSize, lineHeight: 1.28 }}>
          {message.body}
        </blockquote>
        <figcaption className="font-hand mt-6 text-leaf-deep" style={{ fontSize: 52 }}>{message.author_name}</figcaption>
      </figure>
    </div>
  );
}

const FLIGHT_MS = 2600;
const skySpot = () => ({ x: 260 + Math.random() * 1000, y: 430 + Math.random() * 70 });

export function GardenMode({ content, seconds }: { content: TvContent; seconds: number }) {
  const { flowers, messages, queue, queueSignal, fresh } = content;
  const [card, setCard] = useState<Message | null>(null);
  /** recado escolhido, enquanto a abelha voa até a flor de quem escreveu */
  const [chosen, setChosen] = useState<Message | null>(null);
  const [bee, setBee] = useState({ x: -90, y: 480, left: false });
  const [tick, setTick] = useState(0);
  const idle = useRef(0);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const flowersRef = useRef(flowers);
  flowersRef.current = flowers;

  const flyTo = (to: { x: number; y: number }) => setBee((b) => ({ x: to.x, y: to.y, left: to.x < b.x }));

  // Recado retirado pelos pais enquanto está na tela (ou a caminho): sai na hora.
  useEffect(() => {
    if (card && !messages.some((m) => m.id === card.id)) setCard(null);
    if (chosen && !messages.some((m) => m.id === chosen.id)) setChosen(null);
  }, [messages, card, chosen]);

  /**
   * A abelha escolhe: voa até o girassol de quem escreveu, pousa, e o recado se abre.
   * Um cartão por vez. Novidades primeiro; sem novidades, ela visita recados já enviados.
   * Com fila longa, cada cartão fica menos tempo, para a sequência não se arrastar.
   */
  useEffect(() => {
    if (card) {
      const backlog = queue.current.length;
      const show = backlog > 4 ? Math.max(4, seconds * 0.5) : backlog > 1 ? Math.max(5, seconds * 0.75) : seconds;
      const id = window.setTimeout(() => {
        setCard(null);
        flyTo(skySpot());
      }, show * 1000);
      return () => window.clearTimeout(id);
    }
    if (chosen) {
      const id = window.setTimeout(() => {
        setCard(chosen);
        setChosen(null);
      }, FLIGHT_MS + 900);
      return () => window.clearTimeout(id);
    }
    const wait = queue.current.length > 0 ? 1500 : 7000;
    const id = window.setTimeout(() => {
      let next = queue.current.shift();
      if (!next) {
        const all = messagesRef.current;
        if (all.length === 0) return setTick((n) => n + 1);
        idle.current = (idle.current + 1) % all.length;
        next = all[idle.current];
      }
      const author = next.participant_id;
      const index = flowersRef.current.findIndex((f) => f.participant_id === author);
      if (index < 0) return setCard(next);
      const spot = spotOf(flowersRef.current[index], index);
      flyTo({ x: spot.x - 24, y: spot.y - spot.size / 2 - 22 });
      setChosen(next);
    }, wait);
    return () => window.clearTimeout(id);
  }, [card, chosen, tick, queueSignal, seconds, queue]);

  const focus = chosen ?? card;
  return (
    <div className="absolute inset-0">
      <FlowerField flowers={flowers} fresh={fresh} focusId={focus ? focus.participant_id : null} />
      {flowers.length > 0 && (
        <div className="absolute left-0 top-0" aria-hidden="true"
          style={{ transform: `translate(${bee.x}px, ${bee.y}px)`, transition: `transform ${FLIGHT_MS}ms cubic-bezier(0.45, 0.05, 0.3, 1)`, willChange: 'transform' }}>
          <div style={{ transform: bee.left ? 'scaleX(-1)' : undefined }}>
            <div className={card ? '' : 'bee-bob'}><Bee /></div>
          </div>
        </div>
      )}
      {flowers.length === 0 && !card && (
        <div className="absolute text-center" style={{ left: 300, right: 520, top: 360 }}>
          <p className="font-hand m-0 text-bark" style={{ fontSize: 58 }}>O jardim espera o primeiro girassol</p>
          <p className="m-0 text-bark-soft" style={{ fontSize: 32 }}>
            Aponte a câmera para o QR Code e escreva um recado para a Hazel. Cada recado faz nascer uma flor com o seu nome.
          </p>
        </div>
      )}
      {card && <MessageCard key={card.id} message={card} />}
    </div>
  );
}

// ------------------------------------------------------------------ modo 5: encerramento

export function ClosingMode({ content }: { content: TvContent }) {
  const none = useMemo(() => new Set<string>(), []);
  return (
    <div className="absolute inset-0">
      <FlowerField flowers={content.flowers} fresh={none} pagerTop={430} roamingBee />
      <p className="font-hand anim-fade absolute m-0 text-bark-soft" style={{ right: 96, top: 40, fontSize: 30, animationDelay: '1.2s' }}>
        <span className="rounded-full bg-paper/85 px-6 py-1">Desenvolvido pelo papai ♥</span>
      </p>
      <div className="absolute text-center" style={{ left: 120, right: 120, top: 70 }}>
        <p className="font-hand anim-rise m-0 text-bark" style={{ fontSize: 88, lineHeight: 1.5 }}>
          Hazel, antes mesmo de chegar,
          <br />
          você já está cercada de amor.
        </p>
        <p className="anim-rise m-0 text-bark-soft" style={{ fontSize: 34, animationDelay: '0.6s' }}>
          {content.flowers.length > 1
            ? `Obrigado a cada um dos ${content.flowers.length} que plantaram um girassol neste jardim.`
            : 'Obrigado por fazerem parte deste dia.'}
        </p>
      </div>
    </div>
  );
}
