// Общая модель данных пульта: её понимают редактор, телефон и сервер на Rust.

/** Заливка: цвет, картинка или (только для фона страницы) мягкий градиент. */
export type Fill =
  | { type: 'solid'; color: string }
  | { type: 'gradient'; from: string; to: string; angle: number }
  | { type: 'image'; src: string; dim: number };

export type IconRef =
  | { kind: 'none' }
  | { kind: 'emoji'; value: string }
  | { kind: 'icon'; name: string }
  | { kind: 'brand'; name: string }
  | { kind: 'image'; src: string };

export type FontId = 'condensed' | 'sans' | 'mono';
export type LabelPos = 'top' | 'center' | 'bottom' | 'hidden';
/** press — клавиша уходит вниз, none — без движения. */
export type PressAnim = 'press' | 'none';
/** key — объёмная клавиша (блик сверху, грань снизу), flat — плоская плашка. */
export type Shadow = 'key' | 'flat';

export interface ButtonStyle {
  fill: Fill;
  /** Скругление в процентах от меньшей стороны кнопки. */
  radius: number;
  borderWidth: number;
  borderColor: string;
  shadow: Shadow;
  label: string;
  labelPos: LabelPos;
  font: FontId;
  /** Размер текста в процентах от меньшей стороны кнопки. */
  fontSize: number;
  bold: boolean;
  textColor: string;
  icon: IconRef;
  /** Размер значка в процентах от меньшей стороны кнопки. */
  iconSize: number;
  iconColor: string;
  press: PressAnim;
}

export type Action =
  | { type: 'hotkey'; keys: string[]; hold: boolean }
  | { type: 'text'; text: string }
  | { type: 'open'; target: string; args: string }
  | { type: 'command'; command: string }
  | { type: 'media'; key: 'playPause' | 'next' | 'prev' | 'stop' | 'volUp' | 'volDown' | 'mute' }
  | { type: 'volume'; mode: 'set' | 'up' | 'down' | 'mute' | 'unmute' | 'toggleMute'; value: number; app: string }
  | {
      type: 'obs';
      op: ObsOp;
      mode: 'toggle' | 'start' | 'stop';
      scene: string;
      input: string;
      source: string;
      collection: string;
    }
  | { type: 'page'; page: string }
  | { type: 'delay'; ms: number };

export type ObsOp =
  | 'scene'
  | 'collection'
  | 'stream'
  | 'record'
  | 'recordPause'
  | 'replay'
  | 'saveReplay'
  | 'virtualcam'
  | 'mute'
  | 'source';

export type SliderTarget =
  | { kind: 'master'; input: ''; app: '' }
  | { kind: 'obsInput'; input: string; app: '' }
  | { kind: 'app'; input: ''; app: string };

export interface ActiveRule {
  /** Ключ живого состояния, например obs.scene или obs.mute:Микрофон. */
  state: string;
  /** Если пусто — кнопка активна, когда состояние «истинно». */
  equals: string;
  /** Что поменять во внешнем виде, пока условие выполняется. */
  style: Partial<ButtonStyle>;
  /** Светодиод на клавише. Для эфира и записи он красный, для остального — синий. */
  dot: boolean;
}

export interface Button {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  type: 'button' | 'slider';
  style: ButtonStyle;
  actions: Action[];
  /** Действия при долгом нажатии (полсекунды и дольше). Пусто — долгого нажатия нет. */
  longActions: Action[];
  active: ActiveRule | null;
  slider: { target: SliderTarget; vertical: boolean; color: string } | null;
}

export interface Page {
  id: string;
  name: string;
  cols: number;
  rows: number;
  gap: number;
  background: Fill;
  buttons: Button[];
}

export interface Profile {
  version: 1;
  name: string;
  accent: string;
  /** Показывать точки страниц внизу пульта. */
  pageDots: boolean;
  /** Не давать экрану телефона гаснуть, пока открыт пульт. */
  keepAwake: boolean;
  home: string;
  pages: Page[];
}

export type States = Record<string, unknown>;

export interface ObsMeta {
  connected: boolean;
  error: string | null;
  version: string;
  scenes: string[];
  collections: string[];
  audioInputs: string[];
  inputs: string[];
  sources: Record<string, string[]>;
}

export interface Settings {
  port: number;
  token: string;
  obs: { enabled: boolean; host: string; port: number; password: string };
  startMinimized: boolean;
  closeToTray: boolean;
  preferredIp: string;
  obsAutodetected: boolean;
  autoUpdate: boolean;
}

export interface ClientInfo {
  id: number;
  name: string;
  addr: string;
}

export interface ServerStatus {
  running: boolean;
  port: number;
  error: string | null;
}
