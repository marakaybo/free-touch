import { useEffect, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, AppWindow, Clock, Command, FileText, Keyboard, Layers, Music, Radio, Trash2, Volume2 } from 'lucide-react';
import { defaultAction } from '../../shared/defaults';
import type { Action, ObsOp } from '../../shared/types';
import { api, pickFile } from '../api';
import { useStore } from '../store';
import { HotkeyInput } from './HotkeyInput';
import { Field, Num, Range, Select, Seg, Text, Toggle } from './ui';

export const ACTION_TYPES: { type: Action['type']; name: string; icon: ReactNode; hint: string }[] = [
  { type: 'obs', name: 'OBS', icon: <Radio size={16} />, hint: 'Сцены, стрим, запись, микрофон' },
  { type: 'hotkey', name: 'Сочетание клавиш', icon: <Keyboard size={16} />, hint: 'Ctrl+Shift+M, F13…' },
  { type: 'open', name: 'Открыть', icon: <AppWindow size={16} />, hint: 'Программу, файл, сайт' },
  { type: 'volume', name: 'Громкость', icon: <Volume2 size={16} />, hint: 'Общая или отдельной программы' },
  { type: 'media', name: 'Медиа', icon: <Music size={16} />, hint: 'Пауза, следующий трек' },
  { type: 'text', name: 'Напечатать текст', icon: <FileText size={16} />, hint: 'Вставит текст в активное окно' },
  { type: 'page', name: 'Перейти на страницу', icon: <Layers size={16} />, hint: 'Навигация по пульту' },
  { type: 'command', name: 'Команда', icon: <Command size={16} />, hint: 'Команда cmd без окна' },
  { type: 'delay', name: 'Пауза', icon: <Clock size={16} />, hint: 'Подождать между действиями' },
];

const OBS_OPS: { v: ObsOp; label: string }[] = [
  { v: 'scene', label: 'Переключить сцену' },
  { v: 'collection', label: 'Сменить коллекцию сцен' },
  { v: 'stream', label: 'Стрим' },
  { v: 'record', label: 'Запись' },
  { v: 'recordPause', label: 'Пауза записи' },
  { v: 'mute', label: 'Выключить звук входа' },
  { v: 'source', label: 'Показать / скрыть источник' },
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
          <button className="icon-btn" disabled={index === 0} onClick={() => onMove(-1)} title="Выше"><ArrowUp size={14} /></button>
          <button className="icon-btn" disabled={index === count - 1} onClick={() => onMove(1)} title="Ниже"><ArrowDown size={14} /></button>
          <button className="icon-btn danger" onClick={onRemove} title="Удалить"><Trash2 size={14} /></button>
        </span>
      </div>
      <div className="act-body"><ActionFields action={action} onChange={onChange} /></div>
    </div>
  );
}

function ActionFields({ action: a, onChange }: { action: Action; onChange: (a: Action) => void }) {
  const { obs, profile } = useStore();
  const [apps, setApps] = useState<string[]>([]);
  useEffect(() => {
    if (a.type === 'volume') api.audioApps().then(setApps);
  }, [a.type]);

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
            { v: 'prev', label: '⏮' , title: 'Предыдущий' },
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
              options={[{ v: '', label: 'Весь звук Windows' }, ...apps.map((x) => ({ v: x, label: x }))]}
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
          {apps.length === 0 && <span className="fld-hint">Программа появится в списке, когда начнёт играть звук.</span>}
        </>
      );
    case 'obs': {
      const sources = a.scene ? obs.sources[a.scene] ?? [] : [];
      const toggleable = ['stream', 'record', 'replay', 'virtualcam', 'mute', 'source'].includes(a.op);
      const modeLabels: Record<string, [string, string, string]> = {
        mute: ['Переключить', 'Выключить', 'Включить'],
        source: ['Переключить', 'Показать', 'Скрыть'],
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
  }
}

export function AddActionMenu({ onAdd }: { onAdd: (a: Action) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="add-act">
      <button className="btn primary wide" onClick={() => setOpen(!open)}>+ Добавить действие</button>
      {open && (
        <div className="add-act-list">
          {ACTION_TYPES.map((t) => (
            <button key={t.type} onClick={() => { onAdd(defaultAction(t.type)); setOpen(false); }}>
              <span className="act-ic">{t.icon}</span>
              <span><b>{t.name}</b><small>{t.hint}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
