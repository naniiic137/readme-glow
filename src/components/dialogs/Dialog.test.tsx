// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Dialog } from './Dialog';
import { ui } from '../../app/state';
import { resetStores } from '../../test/helpers';

// jsdom has no layout, so offsetParent is always null; the focus trap uses it
// to skip hidden controls. Pretend everything attached is laid out.
const offsetParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
beforeEach(() => {
  resetStores();
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get(this: HTMLElement) {
      return this.closest('[hidden]') ? null : this.parentElement;
    },
  });
});
afterEach(() => {
  if (offsetParent) Object.defineProperty(HTMLElement.prototype, 'offsetParent', offsetParent);
});

function Harness({ onClose, initialFocus, withHidden }: { onClose: () => void; initialFocus?: string; withHidden?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      {open && (
        <Dialog
          title="Rename document"
          description="Give it a memorable name."
          initialFocus={initialFocus}
          onClose={() => {
            onClose();
            setOpen(false);
          }}
          footer={<button type="button">Save</button>}
        >
          <input id="name" aria-label="Name" />
          {withHidden && (
            <div hidden>
              <button type="button">Invisible</button>
            </div>
          )}
          <button type="button" disabled>
            Disabled
          </button>
        </Dialog>
      )}
    </>
  );
}

async function openHarness(props: Partial<Parameters<typeof Harness>[0]> = {}) {
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(<Harness onClose={onClose} {...props} />);
  const opener = screen.getByRole('button', { name: 'Open dialog' });
  await user.click(opener);
  return { user, onClose, opener, dialog: screen.getByRole('dialog') };
}

describe('Dialog', () => {
  it('is a labelled, described modal dialog', async () => {
    const { dialog } = await openHarness();
    expect(dialog).toHaveAccessibleName('Rename document');
    expect(dialog).toHaveAccessibleDescription('Give it a memorable name.');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('moves focus into the dialog (the dialog itself, so its title is announced)', async () => {
    const { dialog, opener } = await openHarness();
    expect(opener).not.toHaveFocus();
    expect(dialog).toHaveFocus();
  });

  it('honours initialFocus', async () => {
    await openHarness({ initialFocus: '#name' });
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  });

  it('traps Tab: wraps from the last control to the first and back with Shift+Tab', async () => {
    const { user } = await openHarness();
    const close = screen.getByRole('button', { name: 'Close' });
    const save = screen.getByRole('button', { name: 'Save' });
    const name = screen.getByRole('textbox', { name: 'Name' });

    await user.tab(); // from the dialog itself to its first control
    expect(close).toHaveFocus();
    await user.tab();
    expect(name).toHaveFocus();
    await user.tab(); // the disabled button is skipped
    expect(save).toHaveFocus();
    await user.tab(); // wraps
    expect(close).toHaveFocus();
    await user.tab({ shift: true }); // wraps backwards
    expect(save).toHaveFocus();
  });

  it('skips hidden controls when wrapping', async () => {
    await openHarness({ withHidden: true });
    const save = screen.getByRole('button', { name: 'Save' });
    save.focus();
    fireEvent.keyDown(save, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('Escape calls onClose without reaching global shortcuts, and focus returns to the opener', async () => {
    const globalKeys = vi.fn();
    window.addEventListener('keydown', globalKeys);
    const { user, onClose, opener } = await openHarness({ initialFocus: '#name' });
    await user.keyboard('{Escape}');
    window.removeEventListener('keydown', globalKeys);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(globalKeys).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('closes from the Close button and from the overlay', async () => {
    const { user, onClose } = await openHarness();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Open dialog' }));
    fireEvent.click(document.querySelector('.overlay')!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('defaults onClose to closing the app dialog', () => {
    ui.set({ dialog: 'shortcuts' });
    render(
      <Dialog title="Shortcuts">
        <p>Body</p>
      </Dialog>,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(ui.get().dialog).toBeNull();
  });

  it('applies size and class names, and omits aria-describedby without a description', () => {
    render(
      <Dialog title="Empty" size="wide" className="extra" icon="info">
        <p>Nothing to press</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Empty' });
    expect(dialog).toHaveClass('dialog', 'wide', 'extra');
    expect(dialog).not.toHaveAttribute('aria-describedby');
    expect(dialog).toHaveAttribute('tabindex', '-1');
    expect(dialog).toHaveFocus();
  });

  it('falls back to the dialog when initialFocus matches nothing', async () => {
    const { dialog } = await openHarness({ initialFocus: '#missing' });
    expect(dialog).toHaveFocus();
  });
});
