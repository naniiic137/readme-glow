import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { filesFromDataTransfer, isImageFile } from '../lib/localFiles';
import { openFiles, addImagesToDoc } from '../app/actions';
import { ui, doc } from '../app/state';
import { sync } from '../app/sync';

/**
 * Drop a README (or folder) anywhere on the page. While a document is open,
 * dropped images are added to it; a dropped Markdown file opens as a new
 * document. The editor and the landing drop zone handle their own drops.
 */
export function GlobalDrop() {
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current++;
      if (!(e.target as HTMLElement).closest?.('.dropzone, .cm-editor')) setOver(true);
    };
    const leave = () => {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    };
    const overFn = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      const inner = (e.target as HTMLElement).closest?.('.dropzone, .cm-editor');
      setOver(!inner);
    };
    const drop = async (e: DragEvent) => {
      depth.current = 0;
      setOver(false);
      if (!hasFiles(e) || (e.target as HTMLElement).closest?.('.dropzone, .cm-editor')) return;
      e.preventDefault();
      const files = await filesFromDataTransfer(e.dataTransfer!);
      const allImages = files.length > 0 && files.every((f) => isImageFile({ name: f.path, type: f.file.type }));
      if (allImages && ui.get().doc) {
        const snippets = await addImagesToDoc(files.map((f) => f.file));
        if (!snippets.length) return;
        const block = snippets.join('\n\n');
        if (sync.editor) sync.editor.insertBlock(block);
        else doc.commit(`${doc.text.replace(/\s*$/, '')}\n\n${block}\n`, { origin: 'insert' });
        return;
      }
      await openFiles(files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', overFn);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', overFn);
      window.removeEventListener('drop', drop);
    };
  }, []);

  if (!over) return null;
  return (
    <div className="global-drop" aria-hidden="true">
      <div className="global-drop-card">
        <Icon name="sparkles" size={34} />
        <strong>Drop to open</strong>
        <span>A README, a project folder — or images to add to this document</span>
      </div>
    </div>
  );
}
