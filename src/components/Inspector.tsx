import { useMemo, useState } from 'react';
import { Copy, Play, Trash2 } from 'lucide-react';
import { PAGE_BACKGROUNDS, STYLE_PRESETS, suggestActive, uid, withStyle, newButton, newPage } from '../../shared/defaults';
import { ButtonFace, fillCss } from '../../shared/render';
import type { Action, ActiveRule, Button, ButtonStyle, Fill, SliderTarget } from '../../shared/types';
import { api } from '../api';
import { useStore } from '../store';
import { ActionCard, AddActionMenu } from './ActionEditor';
import { firstFree, fits } from './Canvas';
import { IconPicker } from './IconPicker';
import { Color, Field, FillEditor, Num, Range, Section, Seg, Text, Toggle } from './ui';

export function Inspector() {
  const { selectedButton } = useStore();
  return (
    <aside className="insp">
      {selectedButton ? <ButtonInspector key={selectedButton.id} b={selectedButton} /> : <PageInspector />}
    </aside>
  );
}

// ---------------- кнопка ----------------

function ButtonInspector({ b }: { b: Button }) {
  const { updateButton, updatePage, select, page } = useStore();
  const [tab, setTab] = useState<'look' | 'actions' | 'active'>('look');
  const up = (fn: (x: Button) => void, merge?: string) => updateButton(b.id, fn, merge);

  return (
    <>
      <div className="insp-head">
        <Seg
          value={b.type}
          onChange={(type) => up((x) => {
            x.type = type;
            if (type === 'slider' && !x.slider) x.slider = { target: { kind: 'master', input: '', app: '' }, vertical: x.h >= x.w, color: '#8F6BFF' };
          })}
          options={[{ v: 'button', label: 'Кнопка' }, { v: 'slider', label: 'Слайдер' }]}
        />
        <div className="insp-head-tools">
          <button
            className="icon-btn" title="Копия (Ctrl+D)"
            onClick={() => {
              const spot = firstFree(page, b.w, b.h) ?? firstFree(page);
              if (!spot) return;
              const ok = fits(page, spot.x, spot.y, b.w, b.h);
              const c: Button = { ...structuredClone(b), id: uid(), ...spot, w: ok ? b.w : 1, h: ok ? b.h : 1 };
              updatePage((p) => { p.buttons.push(c); });
              select(c.id);
            }}
          ><Copy size={15} /></button>
          <button className="icon-btn danger" title="Удалить (Delete)" onClick={() => { updatePage((p) => { p.buttons = p.buttons.filter((x) => x.id !== b.id); }); select(null); }}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      <div className="tabs">
        <button className={tab === 'look' ? 'on' : ''} onClick={() => setTab('look')}>Вид</button>
        <button className={tab === 'actions' ? 'on' : ''} onClick={() => setTab('actions')}>
          {b.type === 'slider' ? 'Управляет' : 'Действия'}{b.type === 'button' && b.actions.length > 0 && <i>{b.actions.length}</i>}
        </button>
        {b.type === 'button' && <button className={tab === 'active' ? 'on' : ''} onClick={() => setTab('active')}>Подсветка{b.active && <i>●</i>}</button>}
      </div>
      <div className="insp-body">
        {tab === 'look' && <LookTab b={b} up={up} />}
        {tab === 'actions' && (b.type === 'slider' ? <SliderTab b={b} up={up} /> : <ActionsTab b={b} up={up} />)}
        {tab === 'active' && b.type === 'button' && <ActiveTab b={b} up={up} />}
      </div>
    </>
  );
}

type Up = (fn: (x: Button) => void, merge?: string) => void;

const LABEL_VARS = [
  { v: '{time}', t: 'Время' },
  { v: '{obs.scene}', t: 'Сцена OBS' },
  { v: '{system.volume}', t: 'Громкость' },
  { v: '{system.cpu}', t: 'ЦП %' },
  { v: '{system.ram}', t: 'ОЗУ %' },
  { v: '{date}', t: 'Дата' },
];

