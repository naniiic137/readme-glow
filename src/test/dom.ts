/** Polyfills for the browser APIs jsdom does not implement. Idempotent. */

function define(target: object, key: string, value: unknown): void {
  if (key in target && (target as Record<string, unknown>)[key] !== undefined) return;
  Object.defineProperty(target, key, { value, configurable: true, writable: true });
}

const emptyRect = (): DOMRect =>
  ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }) as DOMRect;

function emptyRectList(): DOMRectList {
  const list = [] as unknown as DOMRectList & DOMRect[];
  (list as unknown as { item: (i: number) => DOMRect | null }).item = () => null;
  return list;
}

/** A MediaQueryList that never matches (tests can override `window.matchMedia`). */
export function mediaQueryList(query: string, matches = false): MediaQueryList {
  return {
    matches,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  } as MediaQueryList;
}

class NoopObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): never[] {
    return [];
  }
}

let objectUrlId = 0;

export function installDomPolyfills(): void {
  define(window, 'matchMedia', (query: string) => mediaQueryList(query));
  define(window, 'ResizeObserver', NoopObserver);
  define(window, 'IntersectionObserver', class extends NoopObserver {
    root = null;
    rootMargin = '0px';
    thresholds = [0];
  });
  define(globalThis, 'ResizeObserver', window.ResizeObserver);
  define(globalThis, 'IntersectionObserver', window.IntersectionObserver);

  // CSS.escape (the command palette's "Jump to" items use it).
  const css = ((globalThis as { CSS?: Record<string, unknown> }).CSS ??= {}) as Record<string, unknown>;
  define(css, 'escape', (value: string) =>
    String(value)
      .replace(/[^\w -￿-]/g, (ch) => `\\${ch}`)
      .replace(/^(-?)(\d)/, (_m, dash: string, digit: string) => `${dash}\\3${digit} `),
  );
  if (!(window as { CSS?: unknown }).CSS) define(window, 'CSS', css);

  // Layout: CodeMirror measures ranges; the palette and find bar scroll items into view.
  define(Range.prototype, 'getBoundingClientRect', emptyRect);
  define(Range.prototype, 'getClientRects', emptyRectList);
  define(Element.prototype, 'scrollIntoView', function scrollIntoView() {});
  define(Element.prototype, 'scrollTo', function scrollTo() {});
  define(window, 'scrollTo', () => undefined);
  define(document, 'elementFromPoint', () => null);

  // Object URLs for dropped images. Node's own URL.createObjectURL only takes
  // Node Blobs, not jsdom's, so these are always replaced.
  Object.defineProperty(URL, 'createObjectURL', { value: () => `blob:mock/${++objectUrlId}`, configurable: true, writable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: () => undefined, configurable: true, writable: true });

  keepBlobsInStructuredClone();
}

const BLOB_SLOT = '\u0000rg-test-blob';

/**
 * fake-indexeddb stores records with Node's structuredClone, which turns a
 * jsdom Blob/File into `{}`. Blobs are immutable, so keeping the same
 * instance is a faithful clone for tests.
 */
function keepBlobsInStructuredClone(): void {
  const native = globalThis.structuredClone as typeof structuredClone & { __keepsBlobs?: boolean };
  if (!native || native.__keepsBlobs) return;
  const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
  const wrapped = ((value: unknown, options?: StructuredSerializeOptions) => {
    const blobs: Blob[] = [];
    const swap = (v: unknown): unknown => {
      if (typeof Blob !== 'undefined' && v instanceof Blob) {
        blobs.push(v);
        return { [BLOB_SLOT]: blobs.length - 1 };
      }
      if (Array.isArray(v)) return v.map(swap);
      if (isPlain(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)]));
      return v;
    };
    const restore = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(restore);
      if (isPlain(v)) {
        if (typeof v[BLOB_SLOT] === 'number') return blobs[v[BLOB_SLOT] as number];
        return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, restore(x)]));
      }
      return v;
    };
    const swapped = swap(value);
    return blobs.length ? restore(native(swapped, options)) : native(value, options);
  }) as typeof structuredClone & { __keepsBlobs?: boolean };
  wrapped.__keepsBlobs = true;
  globalThis.structuredClone = wrapped;
}
