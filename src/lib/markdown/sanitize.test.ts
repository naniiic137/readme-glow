// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './pipeline';
import { isSafeUrl } from './schema';

/**
 * Classic XSS vectors. Every one must come out inert: no script elements, no
 * event handler attributes, no javascript:/vbscript:/data: navigations, no
 * frames, no SVG, no user styles.
 */
const VECTORS: Array<[string, string]> = [
  ['script tag', '<script>alert(1)</script>'],
  ['script tag with src', '<script src="https://evil.example/x.js"></script>'],
  ['img onerror', '<img src=x onerror="alert(1)">'],
  ['img onerror unquoted', '<img src=x onerror=alert(1)//>'],
  ['svg onload', '<svg onload=alert(1)><circle r="10"/></svg>'],
  ['svg script', '<svg><script>alert(1)</script></svg>'],
  ['javascript link (html)', '<a href="javascript:alert(1)">click</a>'],
  ['javascript link (markdown)', '[click](javascript:alert(1))'],
  ['javascript link with entities', '<a href="jav&#x09;ascript:alert(1)">x</a>'],
  ['javascript link mixed case', '[x](JaVaScRiPt:alert(1))'],
  ['vbscript link', '<a href="vbscript:msgbox(1)">x</a>'],
  ['data html link', '[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)'],
  ['iframe', '<iframe src="https://evil.example"></iframe>'],
  ['iframe srcdoc', '<iframe srcdoc="<script>alert(1)</script>"></iframe>'],
  ['object', '<object data="evil.swf"></object>'],
  ['embed', '<embed src="evil.swf">'],
  ['style tag', '<style>body{display:none}</style>'],
  ['style attribute', '<p style="position:fixed;inset:0;background:red">x</p>'],
  ['body onload', '<body onload=alert(1)>'],
  ['details ontoggle', '<details open ontoggle=alert(1)><summary>x</summary></details>'],
  ['input autofocus onfocus', '<input autofocus onfocus=alert(1)>'],
  ['form action', '<form action="javascript:alert(1)"><button>go</button></form>'],
  ['meta refresh', '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">'],
  ['base href', '<base href="javascript:alert(1)//">'],
  ['link stylesheet', '<link rel="stylesheet" href="https://evil.example/x.css">'],
  ['math href', '<math href="javascript:alert(1)">x</math>'],
  ['video onerror', '<video src=x onerror=alert(1)></video>'],
  ['source srcset javascript', '<picture><source srcset="javascript:alert(1)"><img src="a.png"></picture>'],
  ['template', '<template><img src=x onerror=alert(1)></template>'],
  ['noscript mutation', '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>'],
  ['markdown image onerror title', '![x](https://example.com/a.png "\\" onerror=\\"alert(1)")'],
  ['autolink javascript', '<javascript:alert(1)>'],
  ['html comment breakout', '<!-- --><script>alert(1)</script> -->'],
  ['mxss via namespace confusion', '<svg></p><style><a id="</style><img src=1 onerror=alert(1)>">'],
  ['dom clobbering', '<img name="getElementById"><form id="settings"></form>'],
  ['katex href', '$\\href{javascript:alert(1)}{click}$'],
  ['mermaid init directive', '```mermaid\n%%{init: {"securityLevel": "loose"}}%%\ngraph TD; A[<img src=x onerror=alert(1)>]\n```'],
];

function parse(html: string): HTMLElement {
  const root = document.createElement('div');
  // Our output is only ever parsed into an inert container like this.
  root.innerHTML = html;
  return root;
}

describe('sanitisation: XSS vectors', () => {
  it.each(VECTORS)('neutralises %s', async (_name, markdown) => {
    const { html } = await renderMarkdown(markdown);
    const root = parse(html);
    expect(root.querySelector('script, iframe, object, embed, style, link, meta, base, form, template, frame, noscript')).toBeNull();
    // MathML is only ever produced by KaTeX.
    for (const m of root.querySelectorAll('math')) expect(m.closest('.katex')).not.toBeNull();
    // Only our own trusted SVG icons may exist.
    for (const svg of root.querySelectorAll('svg')) expect(svg.getAttribute('class')).toMatch(/^rg-icon/);
    for (const node of root.querySelectorAll('*')) {
      for (const attr of Array.from(node.attributes)) {
        expect(attr.name.startsWith('on'), `${node.tagName} has ${attr.name}`).toBe(false);
        if (attr.name === 'style') {
          // KaTeX output is allowed to carry inline styles; nothing else is.
          expect(node.closest('.katex')).not.toBeNull();
        }
        if (['href', 'src', 'srcset', 'action', 'formaction', 'poster', 'xlink:href', 'data'].includes(attr.name)) {
          const value = attr.value.replace(/[\u0000- ]/g, '').toLowerCase();
          expect(value.startsWith('javascript:'), `${attr.name}=${attr.value}`).toBe(false);
          expect(value.startsWith('vbscript:')).toBe(false);
          expect(value.startsWith('data:text')).toBe(false);
        }
      }
    }
    // The text may still read "javascript:alert(1)"; it just is never a live URL.
    expect(html.toLowerCase()).not.toMatch(/="\s*javascript:/);
  });

  it('keeps harmless HTML that READMEs rely on', async () => {
    const { html } = await renderMarkdown(
      '<p align="center"><img src="https://example.com/logo.png" width="120" alt="logo"></p>\n\n<details><summary>More</summary>\n\nHidden **text**\n\n</details>\n\n<kbd>Ctrl</kbd> + <kbd>K</kbd> H<sub>2</sub>O x<sup>2</sup>\n',
    );
    const root = parse(html);
    expect(root.querySelector('p[align="center"] img[width="120"]')).not.toBeNull();
    expect(root.querySelector('details > summary')?.textContent).toBe('More');
    expect(root.querySelectorAll('kbd')).toHaveLength(2);
    expect(root.querySelector('sub')?.textContent).toBe('2');
    expect(root.querySelector('sup')?.textContent).toBe('2');
  });

  it('prefixes user ids and names so they cannot clobber globals', async () => {
    const { html } = await renderMarkdown('<img name="getElementById" src="https://example.com/a.png"><div id="settings">x</div>');
    const root = parse(html);
    expect(root.querySelector('[name="getElementById"]')).toBeNull();
    expect(root.querySelector('[name="user-content-getElementById"]')).not.toBeNull();
    expect(root.querySelector('#user-content-settings')).not.toBeNull();
  });

  it('shows style tag contents nowhere', async () => {
    const { html } = await renderMarkdown('<style>.secret{color:red}</style>visible');
    expect(html).not.toContain('.secret');
    expect(html).toContain('visible');
  });
});

describe('isSafeUrl', () => {
  it.each([
    ['https://example.com/a.png', true],
    ['http://example.com', true],
    ['#section', true],
    ['docs/a.png', true],
    ['./a.png', true],
    ['../a.png', true],
    ['/abs.png', true],
    ['data:image/png;base64,AAAA', true],
    ['blob:https://x/1', true],
    ['javascript:alert(1)', false],
    [' java\tscript:alert(1)', false],
    ['JAVASCRIPT:alert(1)', false],
    ['vbscript:x', false],
    ['data:text/html,<script>', false],
    ['file:///etc/passwd', false],
  ])('%s → %s', (url, safe) => {
    expect(isSafeUrl(url)).toBe(safe);
  });
});
