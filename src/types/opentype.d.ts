// Minimal types for the parts of opentype.js 2.x that ReadmeGlow uses.
declare module 'opentype.js' {
  export interface PathOptions {
    kerning?: boolean;
    letterSpacing?: number;
    drawSVG?: boolean;
    drawLayers?: boolean;
  }
  export interface BoundingBox {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }
  export interface PathCommand {
    type: 'M' | 'L' | 'Q' | 'C' | 'Z';
    x?: number;
    y?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
  }
  export interface Path {
    commands: PathCommand[];
    toPathData(decimalPlaces?: number): string;
    getBoundingBox(): BoundingBox;
  }
  export interface Glyph {
    index: number;
    advanceWidth?: number;
    getPath(x: number, y: number, fontSize: number, options?: PathOptions, font?: Font): Path;
  }
  export interface Position {
    getDefaultScriptName(): string;
    getKerningTables(script: string, language?: string): unknown;
    getKerningValue(tables: unknown, left: number, right: number): number;
  }
  export interface Font {
    unitsPerEm: number;
    ascender: number;
    descender: number;
    names: Record<string, unknown>;
    tables: { os2?: { sCapHeight?: number; sxHeight?: number } };
    position?: Position;
    charToGlyph(char: string): Glyph;
    getKerningValue(left: Glyph | number, right: Glyph | number): number;
  }
  export function parse(buffer: ArrayBuffer): Font;
  const opentype: { parse: typeof parse };
  export default opentype;
}
