import { useEffect, useState, type ReactNode } from 'react';
import { Ph } from '../../shared/render';
import { defaultAction } from '../../shared/defaults';
import type { Action, ObsOp } from '../../shared/types';
import { api, pickFile, saveFile, type AudioDevice } from '../api';
import { useStore } from '../store';
import { HotkeyInput } from './HotkeyInput';
import { Field, Num, Range, Select, Seg, Text, Toggle } from './ui';

type Group = 'Стрим' | 'Клавиатура и мышь' | 'Звук' | 'Компьютер' | 'Пульт';

export const ACTION_TYPES: { type: Action['type']; name: string; icon: ReactNode; hint: string; group: Group }[] = [
  { type: 'obs', name: 'OBS', icon: <Ph name="broadcast" size={16} />, hint: 'Сцены, стрим, запись, микрофон, фильтры', group: 'Стрим' },
  { type: 'counter', name: 'Счётчик', icon: <Ph name="hash" size={16} />, hint: 'Смерти, победы — число на клавише и в OBS', group: 'Стрим' },
  { type: 'timer', name: 'Секундомер', icon: <Ph name="timer" size={16} />, hint: 'Запуск, пауза, сброс', group: 'Стрим' },
  { type: 'http', name: 'Веб-запрос', icon: <Ph name="globe" size={16} />, hint: 'Вебхук Discord, умный дом, свой сервер', group: 'Стрим' },
  { type: 'hotkey', name: 'Сочетание клавиш', icon: <Ph name="keyboard" size={16} />, hint: 'Ctrl+Shift+M, F13…', group: 'Клавиатура и мышь' },
  { type: 'text', name: 'Напечатать текст', icon: <Ph name="text-t" size={16} />, hint: 'Вставит текст в активное окно', group: 'Клавиатура и мышь' },
  { type: 'mouse', name: 'Мышь', icon: <Ph name="mouse" size={16} />, hint: 'Щелчок или прокрутка', group: 'Клавиатура и мышь' },
  { type: 'sound', name: 'Проиграть звук', icon: <Ph name="waveform" size={16} />, hint: 'Звуковая панель: mp3, wav, ogg', group: 'Звук' },
  { type: 'stopSounds', name: 'Остановить звуки', icon: <Ph name="stop-circle" size={16} />, hint: 'Заглушить всё, что играет панель', group: 'Звук' },
  { type: 'volume', name: 'Громкость', icon: <Ph name="speaker-high" size={16} />, hint: 'Общая, программы или микрофона', group: 'Звук' },
  { type: 'device', name: 'Устройство звука', icon: <Ph name="headphones" size={16} />, hint: 'Наушники ↔ колонки', group: 'Звук' },
  { type: 'media', name: 'Медиа', icon: <Ph name="music-notes" size={16} />, hint: 'Пауза, следующий трек', group: 'Звук' },
  { type: 'open', name: 'Открыть', icon: <Ph name="app-window" size={16} />, hint: 'Программу, файл, сайт', group: 'Компьютер' },
  { type: 'command', name: 'Команда', icon: <Ph name="terminal-window" size={16} />, hint: 'Команда cmd без окна', group: 'Компьютер' },
  { type: 'system', name: 'Питание и экран', icon: <Ph name="power" size={16} />, hint: 'Заблокировать, сон, выключить', group: 'Компьютер' },
  { type: 'page', name: 'Перейти на страницу', icon: <Ph name="stack" size={16} />, hint: 'Навигация по пульту', group: 'Пульт' },
  { type: 'delay', name: 'Пауза', icon: <Ph name="clock" size={16} />, hint: 'Подождать между действиями', group: 'Пульт' },
];

const GROUPS: Group[] = ['Стрим', 'Звук', 'Клавиатура и мышь', 'Компьютер', 'Пульт'];

const OBS_OPS: { v: ObsOp; label: string }[] = [
  { v: 'scene', label: 'Переключить сцену' },
  { v: 'collection', label: 'Сменить коллекцию сцен' },
  { v: 'stream', label: 'Стрим' },
  { v: 'record', label: 'Запись' },
  { v: 'recordPause', label: 'Пауза записи' },
  { v: 'mute', label: 'Выключить звук входа' },
  { v: 'source', label: 'Показать / скрыть источник' },
  { v: 'filter', label: 'Включить / выключить фильтр' },
  { v: 'replay', label: 'Буфер повтора' },
  { v: 'saveReplay', label: 'Сохранить повтор' },
  { v: 'virtualcam', label: 'Виртуальная камера' },
];

