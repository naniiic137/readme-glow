import { useRef, type ReactNode } from 'react';
import { Icon } from '../Icon';
import { ui } from '../../app/state';

/** Side panel (non-modal): Escape or the close button dismisses it. */
export function Drawer({ title, side = 'right', children, actions, label }: { title: string; side?: 'left' | 'right'; children: ReactNode; actions?: ReactNode; label?: string }) {
  const ref = useRef<HTMLElement>(null);
  return (
    <aside ref={ref} className={`drawer ${side}`} aria-label={label ?? title}>
      <div className="drawer-head">
        <h2>{title}</h2>
        {actions}
        <button type="button" className="icon-btn" aria-label={`Close ${title}`} onClick={() => ui.set({ panel: null })}>
          <Icon name="x" />
        </button>
      </div>
      <div className="drawer-body">{children}</div>
    </aside>
  );
}

/** Scrolls both panes to a source line and flashes the block. */
export function revealSourceLine(line: number): void {
  import('../../app/sync').then(({ sync }) => {
    const article = sync.preview?.element();
    if (article) {
      let best: HTMLElement | null = null;
      let bestLine = 0;
      article.querySelectorAll<HTMLElement>('[data-line]').forEach((el) => {
        const l = Number(el.dataset.line);
        if (l <= line && l >= bestLine) {
          best = el;
          bestLine = l;
        }
      });
      const target = best as HTMLElement | null;
      if (target) {
        const details = target.closest('details');
        if (details) details.open = true;
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('rg-flash');
        setTimeout(() => target.classList.remove('rg-flash'), 1600);
      }
    }
    sync.editor?.revealLine(line, false);
  });
}
