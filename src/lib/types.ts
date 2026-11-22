export type Area = 'guest' | 'tv' | 'admin';
export type TvMode = 'garden' | 'album' | 'quiz' | 'guesses' | 'closing';
export type ModStatus = 'pending' | 'approved' | 'rejected' | 'removed';
export type RoundKind = 'quiz' | 'poll';
export type LooksLike = 'mom' | 'dad' | 'mix';

export interface EventState {
  tv_mode: TvMode;
  messages_open: boolean;
  photos_open: boolean;
  guesses_open: boolean;
  quiz_open: boolean;
  is_closed: boolean;
  guest_gallery_enabled: boolean;
  message_seconds: number;
  photo_seconds: number;
  current_round_id: string | null;
  content_version: number;
}

export interface Participant {
  id: string;
  name: string;
}

export interface WhoAmI {
  uid: string | null;
  is_admin: boolean;
  is_tv: boolean;
  participant: Participant | null;
}

export interface Message {
  id: string;
  participant_id: string;
  author_name: string;
  body: string;
  status: ModStatus;
  created_at: string;
  approved_at: string | null;
}

export interface Photo {
  id: string;
  participant_id: string;
  author_name: string;
  caption: string;
  storage_path: string;
  width: number;
  height: number;
  status: ModStatus;
  created_at: string;
  approved_at: string | null;
}

export interface Flower {
  participant_id: string;
  name: string;
  seq: number;
}

export interface Guess {
  participant_id: string;
  author_name: string;
  birth_date: string; // AAAA-MM-DD
  weight_g: number;
  height_cm: number;
  looks_like: LooksLike;
  updated_at: string;
}

export interface GuessSummary {
  total: number;
  looks: Record<LooksLike, number>;
  weight: { avg: number; min: number; max: number } | null;
  height: { avg: number; min: number; max: number } | null;
  dates: { date: string; count: number }[];
}

export interface Question {
  id: string;
  kind: RoundKind;
  prompt: string;
  options: string[];
  correct_index: number | null;
  duration_seconds: number;
  position: number;
}

/** Rodada no ar. `results` e `correct_index` só chegam depois da revelação. */
export interface Round {
  id: string;
  question_id: string | null;
  kind: RoundKind;
  prompt: string;
  options: string[];
  status: 'open' | 'closed' | 'revealed';
  opened_at: string;
  closes_at: string;
  total_votes: number;
  results: number[] | null;
  correct_index: number | null;
}

export interface AdminStats {
  participants: number;
  flowers: number;
  guesses: number;
  messages_pending: number;
  messages_approved: number;
  messages_total: number;
  photos_pending: number;
  photos_approved: number;
  photos_total: number;
}

export interface EventPrivate {
  join_code: string;
  tv_key: string;
}
