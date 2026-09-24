import { lazy, Suspense, useEffect, useState } from 'react';
import { useStore } from './app/store';
import { ui } from './app/state';
import { startup } from './app/actions';
import { ensureAppFonts } from './app/themeStyles';
import { useGlobalShortcuts, useGlobalPaste, useUnloadGuard } from './app/globals';
import { Landing } from './components/Landing';
import { Workspace } from './components/Workspace';
import { Toasts } from './components/Toasts';
import { GlobalDrop } from './components/GlobalDrop';
import { Icon } from './components/Icon';

const Dialogs = lazy(() => import('./components/dialogs/Dialogs'));
const Lightbox = lazy(() => import('./components/Lightbox'));
const FindBar = lazy(() => import('./components/FindBar'));

export function App() {
  const current = useStore(ui, (s) => s.doc);
  const loading = useStore(ui, (s) => s.loading);
  const dialog = useStore(ui, (s) => s.dialog);
  const lightbox = useStore(ui, (s) => s.lightbox);
  const findOpen = useStore(ui, (s) => s.findOpen);
  const announce = useStore(ui, (s) => s.announce);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    ensureAppFonts();
    void startup().finally(() => setBooting(false));
  }, []);

  useGlobalShortcuts();
  useGlobalPaste();
  useUnloadGuard();

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {loading && <div className="loading-bar" role="progressbar" aria-label={loading} />}
      {booting && !current ? (
        <div className="splash" role="status">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="sparkles" size={20} />
          </span>
          <span>{loading ?? 'Loading ReadmeGlow…'}</span>
        </div>
      ) : current ? (
        <Workspace current={current} />
      ) : (
        <Landing />
      )}
      <Suspense fallback={null}>
        {dialog && <Dialogs dialog={dialog} />}
        {lightbox && <Lightbox />}
        {findOpen && current && <FindBar />}
      </Suspense>
      <Toasts />
      <GlobalDrop />
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </div>
    </>
  );
}
