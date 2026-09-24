import { useRef, useState, type DragEvent } from 'react';
import { Icon } from './Icon';
import { filesFromDataTransfer, filesFromInput, type LocalFile } from '../lib/localFiles';

export interface DropZoneProps {
  onFiles: (files: LocalFile[]) => void | Promise<void>;
  onPaste?: () => void;
  compact?: boolean;
  children?: React.ReactNode;
}

/**
 * The big drop target: drag a README (or a whole project folder), or click
 * to choose a file. Fully keyboard accessible.
 */
export function DropZone({ onFiles, onPaste, compact, children }: DropZoneProps) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const depth = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const deliver = async (files: LocalFile[]) => {
    if (!files.length) return;
    setBusy(true);
    try {
      await onFiles(files);
    } finally {
      setBusy(false);
    }
  };

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    depth.current = 0;
    setOver(false);
    await deliver(await filesFromDataTransfer(e.dataTransfer));
  };

  return (
    <div
      className={`dropzone${over ? ' is-over' : ''}${busy ? ' is-busy' : ''}${compact ? ' compact' : ''}`}
      role="region"
      aria-label="Open a README: drop a file or folder here, or use the buttons"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button, input, a, form')) return;
        fileInput.current?.click();
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current++;
        setOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={onDrop}
      data-testid="dropzone"
    >
      <div className="dropzone-glow" aria-hidden="true" />
      <div className="dropzone-inner">
        <div className="dropzone-icon" aria-hidden="true">
          <Icon name={over ? 'sparkles' : 'upload'} size={compact ? 22 : 30} />
        </div>
        <p className="dropzone-title">{over ? 'Drop it — let it glow' : busy ? 'Reading your files…' : 'Drop your README.md here'}</p>
        <p className="dropzone-sub">or a whole project folder, so its images come along</p>
        <div className="dropzone-actions">
          <button type="button" className="btn btn-primary" onClick={() => fileInput.current?.click()}>
            <Icon name="file" size={16} /> Choose file
          </button>
          <button type="button" className="btn" onClick={() => folderInput.current?.click()}>
            <Icon name="folder" size={16} /> Choose folder
          </button>
          {onPaste && (
            <button type="button" className="btn" onClick={onPaste}>
              <Icon name="clipboard" size={16} /> Paste Markdown
            </button>
          )}
        </div>
        {children}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".md,.markdown,.mdown,.mkd,.mdx,.txt,text/markdown,text/plain,image/*"
        multiple
        hidden
        data-testid="file-input"
        onChange={(e) => {
          const files = e.target.files ? filesFromInput(e.target.files) : [];
          e.target.value = '';
          void deliver(files);
        }}
      />
      <input
        ref={folderInput}
        type="file"
        hidden
        multiple
        {...({ webkitdirectory: '', directory: '' } as object)}
        onChange={(e) => {
          const files = e.target.files ? filesFromInput(e.target.files) : [];
          e.target.value = '';
          void deliver(files);
        }}
      />
    </div>
  );
}
