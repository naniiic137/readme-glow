import { useEffect, useRef, useState } from 'react';
import { useStore } from '../app/store';
import { ui } from '../app/state';
import { Icon } from './Icon';
import { useDialogFocus } from './dialogs/useDialogFocus';

/** Full-screen image viewer with keyboard navigation between the document's images. */
export default function Lightbox() {
  const box = useStore(ui, (s) => s.lightbox);
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(() => Math.max(0, box?.list.findIndex((i) => i.src === box.src) ?? 0));
  const close = () => ui.set({ lightbox: null });
  useDialogFocus(ref, close);

  const list = box?.list.length ? box.list : box ? [{ src: box.src, alt: box.alt }] : [];
  const item = list[index] ?? list[0];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(list.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [list.length]);

  if (!box || !item) return null;
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={item.alt || 'Image'} ref={ref} tabIndex={-1} onClick={(e) => e.target === e.currentTarget && close()}>
      <figure>
        <img src={item.src} alt={item.alt} />
        {item.alt && <figcaption>{item.alt}</figcaption>}
      </figure>
      <button type="button" className="icon-btn lb-close" aria-label="Close" onClick={close}>
        <Icon name="x" />
      </button>
      {list.length > 1 && (
        <>
          <button type="button" className="icon-btn lb-prev" aria-label="Previous image" disabled={index === 0} onClick={() => setIndex(index - 1)}>
            <Icon name="chevronLeft" />
          </button>
          <button type="button" className="icon-btn lb-next" aria-label="Next image" disabled={index >= list.length - 1} onClick={() => setIndex(index + 1)}>
            <Icon name="chevronRight" />
          </button>
          <span className="lb-count">
            {index + 1} / {list.length}
          </span>
        </>
      )}
    </div>
  );
}
