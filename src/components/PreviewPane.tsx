import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { RenderOutput } from '../lib/markdown/pipeline';
import { useStore } from '../app/store';
import { settings, ui, toast } from '../app/state';
import { presentation, sectionMode, usePrefersDark, usePrefersReducedMotion } from '../app/presentation';
import { ensureTheme, isThemeLoaded } from '../app/themeStyles';
import { loadPipeline } from '../app/useRender';
import { renderMermaid } from '../app/mermaid';
import { sync, claimScroll } from '../app/sync';
import { cleanAnchors, lineToOffset, offsetToLine, type Anchor } from '../lib/scrollSync';
import { tokensFor } from '../themes/registry';
import { Icon } from './Icon';
import { Particles } from './Particles';
import { VisualEditor } from './VisualEditor';

interface Props {
  result: RenderOutput | null;
  editorVisible: boolean;
}

export function PreviewPane({ result, editorVisible }: Props) {
  const s = useStore(settings, (x) => x);
  const prefersDark = usePrefersDark();
  const reduceMotion = usePrefersReducedMotion();
  const visualEdit = useStore(ui, (x) => x.visualEdit);
  const cursorLine = useStore(ui, (x) => x.cursorLine);
  const p = presentation(s, prefersDark, { inPane: true, reduceMotion });
  const [themeReady, setThemeReady] = useState(() => isThemeLoaded(p.theme.id));
  const [html, setHtml] = useState('');
  const [slide, setSlide] = useState(0);
  const [slideCount, setSlideCount] = useState(0);
  const [activeHeading, setActiveHeading] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [rendered, setRendered] = useState(0);
  const [viewport, setViewport] = useState(800);
  const scrollRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const editingRef = useRef<HTMLElement | null>(null);
  const pendingHtml = useRef<string | null>(null);
  const anchorsRef = useRef<Anchor[] | null>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    let alive = true;
    if (!isThemeLoaded(p.theme.id)) setThemeReady(false);
    void ensureTheme(p.theme).then(() => alive && setThemeReady(true));
    return () => {
      alive = false;
    };
  }, [p.theme]);

  const mode = sectionMode(p.layout);
  useEffect(() => {
    if (!result) return;
    let alive = true;
    void loadPipeline().then(({ htmlFor }) => alive && setHtml(htmlFor(result.tree, mode)));
    return () => {
      alive = false;
    };
  }, [result, mode]);

  // Pane height drives slides and sticky backdrops.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewport(el.clientHeight));
    ro.observe(el);
    setViewport(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const tokens = tokensFor(p.theme, p.mode);

  // ------------------------------------------------------------ write the HTML
  const applyHtml = useCallback(
    (markup: string) => {
      const article = articleRef.current;
      if (!article) return;
      article.innerHTML = markup;
      anchorsRef.current = null;
      afterRender(article, p.mode);
      setRendered((n) => n + 1);
      const slides = article.querySelectorAll('.rg-slide');
      setSlideCount(slides.length);
      if (firstRender.current && markup) {
        firstRender.current = false;
        const hash = decodeURIComponent(window.location.hash.slice(1));
        if (hash && !hash.startsWith('md=')) {
          const target = article.querySelector<HTMLElement>(`[id="${CSS.escape(hash)}"], [id="user-content-${CSS.escape(hash)}"]`);
          target?.scrollIntoView({ block: 'start' });
        }
      }
    },
    [p.mode],
  );

  useLayoutEffect(() => {
    if (editingRef.current && articleRef.current?.contains(editingRef.current)) {
      pendingHtml.current = html;
      return;
    }
    applyHtml(html);
  }, [html, applyHtml]);

  const flushPending = useCallback(() => {
    if (pendingHtml.current !== null) {
      const markup = pendingHtml.current;
      pendingHtml.current = null;
      applyHtml(markup);
    }
  }, [applyHtml]);

  // Mermaid follows the theme.
  useEffect(() => {
    const article = articleRef.current;
    if (!article || !result?.features.mermaid || !themeReady) return;
    void renderMermaid(article, {
      dark: p.mode === 'dark',
      font: p.theme.fonts.body,
      text: tokens.text,
      surface: tokens.surface,
      bg: tokens.bg,
      accent: s.accent ?? tokens.accent,
      border: tokens.border,
      muted: tokens.muted,
    });
  }, [html, result, themeReady, p.mode, p.theme, tokens, s.accent]);

  // ------------------------------------------------------------ scroll reveal
  useEffect(() => {
    const root = scrollRef.current;
    const article = articleRef.current;
    if (!root || !article || !p.className.includes('reveal-on')) return;
    const targets = Array.from(article.querySelectorAll<HTMLElement>(':scope > *, :scope > .rg-section > *, :scope > .rg-intro > *'));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).classList.add('is-visible');
            io.unobserve(e.target);
          }
        }
      },
      { root, rootMargin: '0px 0px -6% 0px', threshold: 0.01 },
    );
    const limit = root.getBoundingClientRect().bottom;
    for (const t of targets) {
      if (t.matches('.rg-section, .rg-intro')) continue;
      t.dataset.reveal = '';
      if (t.getBoundingClientRect().top < limit) t.classList.add('is-visible');
      else io.observe(t);
    }
    return () => io.disconnect();
  }, [html, p.className]);

  // ------------------------------------------------------------ docs scroll-spy
  const toc = useMemo(() => (result?.toc ?? []).filter((t) => t.depth >= 2 && t.depth <= 3), [result]);
  useEffect(() => {
    const root = scrollRef.current;
    const article = articleRef.current;
    if (!root || !article || p.layout !== 'docs' || !toc.length) return;
    const headings = toc.map((t) => article.querySelector<HTMLElement>(`[id="${CSS.escape(t.id)}"]`)).filter((h): h is HTMLElement => !!h);
    const onScroll = () => {
      const top = root.getBoundingClientRect().top + 90;
      let current: string | null = headings[0]?.id ?? null;
      for (const h of headings) {
        if (h.getBoundingClientRect().top <= top) current = h.id;
        else break;
      }
      setActiveHeading(current);
    };
    onScroll();
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, [html, p.layout, toc]);

  // ------------------------------------------------------------ slides
  useEffect(() => {
    const article = articleRef.current;
    if (!article || p.layout !== 'slides') return;
    const slides = Array.from(article.querySelectorAll<HTMLElement>('.rg-slide'));
    const index = Math.min(slide, Math.max(0, slides.length - 1));
    slides.forEach((el, i) => {
      el.classList.toggle('is-active', i === index);
      el.classList.toggle('is-before', i < index);
      el.setAttribute('aria-hidden', i === index ? 'false' : 'true');
      if (i === index) el.scrollTop = 0;
    });
  }, [html, slide, p.layout]);

  const go = useCallback((delta: number) => setSlide((i) => Math.max(0, Math.min(slideCount - 1, i + delta))), [slideCount]);
  useEffect(() => {
    if (p.layout !== 'slides') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, [contenteditable="true"], .cm-editor, [role="dialog"]')) return;
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) {
        e.preventDefault();
        go(1);
      } else if (['ArrowLeft', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        go(-1);
      } else if (e.key === 'Home') setSlide(0);
      else if (e.key === 'End') setSlide(Math.max(0, slideCount - 1));
      else if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey) void toggleFullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p.layout, go, slideCount]);

  const toggleFullscreen = async () => {
    const el = scrollRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch {
      toast('Full screen is not available here.', 'error');
    }
  };

  // Swipe between slides.
  const swipe = useRef<{ x: number; y: number } | null>(null);

  // ------------------------------------------------------------ scroll sync
  const buildAnchors = useCallback((): Anchor[] => {
    if (anchorsRef.current) return anchorsRef.current;
    const root = scrollRef.current;
    const article = articleRef.current;
    if (!root || !article) return [];
    const base = root.getBoundingClientRect().top - root.scrollTop;
    const list: Anchor[] = [];
    article.querySelectorAll<HTMLElement>('[data-line]').forEach((el) => {
      const line = Number(el.dataset.line);
      if (!line) return;
      const rect = el.getBoundingClientRect();
      if (!rect.height) return;
      list.push({ line, top: rect.top - base });
    });
    anchorsRef.current = cleanAnchors(list);
    return anchorsRef.current;
  }, []);

  useEffect(() => {
    sync.preview = {
      scrollToLine(line, smooth) {
        const root = scrollRef.current;
        if (!root || p.layout === 'slides') return;
        const top = lineToOffset(buildAnchors(), line) - 24;
        root.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
      },
      topLine() {
        const root = scrollRef.current;
        return root ? offsetToLine(buildAnchors(), root.scrollTop + 24) : 1;
      },
      element: () => articleRef.current,
    };
    return () => {
      sync.preview = null;
    };
  }, [buildAnchors, p.layout]);

  useEffect(() => {
    anchorsRef.current = null;
  }, [viewport, s.fontScale, s.width, p.theme.id, p.layout]);

  const onScroll = () => {
    if (!s.syncScroll || !editorVisible || !sync.editor) return;
    if (!claimScroll('preview')) return;
    sync.editor.scrollToLine(sync.preview?.topLine() ?? 1);
  };

  // ------------------------------------------------------------ cursor highlight
  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    article.querySelectorAll('.is-source-active').forEach((el) => el.classList.remove('is-source-active'));
    if (!editorVisible || cursorLine === null) return;
    let best: HTMLElement | null = null;
    let bestLine = 0;
    article.querySelectorAll<HTMLElement>('[data-block][data-line]').forEach((el) => {
      const line = Number(el.dataset.line);
      const [a, b] = (el.dataset.src ?? '').split(':').map(Number);
      if (line <= cursorLine && line >= bestLine && a !== undefined && b !== undefined && !['list', 'table'].includes(el.dataset.block ?? '')) {
        best = el;
        bestLine = line;
      }
    });
    (best as HTMLElement | null)?.classList.add('is-source-active');
  }, [cursorLine, html, editorVisible]);

  // ------------------------------------------------------------ clicks inside the document
  const onClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const article = articleRef.current;
    if (!article) return;
    const copy = target.closest<HTMLButtonElement>('.rg-copy');
    if (copy) {
      e.preventDefault();
      const code = copy.closest('.rg-code')?.querySelector('pre code');
      void navigator.clipboard?.writeText(code?.textContent ?? '').then(
        () => {
          copy.classList.add('is-copied');
          const label = copy.querySelector('.rg-copy-label');
          if (label) label.textContent = 'Copied';
          setTimeout(() => {
            copy.classList.remove('is-copied');
            if (label) label.textContent = 'Copy';
          }, 1600);
        },
        () => toast('Could not copy — your browser blocked clipboard access.', 'error'),
      );
      return;
    }
    const anchor = target.closest<HTMLAnchorElement>('a');
    if (anchor && article.contains(anchor)) {
      const href = anchor.getAttribute('href') ?? '';
      if (anchor.classList.contains('rg-anchor')) {
        e.preventDefault();
        const id = anchor.dataset.anchor ?? href.slice(1);
        scrollToId(id);
        const url = new URL(window.location.href);
        url.hash = id;
        void navigator.clipboard?.writeText(url.toString()).then(() => toast('Link to this section copied.', 'success'));
        return;
      }
      if (href.startsWith('#')) {
        e.preventDefault();
        scrollToId(decodeURIComponent(href.slice(1)));
        return;
      }
      if (!/^(https?:|mailto:)/i.test(href) && !visualEdit) {
        e.preventDefault();
        toast(`“${anchor.dataset.orig ?? href}” points to a file in the project. Load the repository from GitHub to follow repository links.`, 'info');
        return;
      }
      if (visualEdit) e.preventDefault();
      return;
    }
    const img = target.closest<HTMLImageElement>('img[data-zoom]');
    if (img && !visualEdit) {
      const list = Array.from(article.querySelectorAll<HTMLImageElement>('img[data-zoom]')).filter((i) => i.src).map((i) => ({ src: i.src, alt: i.alt }));
      ui.set({ lightbox: { src: img.src, alt: img.alt, list } });
      return;
    }
    // Click-to-source: jump to this block in the editor.
    if (editorVisible && !visualEdit && sync.editor && !window.getSelection()?.toString()) {
      const block = target.closest<HTMLElement>('[data-line]');
      if (block && !target.closest('button, a, summary, input')) {
        sync.editor.revealLine(Number(block.dataset.line), true);
      }
    }
  };

  const scrollToId = (id: string) => {
    const article = articleRef.current;
    const el = article?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"], [name="${CSS.escape(id)}"], [id="user-content-${CSS.escape(id)}"]`);
    if (!el) return;
    if (p.layout === 'slides') {
      const slideEl = el.closest<HTMLElement>('.rg-slide');
      if (slideEl) setSlide(Number(slideEl.dataset.slide ?? 0));
      return;
    }
    el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    setTocOpen(false);
  };

  const docStyle = { ...(p.style as CSSProperties), ['--rg-viewport' as string]: `${viewport}px` } as CSSProperties;
  const isSlides = p.layout === 'slides';
  const particleColors = [s.accent ?? tokens.accent, tokens.link, tokens.important];

  return (
    <div
      className={`pv-scroll${isSlides ? ' is-slides' : ''}${visualEdit ? ' is-visual' : ''}`}
      ref={scrollRef}
      onScroll={onScroll}
      tabIndex={-1}
      aria-label="Rendered README"
      role="region"
      onPointerDown={(e) => {
        if (isSlides && e.pointerType !== 'mouse') swipe.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const start = swipe.current;
        swipe.current = null;
        if (!start || !isSlides) return;
        const dx = e.clientX - start.x;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - start.y) * 1.5) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className={p.className} style={docStyle} dir={s.dir === 'auto' ? (result?.features.rtl ? 'rtl' : undefined) : s.dir} data-ready={themeReady ? 'true' : 'false'}>
        <div className="rg-backdrop">
          <div className="rg-backdrop-inner">{s.background === 'particles' && <Particles colors={particleColors} />}</div>
        </div>
        <div className="rg-frame">
          {p.layout === 'docs' && toc.length > 0 && (
            <>
              <nav className={`rg-toc${tocOpen ? ' is-open' : ''}`} aria-label="Table of contents" id="rg-toc">
                <p className="rg-toc-title">On this page</p>
                <ol>
                  {toc.map((t) => (
                    <li key={t.id}>
                      <a
                        href={`#${t.id}`}
                        data-depth={t.depth}
                        className={activeHeading === t.id ? 'is-active' : undefined}
                        aria-current={activeHeading === t.id ? 'location' : undefined}
                        onClick={(e) => {
                          e.preventDefault();
                          scrollToId(t.id);
                        }}
                      >
                        {t.text}
                      </a>
                    </li>
                  ))}
                </ol>
                {result && (
                  <p className="rg-toc-meta">
                    {result.stats.readingMinutes} min read · {result.stats.words.toLocaleString()} words
                  </p>
                )}
              </nav>
              <button type="button" className="rg-toc-toggle" aria-expanded={tocOpen} aria-controls="rg-toc" onClick={() => setTocOpen((o) => !o)}>
                <Icon name={tocOpen ? 'x' : 'list'} size={16} /> Contents
              </button>
            </>
          )}
          <article className="rg-body markdown-body" ref={articleRef} onClick={onClick} />
        </div>
        {isSlides && slideCount > 0 && (
          <>
            <div className="rg-slides-progress" aria-hidden="true">
              <span style={{ width: `${((slide + 1) / slideCount) * 100}%` }} />
            </div>
            <div className="rg-slides-ui">
              <button type="button" onClick={() => go(-1)} disabled={slide === 0} aria-label="Previous slide">
                <Icon name="chevronLeft" size={18} />
              </button>
              <span className="rg-slides-count" aria-live="polite">
                {Math.min(slide + 1, slideCount)} / {slideCount}
              </span>
              <button type="button" onClick={() => go(1)} disabled={slide >= slideCount - 1} aria-label="Next slide">
                <Icon name="chevronRight" size={18} />
              </button>
              <button type="button" onClick={() => void toggleFullscreen()} aria-label="Full screen (F)">
                <Icon name="fullscreen" size={16} />
              </button>
            </div>
          </>
        )}
      </div>
      {visualEdit && <VisualEditor articleRef={articleRef} scrollRef={scrollRef} editingRef={editingRef} onEditEnd={flushPending} rendered={rendered} />}
    </div>
  );
}