function LookTab({ b, up }: { b: Button; up: Up }) {
  const { profile, states } = useStore();
  const s = b.style;
  const set = <K extends keyof ButtonStyle>(k: K, v: ButtonStyle[K], merge = true) => up((x) => { x.style[k] = v; }, merge ? `style.${k}` : undefined);
  const [iconOpen, setIconOpen] = useState(false);
  return (
    <>
      <Section title="Готовые стили">
        <div className="presets">
          {STYLE_PRESETS.map((p) => {
            const demo: Button = { ...b, type: 'button', w: 1, h: 1, active: null, style: { ...s, ...p.style } };
            return (
              <button key={p.id} className="preset" title={p.name} onClick={() => up((x) => { Object.assign(x.style, p.style); })}>
                <div className="ft-cell"><ButtonFace button={demo} states={states} accent={profile.accent} /></div>
                <span>{p.name}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Надпись">
        <Text value={s.label} onChange={(v) => set('label', v)} placeholder="Текст на кнопке" />
        <div className="chips">
          {LABEL_VARS.map((x) => (
            <button key={x.v} className="chip" title={`Вставить ${x.v}`} onClick={() => set('label', (s.label + ' ' + x.v).trim(), false)}>{x.t}</button>
          ))}
        </div>
        <Seg value={s.labelPos} onChange={(v) => set('labelPos', v, false)} options={[{ v: 'top', label: 'Сверху' }, { v: 'center', label: 'По центру' }, { v: 'bottom', label: 'Снизу' }, { v: 'hidden', label: 'Скрыть' }]} />
        <Seg value={s.font} onChange={(v) => set('font', v, false)} options={[
          { v: 'onest', label: <span style={{ fontFamily: 'Onest Variable' }}>Onest</span> },
          { v: 'unbounded', label: <span style={{ fontFamily: 'Unbounded Variable' }}>Unbounded</span> },
          { v: 'mono', label: <span style={{ fontFamily: 'JetBrains Mono Variable' }}>Mono</span> },
        ]} />
        <Field label="Размер"><Range value={s.fontSize} min={6} max={40} onChange={(v) => set('fontSize', v)} /></Field>
        <div className="two">
          <Color compact value={s.textColor} onChange={(v) => set('textColor', v)} />
          <Toggle checked={s.bold} onChange={(v) => set('bold', v, false)} label="Жирный" />
        </div>
      </Section>

      <Section title="Значок" right={<button className="btn ghost sm" onClick={() => setIconOpen(!iconOpen)}>{iconOpen ? 'Свернуть' : 'Выбрать'}</button>}>
        {iconOpen && <IconPicker value={s.icon} onChange={(v) => set('icon', v, false)} />}
        {s.icon.kind !== 'none' && (
          <>
            <Field label="Размер"><Range value={s.iconSize} min={10} max={90} onChange={(v) => set('iconSize', v)} /></Field>
            {s.icon.kind !== 'emoji' && s.icon.kind !== 'image' && <Color value={s.iconColor} onChange={(v) => set('iconColor', v)} />}
          </>
        )}
      </Section>

      <Section title="Фон">
        <FillEditor fill={s.fill} onChange={(f) => set('fill', f)} />
      </Section>

      <Section title="Форма и эффекты">
        <Field label="Скругление"><Range value={s.radius} min={0} max={50} onChange={(v) => set('radius', v)} /></Field>
        <Field label="Рамка"><Range value={s.borderWidth} min={0} max={8} onChange={(v) => set('borderWidth', v)} /></Field>
        {s.borderWidth > 0 && <Color value={s.borderColor} onChange={(v) => set('borderColor', v)} />}
        <Field label="Тень">
          <Seg value={s.shadow} onChange={(v) => set('shadow', v, false)} options={[{ v: 'none', label: 'Нет' }, { v: 'soft', label: 'Мягкая' }, { v: 'lift', label: 'Объём' }, { v: 'glow', label: 'Свечение' }]} />
        </Field>
        {s.shadow === 'glow' && <Color value={s.glowColor} onChange={(v) => set('glowColor', v)} />}
        <Field label="Нажатие">
          <Seg value={s.press} onChange={(v) => set('press', v, false)} options={[{ v: 'scale', label: 'Вдавить' }, { v: 'pop', label: 'Выпрыгнуть' }, { v: 'ripple', label: 'Волна' }, { v: 'none', label: 'Нет' }]} />
        </Field>
      </Section>
    </>
  );
}

function ActionsTab({ b, up }: { b: Button; up: Up }) {
  const [result, setResult] = useState<string | null>(null);
  const change = (i: number, a: Action) => up((x) => {
    const old = x.actions[i];
    x.actions[i] = a;
    autoActive(x, old, a);
    autoLabel(x, a);
  }, `act${i}`);
  return (
    <>
      {b.actions.length === 0 && (
        <div className="empty">Кнопка пока ничего не делает. Добавьте действие — их можно выстроить цепочкой, они выполнятся по порядку.</div>
      )}
      {b.actions.map((a, i) => (
        <ActionCard
          key={i}
          action={a}
          index={i}
          count={b.actions.length}
          onChange={(na) => change(i, na)}
          onRemove={() => up((x) => {
            const [old] = x.actions.splice(i, 1);
            const sug = suggestActive(old);
            if (sug && x.active && x.active.state === sug.state && x.active.equals === sug.equals) x.active = null;
          })}
          onMove={(d) => up((x) => { const [it] = x.actions.splice(i, 1); x.actions.splice(i + d, 0, it); })}
        />
      ))}
      <AddActionMenu onAdd={(a) => up((x) => { x.actions.push(a); autoActive(x, null, a); })} />
      {b.actions.length > 0 && (
        <button
          className="btn wide"
          onClick={async () => {
            const errs = await api.testActions(b.actions);
            setResult(errs.length ? errs.join('\n') : 'Выполнено');
            setTimeout(() => setResult(null), 2500);
          }}
        ><Play size={14} /> Проверить на этом ПК</button>
      )}
      {result && <div className={`note ${result === 'Выполнено' ? 'ok' : 'bad'}`}>{result}</div>}
    </>
  );
}

/** Подсветку, подобранную автоматически, обновляем вместе с действием. Свою не трогаем. */
function autoActive(x: Button, old: Action | null, a: Action) {
  const prev = old ? suggestActive(old) : null;
  const next = suggestActive(a);
  const wasAuto = !x.active || (prev && x.active.state === prev.state && x.active.equals === prev.equals);
  if (!wasAuto) return;
  if (next) x.active = { ...next, style: x.active && Object.keys(x.active.style).length ? x.active.style : next.style };
  else if (prev) x.active = null;
}

function autoLabel(x: Button, a: Action) {
  const generic = ['', 'Кнопка'];
  if (a.type !== 'obs') return;
  const name = a.op === 'scene' ? a.scene : a.op === 'collection' ? a.collection : a.op === 'mute' ? a.input : a.op === 'source' ? a.source : '';
  if (name && (generic.includes(x.style.label) || x.style.label.length < name.length && name.startsWith(x.style.label))) x.style.label = name;
}

function SliderTab({ b, up }: { b: Button; up: Up }) {
  const { obs } = useStore();
  const [apps, setApps] = useState<string[]>([]);
  const sl = b.slider!;
  const t = sl.target;
  const setTarget = (target: SliderTarget) => up((x) => { x.slider!.target = target; });
  return (
    <>
      <Section title="Что крутит слайдер">
        <Seg
          value={t.kind}
          onChange={(kind) => {
            if (kind === 'app') api.audioApps().then(setApps);
            setTarget(kind === 'master' ? { kind, input: '', app: '' } : kind === 'obsInput' ? { kind, input: obs.audioInputs[0] ?? '', app: '' } : { kind, input: '', app: '' });
          }}
          options={[{ v: 'master', label: 'Громкость ПК' }, { v: 'app', label: 'Программа' }, { v: 'obsInput', label: 'Вход OBS' }]}
        />
        {t.kind === 'obsInput' && (
          <Field label="Вход OBS"><Text value={t.input} onChange={(input) => setTarget({ kind: 'obsInput', input, app: '' })} list={obs.audioInputs} placeholder="Микрофон" /></Field>
        )}
        {t.kind === 'app' && (
          <Field label="Программа" hint="Например discord.exe. Список — программы, которые сейчас играют звук.">
            <Text value={t.app} onChange={(app) => setTarget({ kind: 'app', input: '', app })} list={apps} placeholder="discord.exe" mono />
          </Field>
        )}
      </Section>
      <Section title="Вид">
        <Seg value={sl.vertical ? 'v' : 'h'} onChange={(v) => up((x) => { x.slider!.vertical = v === 'v'; })} options={[{ v: 'v', label: 'Вертикальный' }, { v: 'h', label: 'Горизонтальный' }]} />
        <Field label="Цвет полосы"><Color value={sl.color} onChange={(color) => up((x) => { x.slider!.color = color; }, 'slcolor')} /></Field>
      </Section>
    </>
  );
}

function ActiveTab({ b, up }: { b: Button; up: Up }) {
  const { states } = useStore();
  const keys = useMemo(() => Object.keys(states).sort(), [states]);
  const rule = b.active;
  const setRule = (fn: (r: ActiveRule) => void, merge?: string) => up((x) => { if (x.active) fn(x.active); }, merge);
  if (!rule) {
    return (
      <>
        <div className="empty">
          Кнопка может менять вид сама: подсвечиваться, когда сцена в эфире, краснеть, когда микрофон выключен.
          Для действий OBS и звука подсветка настраивается сама, когда вы их добавляете.
        </div>
        <button className="btn primary wide" onClick={() => up((x) => {
          x.active = (x.actions.map(suggestActive).find(Boolean) as ActiveRule | undefined) ?? { state: 'obs.streaming', equals: '', style: {}, dot: true };
        })}>Включить подсветку</button>
      </>
    );
  }
  const cur = states[rule.state];
  const st = rule.style;
  const setSt = <K extends keyof ButtonStyle>(k: K, v: ButtonStyle[K] | undefined) => setRule((r) => {
    if (v === undefined) delete r.style[k];
    else r.style[k] = v;
  }, `ast.${k}`);
  return (
    <>
      <Section title="Когда подсвечивать" right={<button className="btn ghost sm" onClick={() => up((x) => { x.active = null; })}>Выключить</button>}>
        <Field label="Состояние" hint={`Сейчас: ${cur === undefined ? 'нет данных' : JSON.stringify(cur)}`}>
          <Text value={rule.state} onChange={(v) => setRule((r) => { r.state = v; }, 'astate')} list={keys} mono placeholder="obs.scene" />
        </Field>
        <Field label="Равно" hint="Пусто — подсвечивать, когда значение «включено».">
          <Text value={rule.equals} onChange={(v) => setRule((r) => { r.equals = v; }, 'aeq')} placeholder="например, Игра" />
        </Field>
      </Section>
      <Section title="Как выглядит">
        <Toggle checked={rule.dot} onChange={(v) => setRule((r) => { r.dot = v; })} label="Точка-индикатор в углу" />
        <Toggle checked={!!st.fill} onChange={(v) => setSt('fill', v ? { type: 'solid', color: '#E5484D' } as Fill : undefined)} label="Другой фон" />
        {st.fill && <FillEditor fill={st.fill} onChange={(f) => setSt('fill', f)} allowImage={false} />}
        <Toggle checked={st.textColor !== undefined} onChange={(v) => { setSt('textColor', v ? '#FFFFFF' : undefined); setSt('iconColor', v ? '#FFFFFF' : undefined); }} label="Другой цвет текста и значка" />
        {st.textColor !== undefined && <Color value={st.textColor} onChange={(c) => { setSt('textColor', c); setSt('iconColor', c); }} />}
        <Toggle checked={st.label !== undefined} onChange={(v) => setSt('label', v ? b.style.label : undefined)} label="Другая надпись" />
        {st.label !== undefined && <Text value={st.label} onChange={(v) => setSt('label', v)} />}
        <Toggle checked={st.icon !== undefined} onChange={(v) => setSt('icon', v ? b.style.icon : undefined)} label="Другой значок" />
        {st.icon !== undefined && <IconPicker value={st.icon} onChange={(i) => setSt('icon', i)} />}
        {Object.keys(st).length === 0 && <span className="fld-hint">Без своих настроек вокруг кнопки появится цветное кольцо.</span>}
      </Section>
    </>
  );
}

// ---------------- страница ----------------

function PageInspector() {
  const { page, profile, update, updatePage, obs, setPageId } = useStore();
  const maxX = Math.max(1, ...page.buttons.map((b) => b.x + b.w));
  const maxY = Math.max(1, ...page.buttons.map((b) => b.y + b.h));

  const genObsPage = () => {
    const p = newPage('Сцены OBS', Math.min(5, Math.max(3, Math.ceil(Math.sqrt(obs.scenes.length + 3)))), 3);
    const cols = p.cols;
    const list: Button[] = [];
    let i = 0;
    for (const sc of obs.scenes) {
      const a: Action = { type: 'obs', op: 'scene', mode: 'toggle', scene: sc, input: '', source: '', collection: '' };
      list.push(newButton(0, 0, { ...placeFix(i++, cols), style: withStyle({ label: sc, labelPos: 'center', fontSize: 15, icon: { kind: 'none' } }), actions: [a], active: suggestActive(a) }));
    }
    const mic = obs.audioInputs.find((n) => /mic|микро/i.test(n)) ?? obs.audioInputs[0];
    const extra: [string, string, Action][] = [
      ['Эфир', 'Radio', { type: 'obs', op: 'stream', mode: 'toggle', scene: '', input: '', source: '', collection: '' }],
      ['Запись', 'Circle', { type: 'obs', op: 'record', mode: 'toggle', scene: '', input: '', source: '', collection: '' }],
    ];
    if (mic) extra.push([mic, 'Mic', { type: 'obs', op: 'mute', mode: 'toggle', scene: '', input: mic, source: '', collection: '' }]);
    for (const [label, icon, a] of extra) {
      list.push(newButton(0, 0, { ...placeFix(i++, cols), style: withStyle({ label, icon: { kind: 'lucide', name: icon } }), actions: [a], active: suggestActive(a) }));
    }
    p.rows = Math.max(2, Math.ceil(list.length / cols));
    p.buttons = list;
    update((pr) => { pr.pages.push(p); });
    setPageId(p.id);
  };

  return (
    <>
      <div className="insp-head"><h3>Страница</h3></div>
      <div className="insp-body">
        <Section title="Основное">
          <Field label="Название"><Text value={page.name} onChange={(v) => updatePage((p) => { p.name = v; }, 'pname')} /></Field>
          <div className="two">
            <Field label="Столбцы"><Num value={page.cols} min={Math.max(1, maxX)} max={12} onChange={(v) => updatePage((p) => { p.cols = v; })} /></Field>
            <Field label="Строки"><Num value={page.rows} min={Math.max(1, maxY)} max={10} onChange={(v) => updatePage((p) => { p.rows = v; })} /></Field>
          </div>
          <Field label="Расстояние между кнопками"><Range value={page.gap} min={0} max={32} suffix=" px" onChange={(v) => updatePage((p) => { p.gap = v; }, 'pgap')} /></Field>
          <Toggle checked={profile.home === page.id} onChange={(v) => v && update((p) => { p.home = page.id; })} label="Открывать первой (главная)" />
        </Section>
        <Section title="Фон страницы">
          <div className="bg-presets">
            {PAGE_BACKGROUNDS.map((f, i) => (
              <button key={i} style={fillCss(f as Fill)} onClick={() => updatePage((p) => { p.background = structuredClone(f) as Fill; })} />
            ))}
          </div>
          <FillEditor fill={page.background} onChange={(f) => updatePage((p) => { p.background = f; }, 'pbg')} />
        </Section>
        <Section title="Весь пульт">
          <Field label="Цвет выделения"><Color value={profile.accent} onChange={(v) => update((p) => { p.accent = v; }, 'accent')} /></Field>
          <Toggle checked={profile.pageDots} onChange={(v) => update((p) => { p.pageDots = v; })} label="Точки страниц внизу пульта" />
        </Section>
        <Section title="Быстрый старт">
          <button className="btn wide" disabled={!obs.connected || obs.scenes.length === 0} onClick={genObsPage}>
            Страница со всеми сценами OBS
          </button>
          <span className="fld-hint">
            {obs.connected ? `Сцен в OBS: ${obs.scenes.length}. Кнопки сами подсветятся, когда сцена в эфире.` : 'Подключите OBS в настройках, чтобы собрать страницу из его сцен.'}
          </span>
        </Section>
      </div>
    </>
  );
}

function placeFix(i: number, cols: number) {
  return { x: i % cols, y: Math.floor(i / cols) };
}
