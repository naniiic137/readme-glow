import type { RefObject } from 'react';

/** The draggable divider of the split view (also keyboard-resizable). */
export function Splitter({
  container,
  ratio,
  onChange,
  onDragging,
}: {
  container: RefObject<HTMLElement>;
  ratio: number;
  onChange: (ratio: number) => void;
  onDragging: (dragging: boolean) => void;
}) {
  const clamp = (r: number) => Math.min(0.8, Math.max(0.2, r));
  return (
    <div
      className="splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize editor and preview"
      aria-valuemin={20}
      aria-valuemax={80}
      aria-valuenow={Math.round(ratio * 100)}
      tabIndex={0}
      onPointerDown={(e) => {
        const el = container.current;
        if (!el) return;
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        onDragging(true);
        const rect = el.getBoundingClientRect();
        const move = (ev: PointerEvent) => onChange(clamp((ev.clientX - rect.left) / rect.width));
        const up = () => {
          onDragging(false);
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }}
      onDoubleClick={() => onChange(0.5)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onChange(clamp(ratio - 0.03));
        else if (e.key === 'ArrowRight') onChange(clamp(ratio + 0.03));
        else if (e.key === 'Home') onChange(0.2);
        else if (e.key === 'End') onChange(0.8);
        else return;
        e.preventDefault();
      }}
    >
      <span className="splitter-grip" aria-hidden="true" />
    </div>
  );
}
