import { useState } from 'react';
import { Dialog } from './Dialog';
import { closeDialog } from '../../app/state';
import { openPasted } from '../../app/actions';

export default function PasteDialog() {
  const [text, setText] = useState('');
  const submit = async () => {
    if (!text.trim()) return;
    closeDialog();
    await openPasted(text);
  };
  return (
    <Dialog
      title="Paste Markdown"
      description="Tip: you can also paste anywhere on the start page."
      icon="clipboard"
      size="wide"
      initialFocus="textarea"
      footer={
        <>
          <span className="spacer">{text ? `${text.length.toLocaleString()} characters` : ''}</span>
          <button type="button" className="btn btn-ghost" onClick={closeDialog}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={!text.trim()} onClick={() => void submit()}>
            Make it glow
          </button>
        </>
      }
    >
      <textarea
        className="textarea"
        rows={14}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'# My project\n\nA short description…'}
        aria-label="Markdown"
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') void submit();
        }}
      />
    </Dialog>
  );
}
