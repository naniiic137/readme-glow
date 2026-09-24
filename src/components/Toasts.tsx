import { useStore } from '../app/store';
import { dismissToast, ui } from '../app/state';
import { Icon } from './Icon';

export function Toasts() {
  const toasts = useStore(ui, (s) => s.toasts);
  if (!toasts.length) return null;
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
          <Icon name={t.kind === 'success' ? 'check' : t.kind === 'error' ? 'alert' : 'info'} size={17} />
          <span className="msg">{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                dismissToast(t.id);
                t.action!.run();
              }}
            >
              {t.action.label}
            </button>
          )}
          <button type="button" className="icon-btn sm" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
            <Icon name="x" size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
