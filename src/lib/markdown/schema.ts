import { defaultSchema } from 'rehype-sanitize';
import type { Options as SanitizeSchema } from 'rehype-sanitize';

type AttributeList = NonNullable<NonNullable<SanitizeSchema['attributes']>[string]>;

const base = defaultSchema;
const baseAttributes = base.attributes ?? {};

function attrs(tag: string, extra: AttributeList): AttributeList {
  return [...(baseAttributes[tag] ?? []), ...extra];
}

/**
 * Sanitiser schema: GitHub's own allow-list (the default of hast-util-sanitize)
 * with a few additions READMEs rely on (videos, <mark>, <u>, figure) and a few
 * removals (accessKey could hijack our keyboard shortcuts).
 *
 * Everything that can run code is gone: <script>, <style>, <iframe>, <object>,
 * <embed>, <svg>, <math>, <form>, event handler attributes, `style` attributes,
 * and any URL whose protocol is not in `protocols` (so no javascript:, vbscript:
 * or data: links). Elements listed in `strip` are removed with their content;
 * other unknown elements are unwrapped (their text is kept).
 */
export const sanitizeSchema: SanitizeSchema = {
  ...base,
  tagNames: [...(base.tagNames ?? []), 'video', 'figure', 'figcaption', 'mark', 'u', 'abbr', 'caption', 'col', 'colgroup'],
  strip: [
    'script',
    'style',
    'template',
    'iframe',
    'frame',
    'frameset',
    'object',
    'embed',
    'applet',
    'noscript',
    'noembed',
    'textarea',
    'select',
    'option',
    'button',
    'svg',
    'math',
    'title',
    'head',
    'link',
    'meta',
    'base',
    'form',
    'dialog',
    'canvas',
    'audio',
    'track',
    'xmp',
    'plaintext',
  ],
  attributes: {
    ...baseAttributes,
    '*': (baseAttributes['*'] ?? []).filter((name) => name !== 'accessKey' && name !== 'action' && name !== 'method'),
    a: attrs('a', []),
    code: [['className', /^language-./, 'math-inline', 'math-display']],
    img: attrs('img', ['alt', 'title', 'width', 'height', 'align', 'loading']),
    source: attrs('source', ['media', 'type', 'width', 'height']),
    video: ['src', 'poster', 'controls', 'muted', 'loop', 'playsInline', 'width', 'height', 'preload', 'title'],
    // `language-math` code blocks come through as <pre><code class="language-math math-display">.
    pre: [],
  },
  protocols: {
    ...base.protocols,
    // data: images are harmless (an <img> never runs script) and some READMEs inline small logos.
    src: ['http', 'https', 'data'],
    poster: ['http', 'https'],
  },
  required: base.required ?? {},
};

/** Protocols allowed in `srcset` candidates (checked by the enhancer, the sanitiser cannot). */
export const SAFE_URL = /^(?:https?:|data:image\/|blob:|#|\/|\.{0,2}\/|[^:]*$)/i;

export function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();
  // Browsers ignore control characters and whitespace inside the scheme; so do we.
  const normalised = trimmed.replace(/[\u0000- \u007f-\u009f]/g, '');
  return SAFE_URL.test(normalised);
}
