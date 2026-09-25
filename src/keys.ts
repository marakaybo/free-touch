// Названия клавиш для людей. Храним KeyboardEvent.code — не зависит от раскладки.
const NAMES: Record<string, string> = {
  ControlLeft: 'Ctrl', ControlRight: 'Ctrl (пр.)', ShiftLeft: 'Shift', ShiftRight: 'Shift (пр.)',
  AltLeft: 'Alt', AltRight: 'Alt (пр.)', MetaLeft: 'Win', MetaRight: 'Win (пр.)',
  Enter: 'Enter', NumpadEnter: 'Enter (цифр.)', Escape: 'Esc', Backspace: 'Backspace', Tab: 'Tab', Space: 'Пробел',
  CapsLock: 'Caps Lock', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  IntlBackslash: '\\', Semicolon: ';', Quote: "'", Backquote: '`', Comma: ',', Period: '.', Slash: '/',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Home: 'Home', End: 'End',
  PageUp: 'PgUp', PageDown: 'PgDn', Insert: 'Insert', Delete: 'Delete', PrintScreen: 'PrtSc',
  ScrollLock: 'Scroll Lock', Pause: 'Pause', NumLock: 'Num Lock', ContextMenu: 'Меню',
  NumpadMultiply: 'Num *', NumpadAdd: 'Num +', NumpadSubtract: 'Num -', NumpadDecimal: 'Num .', NumpadDivide: 'Num /',
  MediaPlayPause: 'Play/Pause', MediaTrackNext: 'След. трек', MediaTrackPrevious: 'Пред. трек', MediaStop: 'Стоп',
  AudioVolumeUp: 'Громче', AudioVolumeDown: 'Тише', AudioVolumeMute: 'Без звука',
};

export function keyName(code: string): string {
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}

const MOD_ORDER = ['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight'];
export const isModifier = (c: string) => MOD_ORDER.includes(c);

export function sortKeys(keys: string[]): string[] {
  const mods = keys.filter(isModifier).sort((a, b) => MOD_ORDER.indexOf(a) - MOD_ORDER.indexOf(b));
  return [...mods, ...keys.filter((k) => !isModifier(k))];
}

/** Клавиши, которые нельзя нажать при записи (их перехватывает Windows). */
export const EXTRA_KEYS = ['MetaLeft', 'PrintScreen', 'MediaPlayPause', 'MediaTrackNext', 'MediaTrackPrevious', 'AudioVolumeMute', 'AudioVolumeUp', 'AudioVolumeDown', 'F13', 'F14', 'F15', 'F16', 'F17', 'F18', 'F19', 'F20', 'F21', 'F22', 'F23', 'F24'];
