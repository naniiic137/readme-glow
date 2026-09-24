import { useId, useRef, type ReactNode } from 'react';
import { Icon } from '../Icon';
import { useDialogFocus } from './useDialogFocus';
import { closeDialog } from '../../app/state';

export function Dialog({
  title,
  description,
  children,
  footer,
  size,
  onClose = closeDialog,
  initialFocus,
  className = '',
  icon,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'wide' | 'xwide';
  onClose?: () => void;
  initialFocus?: string;
  className?: string;
  icon?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  useDialogFocus(ref, onClose, initialFocus);
  return (
    <>
      <div className="overlay" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        className={`dialog ${size ?? ''} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
      >
        <div className="dialog-head">
          {icon && (
            <span className="dialog-icon" aria-hidden="true">
              <Icon name={icon} size={18} />
            </span>
          )}
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descId}>{description}</p>}
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </>
  );
}
