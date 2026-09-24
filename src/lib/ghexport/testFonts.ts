// Test-only: loads the export fonts straight from node_modules.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse, type Font } from 'opentype.js';
import type { ThemeId } from '../../themes/types';
import { GH_FONTS, type FontRef } from './fonts';
import type { GhFonts } from './svg';

const cache = new Map<string, Font>();

export function loadTestFont(ref: FontRef): Font {
  const key = `${ref.pkg}/${ref.file}`;
  let font = cache.get(key);
  if (!font) {
    const buf = readFileSync(resolve(process.cwd(), 'node_modules', ref.pkg, 'files', ref.file));
    font = parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    cache.set(key, font);
  }
  return font;
}

export function testFonts(theme: ThemeId): GhFonts {
  return { heading: loadTestFont(GH_FONTS[theme].heading), body: loadTestFont(GH_FONTS[theme].body) };
}
