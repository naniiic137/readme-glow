import type { SVGProps } from 'react';

/** Stroke icons (24×24, 1.8px), drawn for ReadmeGlow in the style of Lucide (ISC). */
const PATHS: Record<string, string> = {
  upload: 'M12 15V3m0 0L7 8m5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z',
  file: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Zm0 0v6h6',
  clipboard: 'M9 4h6a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm-1 1H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2',
  github:
    'M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8ZM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9Z',
  palette: 'M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2a1.7 1.7 0 0 1 1.2-2.9H16a5 5 0 0 0 5-5C21 6.3 17 3 12 3ZM7.5 11.5h.01M10.5 7.5h.01M15.5 7.5h.01M17.5 11.5h.01',
  layout: 'M4 4h16v16H4Zm0 5h16M9 9v11',
  sliders: 'M4 6h10m4 0h2M4 12h4m4 0h8M4 18h12m4 0h0M14 4v4M8 10v4M16 16v4',
  download: 'M12 3v12m0 0-5-5m5 5 5-5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  share: 'M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  image: 'M4 5h16v14H4Zm0 11 4.5-4.5a1.5 1.5 0 0 1 2 0L16 17m-2-2 1.5-1.5a1.5 1.5 0 0 1 2 0L20 16M15 9h.01',
  code: 'm9 8-5 4 5 4m6-8 5 4-5 4',
  codeBlock: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm5 5-3 3 3 3m4-6 3 3-3 3',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  edit: 'M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Zm9.5-13.5 4 4',
  split: 'M4 4h16v16H4Zm8 0v16',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm10 3-5-5',
  command: 'M9 6v12M15 6v12M6 9h12M6 15h12M9 6a3 3 0 1 0-3 3m12 0a3 3 0 1 0-3-3m0 12a3 3 0 1 0 3-3M6 15a3 3 0 1 0 3 3',
  keyboard: 'M3 6h18v12H3Zm4 4h.01M11 10h.01M15 10h.01M7 14h10',
  x: 'M18 6 6 18M6 6l12 12',
  check: 'm5 12 5 5L20 7',
  chevronLeft: 'm15 18-6-6 6-6',
  chevronRight: 'm9 18 6-6-6-6',
  chevronDown: 'm6 9 6 6 6-6',
  arrowLeft: 'M19 12H5m0 0 6-6m-6 6 6 6',
  arrowRight: 'M5 12h14m0 0-6-6m6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
  copy: 'M9 9h10v10H9Zm-4 6H4V4h11v1',
  grip: 'M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01',
  undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  redo: 'm15 14 5-5-5-5m5 5H9a5 5 0 0 0 0 10h3',
  bold: 'M7 5h6a3.5 3.5 0 0 1 0 7H7Zm0 7h7a3.5 3.5 0 0 1 0 7H7Z',
  italic: 'M19 4h-9M14 20H5M15 4 9 20',
  strike: 'M16 6.5A4 4 0 0 0 12.5 5H11a3.5 3.5 0 0 0 0 7h2a3.5 3.5 0 0 1 0 7h-1.5A4 4 0 0 1 8 17.5M4 12h16',
  heading: 'M6 4v16M18 4v16M6 12h12',
  quote: 'M7 11H4V7h4v5a4 4 0 0 1-4 4m13-5h-3V7h4v5a4 4 0 0 1-4 4',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  listOrdered: 'M10 6h10M10 12h10M10 18h10M4 5l1.5-1V9M4 14.5a1.5 1.5 0 0 1 3 0c0 1.5-3 2-3 3.5h3M4 20.5h1.5a1 1 0 0 0 0-2H5a1 1 0 0 0 0-2H4',
  listChecks: 'm3 7 2 2 3-3m-5 9 2 2 3-3M12 7h9M12 16h9',
  table: 'M3 5h18v14H3Zm0 5h18M3 15h18M9 5v14M15 5v14',
  minus: 'M5 12h14',
  alert: 'M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-6v-4m0-4h.01',
  details: 'M4 6h16M4 10h10M9 15l3 3 3-3',
  footnote: 'M4 18h10M4 13h16M4 8h16M17 4v3m0 0h3',
  smile: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm-4-8s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5Zm0 0A2.5 2.5 0 0 0 6.5 22H20v-5',
  health: 'M22 12h-4l-3 8-6-16-3 8H2',
  wand: 'M15 4V2m0 14v-2M8 9h2m10 0h2M17.8 11.8 19 13M15 9h.01M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5',
  lightbulb: 'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z',
  maximize: 'M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3',
  minimize: 'M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3',
  menu: 'M4 6h16M4 12h16M4 18h16',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-14v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z',
  printer: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6Z',
  fileCode: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Zm0 0v6h6M10 13l-2 2 2 2m4-4 2 2-2 2',
  archive: 'M3 4h18v4H3Zm2 4v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8m-9 4h4',
  library: 'M4 4h4v16H4Zm6 0h4v16h-4Zm5.5 1 3.9-1 3.6 15-3.9 1Z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-15v5l3 2',
  star: 'm12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1Z',
  refresh: 'M21 12a9 9 0 0 1-15.5 6.2L3 16m0 5v-5h5M3 12a9 9 0 0 1 15.5-6.2L21 8m0-5v5h-5',
  lock: 'M5 11h14v10H5Zm3 0V7a4 4 0 0 1 8 0v4',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Zm-3-10 2 2 4-4',
  zap: 'M13 2 3 14h9l-1 8 10-12h-9Z',
  type: 'M4 7V4h16v3M9 20h6M12 4v16',
  presentation: 'M3 3h18M4 3v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3m-8 13v5m-4 0h8',
  newspaper: 'M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9h4m12 3h-8m8 4h-8M10 6h8v4h-8Z',
  panelLeft: 'M3 4h18v16H3Zm6 0v16',
  rocket: 'M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1ZM12 15l-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2Zm-3-3H4s.6-3 2-4c1.6-1.1 5 0 5 0m1 7v5s3-.6 4-2c1.1-1.6 0-5 0-5',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z',
  pencilLine: 'M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z',
  mouse: 'M12 3a6 6 0 0 0-6 6v6a6 6 0 0 0 12 0V9a6 6 0 0 0-6-6Zm0 4v4',
  heart: 'M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z',
  badge: 'M3 8h18v8H3Zm9 0v8',
  template: 'M4 4h16v6H4Zm0 10h7v6H4Zm11 0h5v6h-5Z',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-4a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm0-4a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  wrap: 'M3 6h18M3 12h15a3 3 0 1 1 0 6h-4m0 0 2-2m-2 2 2 2M3 18h7',
  hash: 'M4 9h16M4 15h16M10 3 8 21M16 3l-2 18',
  moreH: 'M5 12h.01M12 12h.01M19 12h.01',
  fullscreen: 'M3 8V3h5M21 8V3h-5M3 16v5h5m13-5v5h-5',
  play: 'm6 4 14 8-14 8Z',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, ...rest }: { name: IconName | string; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name] ?? PATHS.info} />
    </svg>
  );
}
