// Панель страниц внизу пульта: вкладки со значками и названиями, только значки или точки.
import { NAV_HEIGHT } from '../shared/layout';
import { IconView, Ph } from '../shared/render';
import type { Page, Profile } from '../shared/types';

function TabIcon({ page, size, color }: { page: Page; size: number; color: string }) {
  if (page.tab.icon.kind !== 'none') return <IconView icon={page.tab.icon} color={color} size={`${size}px`} />;
  // Без значка — первые буквы названия.
  return <span className="pn-tab-letter" style={{ fontSize: size * 0.62 }}>{(page.name || '?').slice(0, 2)}</span>;
}

export function PageNav({ profile, pageId, online, via, update, onPage, onMenu }: {
  profile: Profile | null;
  pageId?: string;
  online: boolean;
  via: string;
  update: boolean;
  onPage: (id: string) => void;
  onMenu: () => void;
}) {
  const nav = profile?.nav ?? 'tabs';
  const pages = profile?.pages ?? [];
  const showPages = pages.length > 1 && nav !== 'none';

  return (
    <div className={`pn-nav is-${nav}`} style={{ height: NAV_HEIGHT[nav] }}>
      <span className={`pn-led ${online ? 'on' : ''}`} title={online ? 'Подключено' : 'Нет связи'} />
      {via && <span className="pn-via">{via}</span>}
      <div className="pn-tabs">
        {showPages && pages.map((p) => {
          const on = p.id === pageId;
          const c = p.tab.color;
          if (nav === 'dots') {
            return (
              <button key={p.id} className={`pn-dot ${on ? 'on' : ''}`} onClick={() => onPage(p.id)} aria-label={p.name}>
                <span style={on ? { background: c } : undefined} />
              </button>
            );
          }
          return (
            <button
              key={p.id}
              className={`pn-tab ${on ? 'on' : ''}`}
              onClick={() => onPage(p.id)}
              aria-label={p.name}
              style={on ? { ['--tc' as string]: c } : undefined}
            >
              <TabIcon page={p} size={nav === 'icons' ? 22 : 20} color={on ? c : '#969BA8'} />
              {nav === 'tabs' && <span className="pn-tab-name">{p.name}</span>}
            </button>
          );
        })}
      </div>
      <button className="pn-menu" onClick={onMenu} aria-label="Настройки">
        {update && <span className="pn-upd-dot" />}
        <Ph name="gear-six" size={20} />
      </button>
    </div>
  );
}
