import { hash } from '../lib/util';

/** Filtros compartilhados: dão borda irregular de aquarela aos desenhos. */
export function ArtDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <filter id="aquarela" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="3" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="5" />
        </filter>
        <filter id="aquarela-forte" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="11" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="22" />
        </filter>
        <radialGradient id="miolo" cx="42%" cy="38%" r="70%">
          <stop offset="0%" stopColor="#a8744d" />
          <stop offset="70%" stopColor="#8a5a3b" />
          <stop offset="100%" stopColor="#6f452b" />
        </radialGradient>
      </defs>
    </svg>
  );
}

const PETALS = [
  { outer: '#f2c94c', inner: '#f7dc7c', edge: '#d9a72a' },
  { outer: '#f5d264', inner: '#fae391', edge: '#dcae35' },
  { outer: '#efc23f', inner: '#f6d76e', edge: '#d39f22' },
];

/** Cabeça do girassol. `seed` varia levemente tom e giro de cada flor. */
export function SunflowerHead({ size = 120, seed = 'hazel' }: { size?: number; seed?: string }) {
  const r = hash(seed);
  const tone = PETALS[Math.floor(r * PETALS.length) % PETALS.length];
  const turn = Math.round(r * 24);
  const outer = Array.from({ length: 14 }, (_, i) => i * (360 / 14));
  return (
    <svg width={size} height={size} viewBox="-62 -62 124 124" aria-hidden="true" focusable="false">
      <g filter="url(#aquarela)" transform={`rotate(${turn})`}>
        {outer.map((a) => (
          <ellipse key={`o${a}`} cx="0" cy="-37" rx="9.5" ry="22" transform={`rotate(${a})`}
            fill={tone.outer} fillOpacity="0.9" stroke={tone.edge} strokeOpacity="0.35" strokeWidth="1" />
        ))}
        {outer.map((a) => (
          <ellipse key={`i${a}`} cx="0" cy="-30" rx="7.5" ry="17" transform={`rotate(${a + 360 / 28})`}
            fill={tone.inner} fillOpacity="0.88" />
        ))}
        <circle r="21" fill="url(#miolo)" />
        {Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2;
          return <circle key={i} cx={Math.cos(a) * 13} cy={Math.sin(a) * 13} r="1.7" fill="#5c3a25" fillOpacity="0.55" />;
        })}
        {Array.from({ length: 5 }, (_, i) => {
          const a = (i / 5) * Math.PI * 2 + 0.4;
          return <circle key={i} cx={Math.cos(a) * 6} cy={Math.sin(a) * 6} r="1.5" fill="#5c3a25" fillOpacity="0.5" />;
        })}
      </g>
    </svg>
  );
}

/** Girassol completo (cabeça + haste + folhas), para aberturas e estados vazios. */
export function Sunflower({ size = 120, seed = 'hazel', stem = 1.1, sway = true }: {
  size?: number; seed?: string; stem?: number; sway?: boolean;
}) {
  const stemH = Math.round(size * stem);
  return (
    <div className={sway ? 'anim-sway' : ''} style={{ width: size, display: 'inline-block', lineHeight: 0 }}>
      <SunflowerHead size={size} seed={seed} />
      <svg width={size} height={stemH} viewBox={`0 0 100 ${Math.round(100 * stem)}`} style={{ marginTop: -size * 0.3 }}
        aria-hidden="true" focusable="false">
        <g filter="url(#aquarela)">
          <path d={`M50 0 C 47 ${30 * stem}, 53 ${60 * stem}, 50 ${100 * stem}`} stroke="#7d9a6a" strokeWidth="5"
            fill="none" strokeLinecap="round" />
          <path d={`M50 ${48 * stem} C 30 ${36 * stem}, 14 ${44 * stem}, 10 ${58 * stem} C 28 ${62 * stem}, 42 ${58 * stem}, 50 ${48 * stem} Z`}
            fill="#a9c296" fillOpacity="0.9" />
          <path d={`M50 ${66 * stem} C 68 ${52 * stem}, 86 ${58 * stem}, 90 ${72 * stem} C 74 ${78 * stem}, 58 ${74 * stem}, 50 ${66 * stem} Z`}
            fill="#93b07f" fillOpacity="0.9" />
        </g>
      </svg>
    </div>
  );
}

const RAINBOW = ['#f3b9b1', '#f7d3a6', '#f6e6a4', '#c3ddb8', '#b8d4e6', '#cfc3e4'];

/** Arco-íris pastel: lembrança do chá revelação. Discreto de propósito. */
export function Rainbow({ width = 220, opacity = 0.75 }: { width?: number; opacity?: number }) {
  return (
    <svg width={width} height={width * 0.55} viewBox="0 0 200 110" aria-hidden="true" focusable="false" style={{ opacity }}>
      <g filter="url(#aquarela)" fill="none" strokeLinecap="round">
        {RAINBOW.map((c, i) => (
          <path key={c} d={`M ${14 + i * 9} 104 A ${86 - i * 9} ${86 - i * 9} 0 0 1 ${186 - i * 9} 104`}
            stroke={c} strokeWidth="8.5" strokeOpacity="0.85" />
        ))}
      </g>
    </svg>
  );
}

/** Abelha do jardim, voltada para a direita. */
export function Bee({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.75} viewBox="0 0 80 60" aria-hidden="true" focusable="false">
      <g className="bee-wing">
        <ellipse cx="34" cy="17" rx="10" ry="15" transform="rotate(-18 34 17)" fill="#ffffff" fillOpacity="0.85" stroke="#b8cfe0" strokeWidth="1.2" />
        <ellipse cx="47" cy="16" rx="9" ry="14" transform="rotate(14 47 16)" fill="#ffffff" fillOpacity="0.8" stroke="#b8cfe0" strokeWidth="1.2" />
      </g>
      <g filter="url(#aquarela)">
        <path d="M8 40 L1 37 L8 34 Z" fill="#5c3a25" />
        <ellipse cx="34" cy="38" rx="27" ry="15" fill="#f2c94c" />
        <path d="M22 25 C 18 33, 18 43, 22 51" stroke="#5c3a25" strokeWidth="6" fill="none" strokeLinecap="round" />
        <path d="M35 23 C 31 33, 31 43, 35 53" stroke="#5c3a25" strokeWidth="6" fill="none" strokeLinecap="round" />
        <path d="M47 25 C 44 33, 44 43, 47 51" stroke="#5c3a25" strokeWidth="5" fill="none" strokeLinecap="round" />
        <circle cx="62" cy="36" r="12" fill="#5c3a25" />
        <circle cx="66" cy="33" r="2.6" fill="#fffdf5" />
        <path d="M60 25 C 60 17, 66 14, 70 13" stroke="#5c3a25" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M66 26 C 68 19, 73 18, 77 18" stroke="#5c3a25" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}