/** Post-processing after new HTML is written: missing images, theme-aware <picture>. */
function afterRender(article: HTMLElement, mode: 'light' | 'dark'): void {
  article.querySelectorAll<HTMLImageElement>('img[data-missing]').forEach((img) => replaceMissing(img));
  article.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
    img.addEventListener('error', () => replaceMissing(img), { once: true });
  });
  article.querySelectorAll<HTMLSourceElement>('picture source[media*="prefers-color-scheme"]').forEach((source) => {
    const media = source.getAttribute('media') ?? '';
    const wantsDark = /dark/.test(media);
    source.setAttribute('media', wantsDark === (mode === 'dark') ? 'all' : 'not all');
  });
}

function replaceMissing(img: HTMLImageElement): void {
  if (!img.isConnected) return;
  const badge = img.hasAttribute('data-badge') || !!img.closest('.rg-badges');
  const path = img.dataset.orig ?? img.dataset.missing ?? img.getAttribute('src') ?? '';
  const box = document.createElement('span');
  box.className = `rg-missing${badge ? ' is-badge' : ''}`;
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', img.alt || 'Image not found');
  const strong = document.createElement('strong');
  strong.textContent = img.alt || (badge ? 'badge' : 'Image');
  box.appendChild(strong);
  if (!badge) {
    const hint = document.createElement('span');
    const local = path && !/^(https?:|data:|blob:)/.test(path);
    hint.textContent = local ? `${path} — drop the project folder to include local images` : 'This image could not be loaded';
    box.appendChild(hint);
  }
  img.replaceWith(box);
}
