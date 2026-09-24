/**
 * Mermaid diagrams, lazy-loaded the first time a document has one.
 * Mermaid runs with securityLevel "strict" (labels are sanitised, no click
 * handlers, directives cannot lower it) and its SVG output is sanitised
 * again with DOMPurify before it touches the page.
 */
type MermaidApi = typeof import('mermaid').default;

let loader: Promise<{ mermaid: MermaidApi; purify: typeof import('dompurify').default }> | null = null;
const cache = new Map<string, string>();
let seq = 0;
let lastConfig = '';

function load() {
  loader ??= Promise.all([import('mermaid'), import('dompurify')]).then(([m, p]) => ({ mermaid: m.default, purify: p.default }));
  return loader;
}

export interface MermaidTheme {
  dark: boolean;
  font: string;
  text: string;
  surface: string;
  bg: string;
  accent: string;
  border: string;
  muted: string;
}

function configure(mermaid: MermaidApi, t: MermaidTheme): string {
  const key = JSON.stringify(t);
  if (key === lastConfig) return key;
  lastConfig = key;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    fontFamily: t.font,
    // SVG text labels (no <foreignObject>), so the sanitised SVG keeps every label.
    htmlLabels: false,
    flowchart: { htmlLabels: false, curve: 'basis', useMaxWidth: true },
    sequence: { useMaxWidth: true },
    themeVariables: {
      darkMode: t.dark,
      background: t.surface,
      fontFamily: t.font,
      primaryColor: t.surface,
      primaryTextColor: t.text,
      primaryBorderColor: t.accent,
      secondaryColor: t.bg,
      tertiaryColor: t.bg,
      lineColor: t.muted,
      textColor: t.text,
      mainBkg: t.surface,
      nodeBorder: t.accent,
      clusterBkg: t.bg,
      clusterBorder: t.border,
      edgeLabelBackground: t.surface,
      actorBkg: t.surface,
      actorBorder: t.accent,
      actorTextColor: t.text,
      signalColor: t.text,
      signalTextColor: t.text,
      noteBkgColor: t.bg,
      noteTextColor: t.text,
      noteBorderColor: t.border,
    },
  });
  return key;
}

export async function renderMermaid(root: HTMLElement, theme: MermaidTheme): Promise<void> {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('.rg-mermaid'));
  if (!blocks.length) return;
  const { mermaid, purify } = await load();
  const key = configure(mermaid, theme);
  for (const block of blocks) {
    if (!block.isConnected) continue;
    const source = block.querySelector('.rg-mermaid-source code')?.textContent ?? '';
    const cacheKey = `${key}\u0000${source}`;
    let svg = cache.get(cacheKey);
    if (!svg) {
      try {
        const out = await mermaid.render(`rg-mermaid-${++seq}`, source);
        svg = purify.sanitize(out.svg, {
          USE_PROFILES: { svg: true, svgFilters: true },
          ADD_TAGS: ['style'],
          FORBID_ATTR: ['onclick', 'onload', 'onerror'],
        });
        cache.set(cacheKey, svg);
        if (cache.size > 60) cache.delete(cache.keys().next().value!);
      } catch {
        // Mermaid leaves an error element in the body; tidy it up.
        document.getElementById(`drg-mermaid-${seq}`)?.remove();
        block.dataset.mermaid = 'error';
        continue;
      }
    }
    if (!block.isConnected) continue;
    const holder = document.createElement('div');
    holder.className = 'rg-mermaid-svg';
    holder.innerHTML = svg;
    block.querySelector('.rg-mermaid-svg')?.remove();
    block.prepend(holder);
    block.dataset.mermaid = 'done';
    block.setAttribute('role', 'img');
    block.setAttribute('aria-label', 'Diagram');
  }
}
