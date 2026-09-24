import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export interface MenuItem {
  id: string;
  label: ReactNode;
  hint?: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}

/** A button that opens a small menu. Arrow keys move, Enter selects, Escape closes. */
export function Menu({
  label,
  items,
  button,
  className = 'icon-btn',
  tip,
  align = 'start',
}: {
  label: string;
  items: MenuItem[];
  button: ReactNode;
  className?: string;
  tip?: string;
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  useEffect(() => {
    if (open) list.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[active]?.focus();
  }, [open, active]);

  const choose = (item: MenuItem) => {
    if (item.disabled) return;
    setOpen(false);
    btn.current?.focus();
    item.onSelect();
  };

  return (
    <span className="menu-wrap">
      <button
        ref={btn}
        type="button"
        className={className}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        data-tip={open ? undefined : tip ?? label}
        onClick={() => {
          setActive(0);
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive(0);
            setOpen(true);
          }
        }}
      >
        {button}
      </button>
      {open && (
        <div
          ref={list}
          id={id}
          role="menu"
          aria-label={label}
          className={`menu-list align-${align}`}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setOpen(false);
              btn.current?.focus();
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => (a + 1) % items.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => (a - 1 + items.length) % items.length);
            } else if (e.key === 'Home') setActive(0);
            else if (e.key === 'End') setActive(items.length - 1);
            else if (e.key === 'Tab') setOpen(false);
          }}
        >
          {items.map((item, i) => (
            <button key={item.id} type="button" role="menuitem" tabIndex={i === active ? 0 : -1} disabled={item.disabled} onClick={() => choose(item)} onMouseEnter={() => setActive(i)}>
              {item.icon}
              <span className="menu-label">{item.label}</span>
              {item.hint && <span className="menu-hint">{item.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
