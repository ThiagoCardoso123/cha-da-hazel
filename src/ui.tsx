import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Sunflower } from './art/Art';

type Variant = 'primary' | 'soft' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-petal text-bark shadow-[0_3px_0_var(--color-petal-deep)] active:translate-y-[2px] active:shadow-none',
  soft: 'bg-butter text-bark border border-butter-deep',
  ghost: 'bg-transparent text-bark underline underline-offset-4 decoration-leaf-deep/60',
  danger: 'bg-blush-soft text-blush border border-blush/30',
};

export function Button({ variant = 'primary', busy = false, className = '', children, disabled, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-lg font-bold transition
        disabled:cursor-not-allowed disabled:opacity-55 ${VARIANTS[variant]} ${className}`}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin motion-reduce:animate-none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Aviso de erro com caminho de volta. Fala o que houve e o que fazer. */
export function Notice({ tone = 'error', children, onRetry, retryLabel = 'Tentar de novo' }: {
  tone?: 'error' | 'info' | 'ok'; children: ReactNode; onRetry?: () => void; retryLabel?: string;
}) {
  const tones = {
    error: 'bg-blush-soft text-blush border-blush/30',
    info: 'bg-butter/70 text-bark border-butter-deep',
    ok: 'bg-leaf-soft/70 text-leaf-deep border-leaf',
  };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-2xl border px-4 py-3 text-base ${tones[tone]}`}>
      <p className="m-0">{children}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 min-h-11 font-bold underline underline-offset-4">
          {retryLabel}
        </button>
      )}
    </div>
  );
}

/** Estado vazio ilustrado: convida a agir em vez de só informar. */
export function Empty({ title, children, seed = 'vazio' }: { title: string; children?: ReactNode; seed?: string }) {
  return (
    <div className="flex flex-col items-center px-4 py-8 text-center">
      <Sunflower size={84} seed={seed} />
      <p className="font-hand mt-2 mb-0 text-2xl text-bark">{title}</p>
      {children && <div className="mt-1 max-w-sm text-base text-bark-soft">{children}</div>}
    </div>
  );
}

/**
 * Indicador discreto de conexão. Espera alguns segundos antes de aparecer,
 * para não piscar a cada oscilação curta.
 */
export function ConnectionBadge({ online }: { online: boolean }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (online) {
      setShow(false);
      return;
    }
    const id = window.setTimeout(() => setShow(true), 3500);
    return () => window.clearTimeout(id);
  }, [online]);
  if (!show) return null;
  return (
    <div role="status" className="anim-fade inline-flex items-center gap-2 rounded-full border border-butter-deep bg-paper px-3 py-1 text-sm text-bark-soft">
      <span className="inline-block h-2 w-2 rounded-full bg-petal-deep" aria-hidden="true" />
      Reconectando…
    </div>
  );
}

export function FullCenter({ children }: { children: ReactNode }) {
  return (
    <div className="paper relative flex min-h-full flex-col items-center justify-center bg-cream px-6 py-10 text-center">
      <div className="relative">{children}</div>
    </div>
  );
}

/** Tela mostrada quando faltam as variáveis de ambiente do Supabase. */
export function NotConfigured() {
  return (
    <FullCenter>
      <Sunflower size={96} />
      <h1 className="font-hand mt-2 text-3xl">Falta ligar o banco de dados</h1>
      <p className="mx-auto max-w-md text-bark-soft">
        Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (veja o arquivo{' '}
        <code>.env.example</code> e o README) e publique de novo.
      </p>
    </FullCenter>
  );
}

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <FullCenter>
      <div className="flex items-center gap-3 text-bark-soft">
        <Spinner size={22} /> {label}
      </div>
    </FullCenter>
  );
}

/** Confirmação antes de ações destrutivas. */
export function Confirm({ title, body, confirmLabel, onConfirm, onCancel, busy }: {
  title: string; body: ReactNode; confirmLabel: string; onConfirm: () => void; onCancel: () => void; busy?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bark/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="anim-rise w-full max-w-md rounded-3xl bg-paper p-5 shadow-xl">
        <h2 className="m-0 text-xl font-bold">{title}</h2>
        <div className="mt-2 text-bark-soft">{body}</div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <Button variant="danger" onClick={onConfirm} busy={busy} autoFocus>{confirmLabel}</Button>
          <Button variant="soft" onClick={onCancel} disabled={busy}>Cancelar</Button>
        </div>
      </div>
    </div>
  );
}
