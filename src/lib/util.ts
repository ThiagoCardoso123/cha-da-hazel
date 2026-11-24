import type { ModStatus } from './types';

// ------------------------------------------------------------------ textos de erro

const ERRORS: Record<string, string> = {
  network: 'Sem conexão no momento. Nada foi perdido — tente de novo.',
  server: 'Algo não funcionou do nosso lado. Tente de novo em instantes.',
  no_session: 'Sua sessão não pôde ser iniciada. Recarregue a página.',
  anon_disabled: 'O acesso de convidados não está habilitado neste projeto (login anônimo do Supabase).',
  signin_busy: 'Muita gente entrando ao mesmo tempo. Espere um minuto e tente de novo, ou troque o Wi-Fi pelos dados móveis.',
  not_participant: 'Sua participação não foi encontrada. Recarregue a página e entre de novo.',
  event_closed: 'O Chá da Hazel foi encerrado e não recebe novos envios.',
  activity_closed: 'Esta atividade está fechada agora.',
  rate_limited: 'Muitos envios seguidos. Espere um minutinho e tente de novo.',
  invalid_code: 'Código não confere. Ele aparece na TV, abaixo do QR Code.',
  too_many_attempts: 'Muitas tentativas. Espere 10 minutos e tente de novo.',
  invalid_name: 'Escreva um nome com até 30 letras.',
  invalid_body: 'O recado precisa ter entre 1 e 280 caracteres.',
  invalid_caption: 'A legenda pode ter até 120 caracteres.',
  invalid_id: 'Não foi possível registrar este envio. Comece um novo.',
  invalid_size: 'Não foi possível ler o tamanho da imagem.',
  file_missing: 'A foto não chegou ao servidor. Tente enviar de novo.',
  file_too_large: 'A foto ficou grande demais. Escolha outra imagem.',
  invalid_file: 'Formato não aceito. Envie uma foto (JPG, PNG ou HEIC).',
  upload_refused: 'O envio de fotos não está disponível agora (álbum fechado ou limite de fotos atingido).',
  invalid_date: 'Escolha uma data entre hoje e daqui a um ano.',
  invalid_weight: 'O peso deve ficar entre 1.500 g e 6.000 g.',
  invalid_height: 'A altura deve ficar entre 35 cm e 65 cm.',
  invalid_looks: 'Escolha com quem a Hazel vai parecer.',
  round_closed: 'O tempo desta rodada acabou.',
  round_not_found: 'Esta rodada não está mais no ar.',
  invalid_option: 'Escolha uma das alternativas.',
  invalid_key: 'Chave da TV não confere.',
  forbidden: 'Você não tem permissão para isso.',
  bad_login: 'E-mail ou senha incorretos.',
  round_in_progress: 'Já existe uma rodada aberta. Encerre-a antes de abrir outra.',
  still_open: 'A rodada ainda está aberta. Encerre antes de revelar.',
  not_found: 'Este item não existe mais.',
};

export function errorText(code: string): string {
  return ERRORS[code] ?? ERRORS.server;
}

export const STATUS_LABEL: Record<ModStatus, string> = {
  pending: 'Aguardando aprovação',
  approved: 'Na TV',
  rejected: 'Não será exibido',
  removed: 'Retirado da TV',
};

// ------------------------------------------------------------------ pequenos utilitários

export function uuid(): string {
  const c = globalThis.crypto as Crypto & { randomUUID?: () => string };
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Rascunhos locais: preservam o que foi digitado se a conexão cair ou a página recarregar. */
export const draft = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(`hazel-draft-${key}`);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(`hazel-draft-${key}`, JSON.stringify(value));
    } catch {
      /* armazenamento cheio ou bloqueado: segue sem rascunho */
    }
  },
  clear(key: string): void {
    try {
      localStorage.removeItem(`hazel-draft-${key}`);
    } catch {
      /* idem */
    }
  },
};

export function formatKg(grams: number): string {
  return `${(grams / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} kg`;
}

export function formatCm(cm: number): string {
  return `${Number(cm).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} cm`;
}

/** "2027-01-15" -> "15 de janeiro" (sem cair em fuso horário). */
export function formatDay(iso: string, withYear = false): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  return date.toLocaleDateString('pt-BR', withYear
    ? { day: 'numeric', month: 'long', year: 'numeric' }
    : { day: 'numeric', month: 'long' });
}

export function todayIso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function percent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/** Número pseudoaleatório estável a partir de um texto (posição/variação das flores). */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

// ------------------------------------------------------------------ imagens

export interface PreparedPhoto {
  blob: Blob;
  width: number;
  height: number;
  previewUrl: string;
}

const MAX_SIDE = 1600;
const MAX_BYTES = 3_500_000;

function loadBitmap(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; done: () => void }> {
  if ('createImageBitmap' in window) {
    return createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
      .then((bmp) => ({ source: bmp as CanvasImageSource, width: bmp.width, height: bmp.height, done: () => bmp.close() }))
      .catch(() => loadImageElement(file));
  }
  return loadImageElement(file);
}

function loadImageElement(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; done: () => void }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({
      source: img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url),
    });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode'));
    };
    img.src = url;
  });
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', quality);
  });
}

/**
 * Reduz a foto para no máximo 1600 px e converte para JPEG antes do envio.
 * Uma foto de celular de 4–8 MB costuma sair daqui com 200–500 KB.
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
    throw new Error('invalid_file');
  }
  if (file.size > 40_000_000) throw new Error('file_too_large');

  let bitmap;
  try {
    bitmap = await loadBitmap(file);
  } catch {
    throw new Error('invalid_file');
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('invalid_file');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap.source, 0, 0, width, height);
  bitmap.done();

  let blob = await toJpeg(canvas, 0.82);
  if (blob.size > MAX_BYTES) blob = await toJpeg(canvas, 0.6);
  if (blob.size > MAX_BYTES) throw new Error('file_too_large');
  return { blob, width, height, previewUrl: URL.createObjectURL(blob) };
}

// ------------------------------------------------------------------ exportações

/** CSV com BOM e ponto e vírgula: abre com acentos corretos no Excel em português. */
export function toCsv(header: string[], rows: (string | number | null)[][]): Blob {
  const cell = (v: string | number | null) => {
    const s = v === null ? '' : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header, ...rows].map((r) => r.map(cell).join(';'));
  return new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

let crcTable: Uint32Array | null = null;
function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Monta um .zip sem compressão (JPEG já é comprimido) — dispensa biblioteca externa. */
export function makeZip(files: { name: string; data: Uint8Array }[]): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nomes em UTF-8
    local.setUint16(8, 0, true);
    local.setUint16(10, 0, true);
    local.setUint16(12, 0x21, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, f.data.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, f.data);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 0, true);
    cen.setUint16(12, 0, true);
    cen.setUint16(14, 0x21, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, f.data.length, true);
    cen.setUint32(24, f.data.length, true);
    cen.setUint16(28, name.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const centralSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], { type: 'application/zip' });
}

/** Nome de arquivo seguro a partir de um texto livre. */
export function slug(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'foto';
}
