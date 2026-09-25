import { useMemo, useState } from 'react';
import { DIM_TEXT, KEY_COLORS, LIVE_STATES, PAGE_BACKGROUNDS, icon as phIcon, keyColorStyle, suggestActive, withStyle, newButton, newPage } from '../../shared/defaults';
import { BRANDS } from '../../shared/brands';
import { IconView, Ph, fillCss } from '../../shared/render';
import type { Action, ActiveRule, Button, ButtonStyle, Fill, NavStyle, SliderTarget } from '../../shared/types';
import { api } from '../api';
import { useStore } from '../store';
import { ActionCard, AddActionMenu } from './ActionEditor';
import { freeRectsOf, layoutOf, removeButton, setGrid, setRect } from '../../shared/layout';
import { duplicate, useAreas } from './Canvas';
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
  const { updateButton, updatePage, select, orient } = useStore();
  const areas = useAreas();
  const [tab, setTab] = useState<'look' | 'actions' | 'active'>('look');
  const up = (fn: (x: Button) => void, merge?: string) => updateButton(b.id, fn, merge);

  return (
    <>
      <div className="insp-head">
        <Seg
          value={b.type}
          onChange={(type) => up((x) => {
            x.type = type;
            if (type === 'slider' && !x.slider) x.slider = { target: { kind: 'master', input: '', app: '' }, vertical: x.h >= x.w, color: '#3D7BFF' };
          })}
          options={[{ v: 'button', label: 'Кнопка' }, { v: 'slider', label: 'Слайдер' }]}
        />
        <div className="insp-head-tools">
          <button
            className="icon-btn" title="Копия (Ctrl+D)"
            onClick={() => {
              let id: string | null = null;
              updatePage((p) => { id = duplicate(p, orient, b, areas); });
              if (id) select(id);
            }}
          ><Ph name="copy" size={16} /></button>
          <button className="icon-btn danger" title="Удалить (Delete)" onClick={() => { updatePage((p) => removeButton(p, b.id)); select(null); }}>
            <Ph name="trash" size={16} />
          </button>
        </div>
      </div>
      <div className="tabs">
        <button className={tab === 'look' ? 'on' : ''} onClick={() => setTab('look')}>Вид</button>
        <button className={tab === 'actions' ? 'on' : ''} onClick={() => setTab('actions')}>
          {b.type === 'slider' ? 'Управляет' : 'Действия'}{b.type === 'button' && b.actions.length + b.longActions.length > 0 && <i>{b.actions.length + b.longActions.length}</i>}
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

/** Свободная раскладка: точное место и размер клавиши в процентах экрана. */
function PlaceSection({ b }: { b: Button }) {
  const { page, orient, updatePage } = useStore();
  const areas = useAreas();
  if (page.mode !== 'free') return null;
  const a = areas[orient];
  const r = freeRectsOf(page, orient, a.w, a.h)[b.id];
  if (!r) return null;
  const set = (patch: Partial<typeof r>) => {
    const n = { ...r, ...patch };
    n.w = Math.max(3, Math.min(100, n.w));
    n.h = Math.max(3, Math.min(100, n.h));
    n.x = Math.max(0, Math.min(100 - n.w, n.x));
    n.y = Math.max(0, Math.min(100 - n.h, n.y));
    updatePage((p) => setRect(p, orient, b.id, n), `rect-${b.id}`);
  };
  const num = (v: number) => Math.round(v * 10) / 10;
  return (
    <Section title={`Место и размер · ${orient === 'portrait' ? 'вертикально' : 'горизонтально'}`}>
      <div className="xywh">
        <Field label="Слева, %"><Num value={num(r.x)} min={0} max={100} onChange={(x) => set({ x })} /></Field>
        <Field label="Сверху, %"><Num value={num(r.y)} min={0} max={100} onChange={(y) => set({ y })} /></Field>
        <Field label="Ширина, %"><Num value={num(r.w)} min={3} max={100} onChange={(w) => set({ w })} /></Field>
        <Field label="Высота, %"><Num value={num(r.h)} min={3} max={100} onChange={(h) => set({ h })} /></Field>
      </div>
      <div className="chips">
        <button className="chip" onClick={() => set({ x: 0, w: 100 })}>Во всю ширину</button>
        <button className="chip" onClick={() => set({ y: 0, h: 100 })}>Во всю высоту</button>
        <button className="chip" onClick={() => set({ w: r.h * a.h / a.w })} title="Сделать квадратной по высоте">Квадрат</button>
        <button className="chip" onClick={() => set({ x: (100 - r.w) / 2 })}>По центру</button>
      </div>
    </Section>
  );
}

function LookTab({ b, up }: { b: Button; up: Up }) {
  const s = b.style;
  const set = <K extends keyof ButtonStyle>(k: K, v: ButtonStyle[K], merge = true) => up((x) => { x.style[k] = v; }, merge ? `style.${k}` : undefined);
  const [iconOpen, setIconOpen] = useState(false);
  const curFill = s.fill.type === 'solid' ? s.fill.color.toUpperCase() : '';
  return (
    <>
      <PlaceSection b={b} />
      <Section title="Корпус">
        <div className="caps">
          {KEY_COLORS.map((c) => (
            <button
              key={c.id}
              className={`cap ${curFill === c.fill ? 'on' : ''}`}
              title={`${c.name} ${c.fill}`}
              onClick={() => up((x) => { Object.assign(x.style, keyColorStyle(c)); })}
            >
              <span style={{ background: c.fill }} />
              <small>{c.name}</small>
            </button>
          ))}
        </div>
        <FillEditor fill={s.fill} onChange={(f) => set('fill', f)} />
        <Field label="Форма">
          <Seg value={s.shadow} onChange={(v) => set('shadow', v, false)} options={[{ v: 'key', label: 'Клавиша' }, { v: 'flat', label: 'Плоская' }]} />
        </Field>
        <Field label="При нажатии">
          <Seg value={s.press} onChange={(v) => set('press', v, false)} options={[{ v: 'press', label: 'Уходит вниз' }, { v: 'none', label: 'Без движения' }]} />
        </Field>
        <Field label="Скругление"><Range value={s.radius} min={0} max={30} onChange={(v) => set('radius', v)} /></Field>
        <Field label="Рамка"><Range value={s.borderWidth} min={0} max={6} onChange={(v) => set('borderWidth', v)} /></Field>
        {s.borderWidth > 0 && <Color compact value={s.borderColor} onChange={(v) => set('borderColor', v)} />}
      </Section>

      <Section title="Подпись">
        <Text value={s.label} onChange={(v) => set('label', v)} placeholder="Текст на клавише" />
        <div className="chips">
          {LABEL_VARS.map((x) => (
            <button key={x.v} className="chip" title={`Вставить ${x.v}`} onClick={() => set('label', (s.label + ' ' + x.v).trim(), false)}>{x.t}</button>
          ))}
        </div>
        <Seg value={s.labelPos} onChange={(v) => set('labelPos', v, false)} options={[{ v: 'top', label: 'Сверху' }, { v: 'center', label: 'По центру' }, { v: 'bottom', label: 'Снизу' }, { v: 'hidden', label: 'Скрыть' }]} />
        <Seg value={s.font} onChange={(v) => set('font', v, false)} options={[
          { v: 'sans', label: <span style={{ fontFamily: "'IBM Plex Sans'" }}>Обычный</span> },
          { v: 'condensed', label: <span style={{ fontFamily: "'IBM Plex Sans Condensed'" }}>Узкий</span> },
          { v: 'mono', label: <span style={{ fontFamily: "'IBM Plex Mono'" }}>Моно</span> },
        ]} />
        <Field label="Размер"><Range value={s.fontSize} min={6} max={40} onChange={(v) => set('fontSize', v)} /></Field>
        <Field label="Цвет"><Color compact value={s.textColor} onChange={(v) => set('textColor', v)} /></Field>
        <Toggle checked={s.bold} onChange={(v) => set('bold', v, false)} label="Жирная" />
      </Section>

      <Section title="Значок" right={<button className="btn ghost sm" onClick={() => setIconOpen(!iconOpen)}>{iconOpen ? 'Свернуть' : 'Выбрать'}</button>}>
        {!iconOpen && s.icon.kind === 'none' && <span className="fld-hint">Без значка — только подпись.</span>}
        {iconOpen && <IconPicker value={s.icon} onChange={(v) => set('icon', v, false)} />}
        {s.icon.kind !== 'none' && (
          <>
            <Field label="Размер"><Range value={s.iconSize} min={10} max={90} onChange={(v) => set('iconSize', v)} /></Field>
            {s.icon.kind !== 'emoji' && s.icon.kind !== 'image' && <Field label="Цвет"><Color compact value={s.iconColor} onChange={(v) => set('iconColor', v)} /></Field>}
            {s.icon.kind === 'brand' && BRANDS[s.icon.name] && (
              <button className="btn ghost sm" onClick={() => set('iconColor', BRANDS[(s.icon as { name: string }).name].hex, false)}>
                <span className="brand-dot" style={{ background: BRANDS[s.icon.name].hex }} /> Фирменный цвет {BRANDS[s.icon.name].title}
              </button>
            )}
          </>
        )}
      </Section>
    </>
  );
}

function ActionsTab({ b, up }: { b: Button; up: Up }) {
  const [result, setResult] = useState<string | null>(null);
  const [which, setWhich] = useState<'actions' | 'longActions'>('actions');
  const main = which === 'actions';
  const list = b[which];
  const change = (i: number, a: Action) => up((x) => {
    const old = x[which][i];
    x[which][i] = a;
    if (main) { autoActive(x, old, a); autoLabel(x, a); }
  }, `${which}${i}`);
  return (
    <>
      <Seg
        value={which}
        onChange={setWhich}
        options={[
          { v: 'actions', label: <>Нажатие{b.actions.length > 0 && <em className="seg-n">{b.actions.length}</em>}</> },
          { v: 'longActions', label: <>Долгое нажатие{b.longActions.length > 0 && <em className="seg-n">{b.longActions.length}</em>}</> },
        ]}
      />
      {list.length === 0 && (
        <div className="empty">
          {main
            ? 'Кнопка пока ничего не делает. Добавьте действие — их можно выстроить цепочкой, они выполнятся по порядку.'
            : 'Второе действие на той же кнопке: сработает, если подержать палец полсекунды. Например, коротко — сменить сцену, долго — выключить микрофон.'}
        </div>
      )}
      {!main && list.length > 0 && b.actions.length > 0 && (
        <span className="fld-hint">Когда есть долгое нажатие, обычное срабатывает в момент, когда палец отпускают.</span>
      )}
      {list.map((a, i) => (
        <ActionCard
          key={`${which}${i}`}
          action={a}
          index={i}
          count={list.length}
          onChange={(na) => change(i, na)}
          onRemove={() => up((x) => {
            const [old] = x[which].splice(i, 1);
            if (!main) return;
            const sug = suggestActive(old);
            if (sug && x.active && x.active.state === sug.state && x.active.equals === sug.equals) x.active = null;
          })}
          onMove={(d) => up((x) => { const [it] = x[which].splice(i, 1); x[which].splice(i + d, 0, it); })}
        />
      ))}
      <AddActionMenu onAdd={(a) => up((x) => {
        if (!main && a.type === 'hotkey') a.hold = false;
        x[which].push(a);
        if (main) autoActive(x, null, a);
      })} />
      {list.length > 0 && (
        <button
          className="btn wide"
          onClick={async () => {
            const errs = await api.testActions(list);
            setResult(errs.length ? errs.join('\n') : 'Выполнено');
            setTimeout(() => setResult(null), 2500);
          }}
        ><Ph name="play" size={14} /> Проверить на этом ПК</button>
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
        <span className="fld-hint">Высокая клавиша заливается снизу вверх, широкая — слева направо. Меняйте размер клавиши уголком.</span>
        <Field label="Цвет заливки"><Color compact value={sl.color} onChange={(color) => up((x) => { x.slider!.color = color; }, 'slcolor')} /></Field>
        <div className="clr-quick">
          {KEY_COLORS.filter((c) => c.id !== 'graphite').map((c) => (
            <button key={c.id} type="button" title={c.name} style={{ background: c.fill }} className={sl.color === c.fill ? 'on' : ''} onClick={() => up((x) => { x.slider!.color = c.fill; })} />
          ))}
        </div>
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
          Клавиша может показывать состояние: зажечь светодиод, когда сцена в эфире, погаснуть, когда микрофон выключен.
          Для действий OBS и звука это настраивается само, когда вы их добавляете.
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
        <Toggle checked={rule.dot} onChange={(v) => setRule((r) => { r.dot = v; })} label="Светодиод" />
        {rule.dot && <span className="fld-hint">{LIVE_STATES.includes(rule.state) ? 'Для эфира и записи светодиод красный.' : 'Горит синим, пока условие выполняется.'}</span>}
        <Toggle checked={!!st.fill} onChange={(v) => setSt('fill', v ? { type: 'solid', color: '#353B44' } as Fill : undefined)} label="Другой цвет корпуса" />
        {st.fill && <FillEditor fill={st.fill} onChange={(f) => setSt('fill', f)} allowImage={false} />}
        <Toggle checked={st.textColor !== undefined} onChange={(v) => { setSt('textColor', v ? DIM_TEXT : undefined); setSt('iconColor', v ? DIM_TEXT : undefined); }} label="Другой цвет подписи и значка" />
        {st.textColor !== undefined && <Color compact value={st.textColor} onChange={(c) => { setSt('textColor', c); setSt('iconColor', c); }} />}
        <Toggle checked={st.label !== undefined} onChange={(v) => setSt('label', v ? b.style.label : undefined)} label="Другая подпись" />
        {st.label !== undefined && <Text value={st.label} onChange={(v) => setSt('label', v)} />}
        <Toggle checked={st.icon !== undefined} onChange={(v) => setSt('icon', v ? b.style.icon : undefined)} label="Другой значок" />
        {st.icon !== undefined && <IconPicker value={st.icon} onChange={(i) => setSt('icon', i)} />}
        {Object.keys(st).length === 0 && !rule.dot && <span className="fld-hint">Без своих настроек подпись и значок станут ярче.</span>}
      </Section>
    </>
  );
}

// ---------------- страница ----------------

function PageInspector() {
  const { page, profile, update, updatePage, obs, setPageId, orient } = useStore();
  const [tabIcons, setTabIcons] = useState(false);
  const layout = layoutOf(page, orient);
  const placed = Object.values(layout.pos);
  const maxX = Math.max(1, ...placed.map((p) => p.x + p.w));
  const maxY = Math.max(1, ...placed.map((p) => p.y + p.h));

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
      list.push(newButton(0, 0, { ...placeFix(i++, cols), style: withStyle({ label, icon: phIcon(icon) }), actions: [a], active: suggestActive(a) }));
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
          <Toggle checked={profile.home === page.id} onChange={(v) => v && update((p) => { p.home = page.id; })} label="Открывать первой (главная)" />
        </Section>
        <Section title="Вкладка на телефоне">
          <span className="fld-hint">Так страница выглядит в панели внизу пульта — чтобы сразу было видно, где что.</span>
          <div className="tab-prev" style={{ ['--tc' as string]: page.tab.color }}>
            {page.tab.icon.kind !== 'none'
              ? <IconView icon={page.tab.icon} color={page.tab.color} size="22px" />
              : <span className="tab-letter">{(page.name || '?').slice(0, 2)}</span>}
            <span>{page.name || 'Без названия'}</span>
          </div>
          <Field label="Цвет вкладки">
            <div className="clr-quick">
              {KEY_COLORS.filter((c) => c.id !== 'graphite' && c.id !== 'white').map((c) => (
                <button key={c.id} type="button" title={c.name} style={{ background: c.fill }} className={page.tab.color === c.fill ? 'on' : ''} onClick={() => updatePage((p) => { p.tab.color = c.fill; })} />
              ))}
            </div>
          </Field>
          <Color compact value={page.tab.color} onChange={(v) => updatePage((p) => { p.tab.color = v; }, 'tabcolor')} />
          <button className="btn ghost sm" onClick={() => setTabIcons(!tabIcons)}>
            <Ph name={tabIcons ? 'caret-up' : 'caret-down'} size={14} /> {tabIcons ? 'Свернуть значки' : 'Выбрать значок вкладки'}
          </button>
          {tabIcons && <IconPicker value={page.tab.icon} onChange={(i) => updatePage((p) => { p.tab.icon = i; })} />}
        </Section>
        {page.mode === 'free' ? (
          <Section title="Свободная раскладка">
            <span className="fld-hint">
              Клавиши стоят где угодно и любого размера — тяните их мышкой, уголок меняет размер, точные числа — у выбранной клавиши.
              Для каждого положения телефона своя расстановка. Вернуться к сетке — переключатель «Сетка» над телефоном.
            </span>
          </Section>
        ) : (
        <Section title={orient === 'portrait' ? 'Вертикальная раскладка' : 'Горизонтальная раскладка'}>
          <div className="two">
            <Field label="Столбцы"><Num value={layout.cols} min={maxX} max={12} onChange={(v) => updatePage((p) => setGrid(p, orient, v, layout.rows))} /></Field>
            <Field label="Строки"><Num value={layout.rows} min={maxY} max={12} onChange={(v) => updatePage((p) => setGrid(p, orient, layout.cols, v))} /></Field>
          </div>
          {orient === 'portrait' && (
            page.portrait ? (
              <>
                <span className="fld-hint">Своя раскладка для телефона в руке. Клавиши те же, что в горизонтальной, — меняются только места.</span>
                <button className="btn ghost sm" onClick={() => updatePage((p) => { p.portrait = null; })}>
                  <Ph name="arrow-counter-clockwise" size={14} /> Вернуть повёрнутую горизонтальную
                </button>
              </>
            ) : (
              <span className="fld-hint">Пока это горизонтальная раскладка, повёрнутая на бок. Передвиньте любую клавишу или смените сетку — и раскладка станет своей.</span>
            )
          )}
          <Field label="Зазор между клавишами"><Range value={page.gap} min={0} max={32} suffix=" px" onChange={(v) => updatePage((p) => { p.gap = v; }, 'pgap')} /></Field>
          <Toggle checked={page.square} onChange={(v) => updatePage((p) => { p.square = v; })} label="Квадратные клавиши" />
          <span className="fld-hint">{page.square ? 'Клавиши квадратные, сетка по центру экрана.' : 'Клавиши растягиваются на весь экран телефона.'}</span>
        </Section>
        )}
        <Section title="Фон страницы">
          <div className="bg-presets">
            {PAGE_BACKGROUNDS.map((f, i) => (
              <button key={i} style={fillCss(f as Fill)} onClick={() => updatePage((p) => { p.background = structuredClone(f) as Fill; })} />
            ))}
          </div>
          <FillEditor fill={page.background} allowGradient onChange={(f) => updatePage((p) => { p.background = f; }, 'pbg')} />
        </Section>
        <Section title="Весь пульт">
          <Field label="Панель страниц на телефоне">
            <Seg<NavStyle>
              value={profile.nav}
              onChange={(v) => update((p) => { p.nav = v; })}
              options={[{ v: 'tabs', label: 'Вкладки' }, { v: 'icons', label: 'Значки' }, { v: 'dots', label: 'Точки' }, { v: 'none', label: 'Скрыть' }]}
            />
          </Field>
          <Toggle checked={profile.keepAwake} onChange={(v) => update((p) => { p.keepAwake = v; })} label="Не гасить экран телефона" />
        </Section>
        <Section title="Быстрый старт">
          <button className="btn wide" disabled={!obs.connected || obs.scenes.length === 0} onClick={genObsPage}>
            Страница со всеми сценами OBS
          </button>
          <span className="fld-hint">
            {obs.connected ? `Сцен в OBS: ${obs.scenes.length}. У клавиш загорится светодиод, когда сцена в эфире.` : 'Подключите OBS в настройках, чтобы собрать страницу из его сцен.'}
          </span>
        </Section>
      </div>
    </>
  );
}

function placeFix(i: number, cols: number) {
  return { x: i % cols, y: Math.floor(i / cols) };
}
