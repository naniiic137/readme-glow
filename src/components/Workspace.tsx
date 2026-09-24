import { lazy, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useStore } from '../app/store';
import { doc, settings, setSettings, ui } from '../app/state';
import { useRender } from '../app/useRender';
import { githubResolver } from '../lib/github';
import { localResolver } from '../lib/localFiles';
import { PreviewPane } from './PreviewPane';
import { TopBar } from './TopBar';
import { EditorPane } from './editor/EditorPane';
import { Splitter } from './Splitter';
import type { CurrentDoc } from '../app/state';
import type { UrlResolver } from '../lib/markdown/types';

const CustomizePanel = lazy(() => import('./panels/CustomizePanel'));
const InsightsPanel = lazy(() => import('./panels/InsightsPanel'));
const LibraryPanel = lazy(() => import('./panels/LibraryPanel'));

function resolverFor(d: CurrentDoc): UrlResolver {
  if (d.source.kind === 'github') {
    return githubResolver({ owner: d.source.owner, repo: d.source.repo, ref: d.source.ref, path: d.source.path });
  }
  return localResolver(d.assets, d.baseDir, d.sampleBase);
}

function useDocText(): string {
  return useSyncExternalStore(
    (cb) => doc.subscribe(cb),
    () => doc.text,
  );
}

const MOBILE = '(max-width: 760px)';
function useIsMobile(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(MOBILE);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(MOBILE).matches,
  );
}

export function Workspace({ current }: { current: CurrentDoc }) {
  const text = useDocText();
  const view = useStore(settings, (s) => s.view);
  const ratio = useStore(settings, (s) => s.splitRatio);
  const panel = useStore(ui, (s) => s.panel);
  const focusMode = useStore(ui, (s) => s.focusMode);
  const mobileTab = useStore(ui, (s) => s.mobileTab);
  const isMobile = useIsMobile();
  const mainRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const resolver = useMemo(() => resolverFor(current), [current.id, current.assetsVersion, current.source]); // eslint-disable-line react-hooks/exhaustive-deps
  const { result, error } = useRender(text, resolver, `${current.id}:${current.assetsVersion}`);

  useEffect(() => {
    ui.set({ render: result });
  }, [result]);

  // On phones the split view becomes tabs.
  const showEditor = focusMode || (isMobile ? view !== 'preview' && mobileTab === 'edit' : view !== 'preview');
  const showPreview = !focusMode && (isMobile ? view === 'preview' || mobileTab === 'preview' : view !== 'editor');
  const split = showEditor && showPreview;

  return (
    <div className={`ws${focusMode ? ' is-focus' : ''}${dragging ? ' is-resizing' : ''}${panel === 'library' ? ' has-panel-left' : panel ? ' has-panel-right' : ''}`}>
      {!focusMode && <TopBar current={current} result={result} isMobile={isMobile} />}
      {isMobile && view !== 'preview' && !focusMode && (
        <div className="mobile-tabs seg full" role="tablist" aria-label="Editor or preview">
          <button type="button" role="tab" aria-selected={mobileTab === 'edit'} onClick={() => ui.set({ mobileTab: 'edit' })}>
            Edit
          </button>
          <button type="button" role="tab" aria-selected={mobileTab === 'preview'} onClick={() => ui.set({ mobileTab: 'preview' })}>
            Preview
          </button>
        </div>
      )}
      <main
        id="main"
        className={`ws-main${split ? ' is-split' : ''}`}
        ref={mainRef}
        style={split ? { gridTemplateColumns: `minmax(0, ${ratio}fr) 10px minmax(0, ${1 - ratio}fr)` } : undefined}
      >
        {showEditor && <EditorPane />}
        {split && (
          <Splitter
            container={mainRef}
            ratio={ratio}
            onChange={(r) => setSettings({ splitRatio: r })}
            onDragging={setDragging}
          />
        )}
        {showPreview && (
          <div className="preview-pane">
            {error && (
              <div className="render-error" role="alert">
                Something in this README could not be rendered: {error}
              </div>
            )}
            <PreviewPane result={result} editorVisible={showEditor} />
          </div>
        )}
        {focusMode && (
          <button type="button" className="btn btn-sm focus-exit" onClick={() => ui.set({ focusMode: false })}>
            Exit distraction-free mode · Esc
          </button>
        )}
      </main>
      <Suspense fallback={null}>
        {panel === 'customize' && <CustomizePanel />}
        {panel === 'insights' && <InsightsPanel markdown={text} />}
        {panel === 'library' && <LibraryPanel />}
      </Suspense>
    </div>
  );
}
