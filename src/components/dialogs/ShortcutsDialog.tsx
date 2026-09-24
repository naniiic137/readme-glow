import { Dialog } from './Dialog';
import { SHORTCUTS, shortcutLabel } from '../../app/shortcuts';

export default function ShortcutsDialog() {
  return (
    <Dialog title="Keyboard shortcuts" description="Everything in ReadmeGlow works from the keyboard." size="wide" icon="keyboard">
      <div className="shortcut-grid">
        {SHORTCUTS.map((group) => (
          <section key={group.title}>
            <h3>{group.title}</h3>
            <dl>
              {group.items.map((item) => (
                <div key={item.label} className="shortcut-row">
                  <dt>{item.label}</dt>
                  <dd>
                    {item.keys.map((k, i) => (
                      <span key={k}>
                        {i > 0 && <span className="or"> or </span>}
                        <kbd className="k">{shortcutLabel(k)}</kbd>
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
