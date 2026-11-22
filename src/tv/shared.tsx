import type { MutableRefObject, ReactNode } from 'react';
import type { Flower, Message, Photo } from '../lib/types';
import { Sunflower } from '../art/Art';

/** A TV é desenhada sempre em 1920×1080 e escalada para caber na tela. */
export const STAGE_W = 1920;
export const STAGE_H = 1080;

export interface TvContent {
  flowers: Flower[];
  messages: Message[];
  photos: Photo[];
  urls: Record<string, string>;
  /** recados aprovados depois que a TV abriu, à espera do cartão grande */
  queue: MutableRefObject<Message[]>;
  queueSignal: number;
  /** flores que acabaram de nascer (para animar só essas) */
  fresh: Set<string>;
  reloadUrls: () => void;
}

/** Texto central para estados vazios da TV. */
export function TvEmpty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="absolute flex flex-col items-center text-center" style={{ left: 200, right: 520, top: 300 }}>
      <Sunflower size={150} seed="tv-vazio" />
      <p className="font-hand m-0 text-bark" style={{ fontSize: 62 }}>{title}</p>
      {children && <p className="m-0 text-bark-soft" style={{ fontSize: 32, maxWidth: 900 }}>{children}</p>}
    </div>
  );
}
