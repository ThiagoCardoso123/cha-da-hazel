import { useEffect, useState } from 'react';
import { guessSummary } from '../lib/api';
import type { GuessSummary, Photo } from '../lib/types';
import { useCountdown, type Live } from '../lib/useLive';
import { formatCm, formatDay, formatKg, percent } from '../lib/util';
import { OPTION_STYLES } from '../guest/Activities';
import { TvEmpty, type TvContent } from './shared';

// ------------------------------------------------------------------ modo 2: álbum

export function AlbumMode({ content, seconds }: { content: TvContent; seconds: number }) {
  const { photos, urls, reloadUrls } = content;
  const ready = photos.filter((p) => urls[p.storage_path]);
  const [index, setIndex] = useState(0);
  const count = ready.length;

  useEffect(() => {
    if (count <= 1) return;
    const id = window.setInterval(() => setIndex((i) => i + 1), seconds * 1000);
    return () => window.clearInterval(id);
  }, [count, seconds]);

  // carrega a próxima antes da troca, para a transição não piscar
  const next: Photo | undefined = count > 1 ? ready[(index + 1) % count] : undefined;
  useEffect(() => {
    if (!next) return;
    const img = new Image();
    img.src = urls[next.storage_path];
  }, [next, urls]);

  if (count === 0) {
    return (
      <TvEmpty title="O álbum começa com a sua foto">
        Abra “Álbum da festa” no celular e envie um clique de hoje. As fotos aparecem aqui depois de aprovadas.
      </TvEmpty>
    );
  }

  const photo = ready[index % count];
  return (
    <div className="absolute" style={{ left: 96, top: 170, width: 1340, height: 850 }}>
      <figure key={photo.id} className="anim-fade absolute inset-0 m-0 flex flex-col rounded-[40px] bg-paper shadow-[0_10px_0_rgba(138,90,59,0.14)]"
        style={{ padding: 28 }}>
        {/* object-contain: a foto aparece inteira, sem cortar rostos */}
        <div className="min-h-0 flex-1 overflow-hidden rounded-[24px] bg-[#f4ead0]">
          <img src={urls[photo.storage_path]} alt={photo.caption || `Foto enviada por ${photo.author_name}`}
            onError={reloadUrls} className="h-full w-full object-contain" />
        </div>
        <figcaption className="flex items-baseline justify-between gap-8 px-3 pt-4">
          <span className="min-w-0 truncate text-bark" style={{ fontSize: 36 }}>{photo.caption}</span>
          <span className="font-hand shrink-0 text-leaf-deep" style={{ fontSize: 40 }}>{photo.author_name}</span>
        </figcaption>
      </figure>
      {count > 1 && (
        <p className="absolute m-0 text-bark-soft" style={{ right: 0, top: -52, fontSize: 26 }}>
          {(index % count) + 1} de {count}
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ modo 3: quiz

export function QuizMode({ live }: { live: Live }) {
  const round = live.round;
  const left = useCountdown(round && round.status === 'open' ? round.closes_at : null, live.now);

  if (!round) {
    return (
      <TvEmpty title="Hora do quiz">
        A próxima pergunta aparece aqui e no seu celular ao mesmo tempo. Deixe “Quiz dos papais” aberto.
      </TvEmpty>
    );
  }

  const open = round.status === 'open' && left > 0;
  const revealed = round.status === 'revealed' && round.results !== null;
  const results = round.results ?? [];
  const total = revealed ? results.reduce((a, b) => a + b, 0) : round.total_votes;
  const promptSize = round.prompt.length <= 60 ? 70 : round.prompt.length <= 110 ? 58 : 48;
  const totalMs = Math.max(1, new Date(round.closes_at).getTime() - new Date(round.opened_at).getTime());
  const fraction = open ? Math.min(1, (left * 1000) / totalMs) : 0;

  return (
    <div className="absolute" style={{ left: 96, top: 170, right: 96, bottom: 70 }}>
      <div style={{ width: 1300 }}>
        <span className="inline-block rounded-full bg-leaf-soft px-6 font-bold text-leaf-deep" style={{ fontSize: 28, lineHeight: '52px' }}>
          {round.kind === 'quiz' ? 'Quiz' : 'Enquete'}
        </span>
        <h1 className="m-0 mt-3 font-bold text-bark" style={{ fontSize: promptSize, lineHeight: 1.15 }}>{round.prompt}</h1>
      </div>

      <div className="absolute grid gap-6" style={{ left: 0, top: 300, width: 1300, gridTemplateColumns: round.options.length > 2 ? '1fr 1fr' : '1fr' }}>
        {round.options.map((opt, i) => {
          const s = OPTION_STYLES[i % OPTION_STYLES.length];
          const n = results[i] ?? 0;
          const correct = revealed && round.kind === 'quiz' && round.correct_index === i;
          const dim = revealed && round.kind === 'quiz' && !correct;
          return (
            <div key={i} className="relative overflow-hidden rounded-[32px] transition-colors duration-700"
              style={{
                background: dim ? `color-mix(in srgb, ${s.bg} 38%, #fffdf5)` : s.bg, color: s.fg, padding: '26px 30px',
                outline: correct ? '8px solid #567349' : 'none', outlineOffset: -8,
              }}>
              <div className="flex items-center gap-6">
                <span className="flex shrink-0 items-center justify-center rounded-full bg-paper/85 font-bold" style={{ width: 84, height: 84, fontSize: 46 }}>
                  {s.letter}
                </span>
                <span className="min-w-0 flex-1 break-words font-bold" style={{ fontSize: round.options.length > 2 ? 42 : 52, lineHeight: 1.15 }}>{opt}</span>
                {revealed && (
                  <span className="shrink-0 text-right font-bold tabular-nums" style={{ fontSize: 50 }}>
                    {percent(n, total)}%
                    <span className="block font-normal" style={{ fontSize: 24 }}>{n} {n === 1 ? 'voto' : 'votos'}</span>
                  </span>
                )}
              </div>
              {revealed && (
                <div className="mt-4 overflow-hidden rounded-full bg-paper/60" style={{ height: 18 }} aria-hidden="true">
                  <div className="h-full rounded-full transition-[width] duration-1000" style={{ width: `${percent(n, total)}%`, background: s.fg, opacity: 0.75 }} />
                </div>
              )}
              {correct && <p className="m-0 mt-3 font-bold" style={{ fontSize: 30, color: '#3f5735' }}>Resposta certa</p>}
            </div>
          );
        })}
      </div>

      <div className="absolute flex flex-col items-center text-center" style={{ right: 0, top: 380, width: 330 }}>
        {open && (
          <div className="relative" style={{ width: 230, height: 230 }} role="timer" aria-label={`${left} segundos restantes`}>
            <svg width="230" height="230" viewBox="0 0 230 230" aria-hidden="true">
              <circle cx="115" cy="115" r="98" fill="#fffdf5" stroke="#fdf0b8" strokeWidth="18" />
              <circle cx="115" cy="115" r="98" fill="none" stroke={left <= 5 ? '#a8483f' : '#567349'} strokeWidth="18" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 98} strokeDashoffset={2 * Math.PI * 98 * (1 - fraction)}
                transform="rotate(-90 115 115)" style={{ transition: 'stroke-dashoffset 0.3s linear' }} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center font-bold tabular-nums text-bark" style={{ fontSize: 92 }}>{left}</span>
          </div>
        )}
        {!open && !revealed && (
          <p className="font-hand m-0 text-bark" style={{ fontSize: 48 }}>Tempo encerrado</p>
        )}
        <p className="m-0 mt-4 font-bold text-bark" style={{ fontSize: 44 }}>
          {total} {total === 1 ? 'resposta' : 'respostas'}
        </p>
        <p className="m-0 text-bark-soft" style={{ fontSize: 26 }}>
          {open ? 'Responda pelo celular' : revealed
            ? (round.kind === 'poll' ? 'Enquete: não há resposta certa' : 'Resultado revelado')
            : 'Aguarde a revelação'}
        </p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ modo 4: palpites

const LOOKS_LABEL = { mom: 'Mamãe', dad: 'Papai', mix: 'Mistura dos dois' } as const;
const LOOKS_COLOR = { mom: '#f3c9bf', dad: '#c5d9ea', mix: '#f7df85' } as const;

export function GuessesMode() {
  const [data, setData] = useState<GuessSummary | null>(null);

  // Os palpites individuais não chegam à TV: só este resumo, consultado a cada 8 s.
  useEffect(() => {
    let alive = true;
    const load = () => guessSummary().then((d) => { if (alive) setData(d); }).catch(() => undefined);
    void load();
    const id = window.setInterval(load, 8000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  if (!data) return null;
  if (data.total === 0 || !data.weight || !data.height) {
    return (
      <TvEmpty title="Quem arrisca o primeiro palpite?">
        Abra “Palpites da Hazel” no celular e diga o dia, o peso, a altura e com quem ela vai parecer.
      </TvEmpty>
    );
  }

  const topCount = data.dates[0]?.count ?? 0;
  const leaders = data.dates.filter((d) => d.count === topCount);
  const others = data.dates.filter((d) => d.count < topCount).slice(0, 3);
  const looksMax = Math.max(data.looks.mom, data.looks.dad, data.looks.mix);
  const looksLeaders = (['mom', 'dad', 'mix'] as const).filter((k) => data.looks[k] === looksMax && looksMax > 0);
  const panel = 'absolute rounded-[36px] bg-paper/95 shadow-[0_6px_0_rgba(138,90,59,0.12)]';

  return (
    <div className="absolute" style={{ left: 96, top: 170, width: 1340, height: 850 }}>
      <p className="m-0 text-bark" style={{ fontSize: 40 }}>
        <strong>{data.total}</strong> {data.total === 1 ? 'palpite' : 'palpites'} até agora. É só brincadeira: quem decide é a Hazel.
      </p>

      <section className={panel} style={{ left: 0, top: 90, width: 650, height: 420, padding: '30px 36px' }}>
        <h2 className="m-0 font-bold text-bark" style={{ fontSize: 36 }}>Com quem ela vai parecer</h2>
        <div className="mt-5 grid gap-5">
          {(['mom', 'dad', 'mix'] as const).map((k) => (
            <div key={k}>
              <div className="flex items-baseline justify-between text-bark" style={{ fontSize: 32 }}>
                <span className="font-bold">{LOOKS_LABEL[k]}</span>
                <span className="tabular-nums">{data.looks[k]} ({percent(data.looks[k], data.total)}%)</span>
              </div>
              <div className="mt-1 overflow-hidden rounded-full bg-cream" style={{ height: 26 }} aria-hidden="true">
                <div className="h-full rounded-full transition-[width] duration-1000" style={{ width: `${percent(data.looks[k], data.total)}%`, background: LOOKS_COLOR[k] }} />
              </div>
            </div>
          ))}
        </div>
        {looksLeaders.length > 1 && (
          <p className="m-0 mt-4 text-bark-soft" style={{ fontSize: 26 }}>
            Empate entre {looksLeaders.map((k) => LOOKS_LABEL[k].toLowerCase()).join(' e ')}.
          </p>
        )}
      </section>

      <section className={panel} style={{ left: 690, top: 90, width: 650, height: 420, padding: '30px 36px' }}>
        <h2 className="m-0 font-bold text-bark" style={{ fontSize: 36 }}>
          {leaders.length > 1 ? 'Dias mais escolhidos (empate)' : 'Dia mais escolhido'}
        </h2>
        <div className="mt-3">
          {leaders.slice(0, 3).map((d) => (
            <p key={d.date} className="font-hand m-0 text-leaf-deep" style={{ fontSize: leaders.length > 1 ? 46 : 62, lineHeight: 1.5 }}>
              {formatDay(d.date)}
            </p>
          ))}
          {leaders.length > 3 && (
            <p className="m-0 text-bark-soft" style={{ fontSize: 26 }}>e mais {leaders.length - 3} {leaders.length - 3 === 1 ? 'dia' : 'dias'} com o mesmo número de votos</p>
          )}
          <p className="m-0 text-bark-soft" style={{ fontSize: 28 }}>
            {topCount} {topCount === 1 ? 'palpite' : 'palpites'}{leaders.length > 1 ? ' cada' : ''}
          </p>
        </div>
        {others.length > 0 && leaders.length <= 2 && (
          <p className="m-0 mt-3 text-bark" style={{ fontSize: 26 }}>
            Depois: {others.map((d) => `${formatDay(d.date)} (${d.count})`).join(', ')}
          </p>
        )}
      </section>

      <section className={panel} style={{ left: 0, top: 550, width: 650, height: 270, padding: '30px 36px' }}>
        <h2 className="m-0 font-bold text-bark" style={{ fontSize: 36 }}>Peso ao nascer</h2>
        <p className="m-0 font-bold text-leaf-deep tabular-nums" style={{ fontSize: 76, lineHeight: 1.2 }}>{formatKg(data.weight.avg)}</p>
        <p className="m-0 text-bark-soft" style={{ fontSize: 28 }}>
          média dos palpites. Do menor ({formatKg(data.weight.min)}) ao maior ({formatKg(data.weight.max)}).
        </p>
      </section>

      <section className={panel} style={{ left: 690, top: 550, width: 650, height: 270, padding: '30px 36px' }}>
        <h2 className="m-0 font-bold text-bark" style={{ fontSize: 36 }}>Altura ao nascer</h2>
        <p className="m-0 font-bold text-leaf-deep tabular-nums" style={{ fontSize: 76, lineHeight: 1.2 }}>{formatCm(data.height.avg)}</p>
        <p className="m-0 text-bark-soft" style={{ fontSize: 28 }}>
          média dos palpites. Do menor ({formatCm(data.height.min)}) ao maior ({formatCm(data.height.max)}).
        </p>
      </section>
    </div>
  );
}
