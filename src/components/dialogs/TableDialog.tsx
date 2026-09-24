import { useState } from 'react';
import { Dialog } from './Dialog';
import { Icon } from '../Icon';
import { closeDialog, setSettings, settings, toast } from '../../app/state';
import { buildTable, emptyCells, type Align } from '../../lib/editor/table';
import { insertMarkdownBlock } from './SectionsDialog';

const MAX = 8;

/** Table builder: pick a size on the grid, fill in the cells, choose alignments. */
export default function TableDialog() {
  const [hover, setHover] = useState<[number, number]>([3, 3]);
  const [size, setSize] = useState<[number, number] | null>(null);
  const [cells, setCells] = useState<string[][]>([]);
  const [align, setAlign] = useState<Align[]>([]);

  const choose = (rows: number, cols: number) => {
    setSize([rows, cols]);
    const grid = emptyCells(rows, cols);
    grid[0] = grid[0]!.map((_, i) => `Column ${i + 1}`);
    setCells(grid);
    setAlign(Array.from({ length: cols }, () => null));
  };

  const markdown = size ? buildTable({ rows: size[0], cols: size[1], header: true, align, cells }) : '';

  const insert = () => {
    closeDialog();
    if (settings.get().view === 'preview') setSettings({ view: 'split' });
    setTimeout(() => {
      insertMarkdownBlock(markdown);
      toast('Table inserted.', 'success');
    }, 60);
  };

  return (
    <Dialog
      title="Insert a table"
      description={size ? 'Type in the cells; the first row is the header.' : 'Choose the number of rows and columns.'}
      icon="table"
      size={size ? 'wide' : undefined}
      footer={
        size ? (
          <>
            <button type="button" className="btn btn-ghost spacer-left" onClick={() => setSize(null)}>
              <Icon name="arrowLeft" size={15} /> Change size
            </button>
            <button type="button" className="btn btn-primary" onClick={insert}>
              Insert table
            </button>
          </>
        ) : undefined
      }
    >
      {!size ? (
        <div className="table-picker">
          <div className="table-grid" role="grid" aria-label="Table size" onMouseLeave={() => setHover([3, 3])}>
            {Array.from({ length: MAX }, (_, r) => (
              <div role="row" key={r} className="tg-row">
                {Array.from({ length: MAX }, (_, c) => (
                  <button
                    key={c}
                    type="button"
                    role="gridcell"
                    className={`tg-cell${r < hover[0] && c < hover[1] ? ' on' : ''}`}
                    aria-label={`${r + 1} rows by ${c + 1} columns`}
                    onMouseEnter={() => setHover([r + 1, c + 1])}
                    onFocus={() => setHover([r + 1, c + 1])}
                    onClick={() => choose(Math.max(2, r + 1), c + 1)}
                  />
                ))}
              </div>
            ))}
          </div>
          <p className="table-size">
            {Math.max(2, hover[0])} × {hover[1]} <span className="muted">(rows × columns, header included)</span>
          </p>
        </div>
      ) : (
        <div className="table-editor">
          <div className="te-scroll">
            <table>
              <thead>
                <tr>
                  {align.map((a, c) => (
                    <th key={c}>
                      <div className="seg te-align" role="group" aria-label={`Column ${c + 1} alignment`}>
                        {(['left', 'center', 'right'] as const).map((opt) => (
                          <button key={opt} type="button" aria-pressed={a === opt} onClick={() => setAlign(align.map((x, i) => (i === c ? (x === opt ? null : opt) : x)))}>
                            {opt === 'left' ? '⇤' : opt === 'center' ? '↔' : '⇥'}
                          </button>
                        ))}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cells.map((row, r) => (
                  <tr key={r} className={r === 0 ? 'te-head' : undefined}>
                    {row.map((cell, c) => (
                      <td key={c}>
                        <input
                          className="input"
                          value={cell}
                          aria-label={`${r === 0 ? 'Header' : `Row ${r}`}, column ${c + 1}`}
                          onChange={(e) => setCells(cells.map((rr, i) => (i === r ? rr.map((x, j) => (j === c ? e.target.value : x)) : rr)))}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <pre className="te-preview" aria-label="Markdown preview">
            {markdown}
          </pre>
        </div>
      )}
    </Dialog>
  );
}