export function ActionCard({ action, index, count, onChange, onRemove, onMove }: {
  action: Action; index: number; count: number;
  onChange: (a: Action) => void; onRemove: () => void; onMove: (d: number) => void;
}) {
  const meta = ACTION_TYPES.find((t) => t.type === action.type)!;
  return (
    <div className="act">
      <div className="act-head">
        <span className="act-ic">{meta.icon}</span>
        <span className="act-name">{meta.name}</span>
        <span className="act-tools">
          <button className="icon-btn" disabled={index === 0} onClick={() => onMove(-1)} title="Выше"><Ph name="arrow-up" size={14} /></button>
          <button className="icon-btn" disabled={index === count - 1} onClick={() => onMove(1)} title="Ниже"><Ph name="arrow-down" size={14} /></button>
          <button className="icon-btn danger" onClick={onRemove} title="Удалить"><Ph name="trash" size={14} /></button>
        </span>
      </div>
      {action.type !== 'stopSounds' && <div className="act-body"><ActionFields action={action} onChange={onChange} /></div>}
    </div>
  );
}

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;

function ActionFields({ action: a, onChange }: { action: Action; onChange: (a: Action) => void }) {
  const { obs, profile, states } = useStore();
  const [apps, setApps] = useState<string[]>([]);
  const [devs, setDevs] = useState<AudioDevice[]>([]);
  const [outs, setOuts] = useState<string[]>([]);
  const devInput = a.type === 'device' ? a.input : false;
  useEffect(() => {
    if (a.type === 'volume') api.audioApps().then(setApps);
    if (a.type === 'sound') api.soundOutputs().then(setOuts);
  }, [a.type]);
  useEffect(() => {
    if (a.type === 'device') api.audioDevices(devInput).then(setDevs);
  }, [a.type, devInput]);

  switch (a.type) {
    case 'hotkey':
      return (
        <>
          <HotkeyInput keys={a.keys} onChange={(keys) => onChange({ ...a, keys })} />
          <Toggle checked={a.hold} onChange={(hold) => onChange({ ...a, hold })} label="Держать, пока палец на кнопке (рация, спринт)" />
        </>
      );
    case 'text':
      return (
        <textarea className="inp" rows={3} value={a.text} placeholder="Привет, чат!" onChange={(e) => onChange({ ...a, text: e.target.value })} />
      );
    case 'open':
      return (
        <>
          <div className="two-wide">
            <Text value={a.target} onChange={(target) => onChange({ ...a, target })} placeholder="C:\…\program.exe или https://…" mono />
            <button
              className="btn"
              onClick={async () => {
                const p = await pickFile([{ name: 'Программы и ярлыки', extensions: ['exe', 'lnk', 'bat', 'cmd', 'url'] }, { name: 'Все файлы', extensions: ['*'] }]);
                if (p) onChange({ ...a, target: p });
              }}
            >Обзор</button>
          </div>
          <Field label="Параметры запуска"><Text value={a.args} onChange={(args) => onChange({ ...a, args })} placeholder="необязательно" mono /></Field>
        </>
      );
    case 'command':
      return (
        <>
          <Text value={a.command} onChange={(command) => onChange({ ...a, command })} placeholder="shutdown /s /t 60" mono />
          <span className="fld-hint">Выполняется в cmd без окна. Осторожно с тем, что вставляете.</span>
        </>
      );
    case 'media':
      return (
        <Seg
          value={a.key}
          onChange={(key) => onChange({ ...a, key })}
          options={[
            { v: 'prev', label: '⏮', title: 'Предыдущий' },
            { v: 'playPause', label: '⏯', title: 'Пауза' },
            { v: 'next', label: '⏭', title: 'Следующий' },
            { v: 'stop', label: '⏹', title: 'Стоп' },
            { v: 'volDown', label: '−', title: 'Тише' },
            { v: 'volUp', label: '+', title: 'Громче' },
            { v: 'mute', label: '🔇', title: 'Без звука' },
          ]}
        />
      );
    case 'volume':
      return (
        <>
          <Field label="Что">
            <Select
              value={a.app}
              onChange={(app) => onChange({ ...a, app })}
              options={[{ v: '', label: 'Весь звук Windows' }, { v: '@mic', label: 'Микрофон Windows' }, ...apps.map((x) => ({ v: x, label: x }))]}
            />
          </Field>
          <Seg
            value={a.mode}
            onChange={(mode) => onChange({ ...a, mode })}
            options={[
              { v: 'toggleMute', label: 'Вкл/выкл' },
              { v: 'up', label: 'Громче' },
              { v: 'down', label: 'Тише' },
              { v: 'set', label: 'Задать' },
            ]}
          />
          {(a.mode === 'up' || a.mode === 'down' || a.mode === 'set') && (
            <Field label={a.mode === 'set' ? 'Уровень' : 'Шаг'}>
              <Range value={a.value} min={a.mode === 'set' ? 0 : 1} max={a.mode === 'set' ? 100 : 25} suffix="%" onChange={(value) => onChange({ ...a, value })} />
            </Field>
          )}
          {a.app === '@mic' && <span className="fld-hint">Выключает микрофон для всех программ сразу: Discord, игры, OBS.</span>}
          {apps.length === 0 && a.app !== '@mic' && <span className="fld-hint">Программа появится в списке, когда начнёт играть звук.</span>}
        </>
      );
    case 'obs': {
      const sources = a.scene ? obs.sources[a.scene] ?? [] : [];
      const toggleable = ['stream', 'record', 'replay', 'virtualcam', 'mute', 'source', 'filter'].includes(a.op);
      const modeLabels: Record<string, [string, string, string]> = {
        mute: ['Переключить', 'Выключить', 'Включить'],
        source: ['Переключить', 'Показать', 'Скрыть'],
        filter: ['Переключить', 'Включить', 'Выключить'],
      };
      const ml = modeLabels[a.op] ?? ['Переключить', 'Запустить', 'Остановить'];
      return (
        <>
          <Select value={a.op} onChange={(op) => onChange({ ...a, op })} options={OBS_OPS} />
          {(a.op === 'scene' || a.op === 'source') && (
            <Field label="Сцена"><Text value={a.scene} onChange={(scene) => onChange({ ...a, scene })} list={obs.scenes} placeholder="Имя сцены" /></Field>
          )}
          {a.op === 'source' && (
            <Field label="Источник"><Text value={a.source} onChange={(source) => onChange({ ...a, source })} list={sources} placeholder="Имя источника" /></Field>
          )}
          {a.op === 'filter' && (
            <>
              <Field label="Источник или сцена"><Text value={a.source} onChange={(source) => onChange({ ...a, source })} list={[...obs.inputs, ...obs.scenes]} placeholder="Микрофон" /></Field>
              <Field label="Фильтр" hint="Имя фильтра как в OBS: правый клик по источнику → Фильтры."><Text value={a.filter} onChange={(filter) => onChange({ ...a, filter })} placeholder="Изменение голоса" /></Field>
            </>
          )}
          {a.op === 'collection' && (
            <Field label="Коллекция"><Text value={a.collection} onChange={(collection) => onChange({ ...a, collection })} list={obs.collections} placeholder="Имя коллекции" /></Field>
          )}
          {a.op === 'mute' && (
            <Field label="Вход со звуком"><Text value={a.input} onChange={(input) => onChange({ ...a, input })} list={obs.audioInputs} placeholder="Микрофон" /></Field>
          )}
          {toggleable && (
            <Seg value={a.mode} onChange={(mode) => onChange({ ...a, mode })} options={[{ v: 'toggle', label: ml[0] }, { v: 'start', label: ml[1] }, { v: 'stop', label: ml[2] }]} />
          )}
          {!obs.connected && <span className="fld-hint warn">OBS не подключён — списков сцен нет, имена можно вписать вручную.</span>}
        </>
      );
    }
    case 'page':
      return (
        <Select
          value={a.page}
          onChange={(page) => onChange({ ...a, page })}
          options={[
            { v: '@back', label: '← Назад (предыдущая)' },
            { v: '@home', label: '⌂ Главная' },
            { v: '@next', label: '→ Следующая' },
            { v: '@prev', label: '← Предыдущая по списку' },
            ...profile.pages.map((p) => ({ v: p.id, label: p.name })),
          ]}
        />
      );
    case 'delay':
      return <Field label="Миллисекунды" row><Num value={a.ms} min={0} max={60000} onChange={(ms) => onChange({ ...a, ms })} /></Field>;
    case 'sound':
      return (
        <>
          <div className="two-wide">
            <Text value={a.file} onChange={(file) => onChange({ ...a, file })} placeholder="C:\…\звук.mp3" mono />
            <button
              className="btn"
              onClick={async () => {
                const p = await pickFile([{ name: 'Звуки', extensions: ['mp3', 'wav', 'ogg', 'flac'] }]);
                if (p) onChange({ ...a, file: p });
              }}
            >Обзор</button>
          </div>
          <Field label="Громкость"><Range value={a.volume} min={5} max={200} suffix="%" onChange={(volume) => onChange({ ...a, volume })} /></Field>
          <Field label="Повторное нажатие">
            <Seg value={a.mode} onChange={(mode) => onChange({ ...a, mode })} options={[
              { v: 'restart', label: 'Сначала', title: 'Звук начнётся заново' },
              { v: 'toggle', label: 'Стоп', title: 'Второе нажатие останавливает звук' },
              { v: 'overlap', label: 'Поверх', title: 'Ещё один звук поверх играющего' },
            ]} />
          </Field>
          <Field label="Куда выводить" hint="Чтобы зрители слышали звук, выберите устройство, которое захватывает OBS, или добавьте его в OBS как «Захват выходного аудио».">
            <Select value={a.device} onChange={(device) => onChange({ ...a, device })} options={[{ v: '', label: 'Устройство Windows по умолчанию' }, ...outs.map((x) => ({ v: x, label: x }))]} />
          </Field>
        </>
      );
    case 'stopSounds':
      return null;
    case 'device': {
      const cur = states[a.input ? 'system.input' : 'system.output'];
      const toggleDev = (name: string) => onChange({ ...a, devices: a.devices.includes(name) ? a.devices.filter((d) => d !== name) : [...a.devices, name] });
      return (
        <>
          <Seg value={a.input ? 'in' : 'out'} onChange={(v) => onChange({ ...a, input: v === 'in', devices: [] })} options={[{ v: 'out', label: 'Вывод (наушники, колонки)' }, { v: 'in', label: 'Микрофон' }]} />
          <div className="dev-list">
            {devs.map((d) => (
              <label key={d.id} className={`dev ${a.devices.includes(d.name) ? 'on' : ''}`}>
                <input type="checkbox" checked={a.devices.includes(d.name)} onChange={() => toggleDev(d.name)} />
                <span>{d.name}</span>
                {d.default && <small>сейчас</small>}
              </label>
            ))}
            {devs.length === 0 && <span className="fld-hint">Устройства не найдены.</span>}
          </div>
          <span className="fld-hint">
            {a.devices.length > 1
              ? `Каждое нажатие включает следующее по кругу: ${a.devices.map((d) => d.replace(/\s*\(.*\)$/, '')).join(' → ')}.`
              : 'Отметьте одно устройство — клавиша включит его. Два и больше — будет переключать по кругу.'}
            {typeof cur === 'string' && ` Сейчас: ${cur}.`}
          </span>
        </>
      );
    }
    case 'counter':
      return (
        <>
          <Field label="Имя счётчика" hint={`На клавише его покажет подпись {counter:${a.name || 'имя'}}. Сейчас: ${Number(states[`counter:${a.name}`] ?? 0)}.`}>
            <Text value={a.name} onChange={(name) => onChange({ ...a, name })} placeholder="Смерти" />
          </Field>
          <Seg value={a.op === 'add' ? (a.value < 0 ? 'dec' : 'inc') : a.op} onChange={(v) => onChange(
            v === 'inc' ? { ...a, op: 'add', value: Math.abs(a.value) || 1 }
              : v === 'dec' ? { ...a, op: 'add', value: -(Math.abs(a.value) || 1) }
                : { ...a, op: v as 'set' | 'reset', value: v === 'set' ? 0 : a.value },
          )} options={[{ v: 'inc', label: '+ Прибавить' }, { v: 'dec', label: '− Отнять' }, { v: 'set', label: 'Задать' }, { v: 'reset', label: 'Сбросить' }]} />
          {a.op !== 'reset' && (
            <Field label={a.op === 'set' ? 'Значение' : 'На сколько'}>
              <Num value={a.op === 'add' ? Math.abs(a.value) : a.value} min={a.op === 'add' ? 1 : -99999} max={99999} onChange={(v) => onChange({ ...a, value: a.op === 'add' && a.value < 0 ? -v : v })} />
            </Field>
          )}
          <Field label="Файл для OBS" hint="Необязательно. Число запишется в файл — в OBS добавьте «Текст» с галочкой «Читать из файла».">
            <div className="two-wide">
              <Text value={a.file} onChange={(file) => onChange({ ...a, file })} placeholder="C:\stream\deaths.txt" mono />
              <button className="btn" onClick={async () => {
                const p = await saveFile(`${a.name || 'counter'}.txt`, [{ name: 'Текст', extensions: ['txt'] }]);
                if (p) onChange({ ...a, file: p });
              }}>Обзор</button>
            </div>
          </Field>
        </>
      );
    case 'timer':
      return (
        <>
          <Field label="Имя секундомера" hint={`На клавише время покажет подпись {timer:${a.name || 'имя'}}.`}>
            <Text value={a.name} onChange={(name) => onChange({ ...a, name })} placeholder="Таймер" />
          </Field>
          <Seg value={a.op} onChange={(op) => onChange({ ...a, op })} options={[
            { v: 'toggle', label: 'Старт / пауза' }, { v: 'start', label: 'Старт' }, { v: 'stop', label: 'Пауза' }, { v: 'reset', label: 'Сброс' },
          ]} />
        </>
      );
    case 'system':
      return (
        <>
          <Select value={a.op} onChange={(op) => onChange({ ...a, op })} options={[
            { v: 'lock', label: 'Заблокировать компьютер' },
            { v: 'monitorOff', label: 'Выключить монитор' },
            { v: 'sleep', label: 'Спящий режим' },
            { v: 'logoff', label: 'Выйти из учётной записи' },
            { v: 'restart', label: 'Перезагрузить' },
            { v: 'shutdown', label: 'Выключить компьютер' },
          ]} />
          {(a.op === 'shutdown' || a.op === 'restart' || a.op === 'logoff') && (
            <span className="fld-hint warn">Сработает сразу, без вопросов. Надёжнее повесить на долгое нажатие.</span>
          )}
        </>
      );
    case 'mouse':
      return (
        <>
          <Select value={a.op} onChange={(op) => onChange({ ...a, op })} options={[
            { v: 'left', label: 'Левый щелчок' },
            { v: 'double', label: 'Двойной щелчок' },
            { v: 'right', label: 'Правый щелчок' },
            { v: 'middle', label: 'Щелчок колёсиком' },
            { v: 'scrollUp', label: 'Прокрутить вверх' },
            { v: 'scrollDown', label: 'Прокрутить вниз' },
          ]} />
          {(a.op === 'scrollUp' || a.op === 'scrollDown') && (
            <Field label="Щелчков колеса"><Range value={a.amount} min={1} max={20} onChange={(amount) => onChange({ ...a, amount })} /></Field>
          )}
          <span className="fld-hint">Там, где сейчас курсор.</span>
        </>
      );
    case 'http':
      return (
        <>
          <div className="two-wide http-row">
            <Select value={a.method} onChange={(method) => onChange({ ...a, method })} options={[{ v: 'GET', label: 'GET' }, { v: 'POST', label: 'POST' }, { v: 'PUT', label: 'PUT' }, { v: 'DELETE', label: 'DELETE' }]} />
            <Text value={a.url} onChange={(url) => onChange({ ...a, url })} placeholder="https://…" mono />
          </div>
          {a.method !== 'GET' && (
            <Field label="Тело запроса" hint="Для вебхука Discord: {&quot;content&quot;: &quot;Стрим начался!&quot;}">
              <textarea className="inp mono" rows={3} value={a.body} onChange={(e) => onChange({ ...a, body: e.target.value })} placeholder='{"content": "Стрим начался!"}' />
            </Field>
          )}
          <Field label="Заголовки" hint="Необязательно. По одному на строку: Authorization: Bearer …">
            <textarea className="inp mono" rows={2} value={a.headers} onChange={(e) => onChange({ ...a, headers: e.target.value })} />
          </Field>
        </>
      );
  }
}

export function soundName(file: string) {
  return baseName(file).replace(/\.[a-z0-9]+$/i, '');
}

export function AddActionMenu({ onAdd }: { onAdd: (a: Action) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="add-act">
      <button className="btn primary wide" onClick={() => setOpen(!open)}>+ Добавить действие</button>
      {open && (
        <div className="add-act-list">
          {GROUPS.map((g) => (
            <div key={g} className="add-act-group">
              <h5>{g}</h5>
              {ACTION_TYPES.filter((t) => t.group === g).map((t) => (
                <button key={t.type} onClick={() => { onAdd(defaultAction(t.type)); setOpen(false); }}>
                  <span className="act-ic">{t.icon}</span>
                  <span><b>{t.name}</b><small>{t.hint}</small></span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
