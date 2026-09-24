/**
 * Standalone HTML export. The page is self-contained: the theme's CSS is
 * inlined, local images become data: URIs and the theme's fonts are embedded
 * (latin subset, woff2, base64) so the file looks right offline. Math, when
 * present, links KaTeX's stylesheet from jsDelivr (its 20 font files would
 * triple the file size). A tiny inline script powers copy buttons, the docs
 * contents drawer and slide navigation.
 */

export interface StandaloneInput {
  title: string;
  description: string | null;
  lang?: string;
  /** Outer HTML of the themed `.rg-doc` element. */
  docHtml: string;
  css: string[];
  math: boolean;
  katexVersion?: string;
  generator?: string;
  themeColor: string;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Keeps `</style` out of inlined CSS. */
export function safeCss(css: string): string {
  return css.replace(/<\/style/gi, '<\\/style');
}

export const EXPORT_SCRIPT = `(()=>{const d=document;d.addEventListener('click',e=>{const b=e.target.closest('.rg-copy');if(b){const c=b.closest('.rg-code')?.querySelector('pre code');navigator.clipboard?.writeText(c?c.textContent:'').then(()=>{const l=b.querySelector('.rg-copy-label');if(l){l.textContent='Copied';setTimeout(()=>l.textContent='Copy',1500)}});return}const t=e.target.closest('.rg-toc-toggle');if(t){const n=d.querySelector('.rg-toc');const o=n.classList.toggle('is-open');t.setAttribute('aria-expanded',o)}});const s=[...d.querySelectorAll('.rg-slide')];if(s.length){let i=0;const u=d.querySelector('.rg-slides-count'),p=d.querySelector('.rg-slides-progress>span'),[pv,nx]=d.querySelectorAll('.rg-slides-ui button');const go=n=>{i=Math.max(0,Math.min(s.length-1,n));s.forEach((x,k)=>{x.classList.toggle('is-active',k===i);x.classList.toggle('is-before',k<i)});if(u)u.textContent=(i+1)+' / '+s.length;if(p)p.style.width=((i+1)/s.length*100)+'%';if(pv)pv.disabled=i===0;if(nx)nx.disabled=i===s.length-1};pv&&pv.addEventListener('click',()=>go(i-1));nx&&nx.addEventListener('click',()=>go(i+1));d.addEventListener('keydown',e=>{if(['ArrowRight','PageDown',' '].includes(e.key)){e.preventDefault();go(i+1)}if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();go(i-1)}if(e.key==='Home')go(0);if(e.key==='End')go(s.length-1)});let sx=null;d.addEventListener('touchstart',e=>{sx=e.touches[0].clientX},{passive:true});d.addEventListener('touchend',e=>{if(sx===null)return;const dx=e.changedTouches[0].clientX-sx;if(Math.abs(dx)>50)go(i+(dx<0?1:-1));sx=null});go(0)}const L=[...d.querySelectorAll('.rg-toc a[href^="#"]')];if(L.length){const H=L.map(a=>d.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)))).filter(Boolean);const spy=()=>{let c=null;for(const h of H){if(h.getBoundingClientRect().top<=110)c=h.id;else break}c=c||(H[0]&&H[0].id);L.forEach(a=>a.classList.toggle('is-active',a.getAttribute('href')==='#'+c))};addEventListener('scroll',spy,{passive:true});spy()}})();`;

export function buildStandaloneHtml(input: StandaloneInput): string {
  const css = input.css.map(safeCss).join('\n');
  const katex = input.math
    ? `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@${input.katexVersion ?? '0.16.22'}/dist/katex.min.css" crossorigin="anonymous">`
    : '';
  const page = `html,body{margin:0;padding:0;background:var(--rg-bg,#fff)}body{min-height:100vh}.rg-doc{min-height:100vh;--rg-viewport:100vh}.rg-doc.layout-slides{height:100vh}`;
  return `<!doctype html>
<html lang="${escapeHtml(input.lang ?? 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.title)}</title>
${input.description ? `<meta name="description" content="${escapeHtml(input.description.slice(0, 300))}">` : ''}
<meta property="og:title" content="${escapeHtml(input.title)}">
${input.description ? `<meta property="og:description" content="${escapeHtml(input.description.slice(0, 300))}">` : ''}
<meta name="theme-color" content="${escapeHtml(input.themeColor)}">
<meta name="generator" content="${escapeHtml(input.generator ?? 'ReadmeGlow — https://naniiic137.github.io/readme-glow/')}">
${katex}
<style>
${page}
${css}
</style>
</head>
<body>
${input.docHtml}
<script>${EXPORT_SCRIPT}</script>
</body>
</html>
`;
}

/** Turns a title into a safe file name. */
export function fileSlug(title: string, fallback = 'readme'): string {
  const slug = title
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}
