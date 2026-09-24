import nebula from './nebula.md?raw';
import quanta from './quanta.md?raw';
import pixelQuest from './pixel-quest.md?raw';
import arabic from './arabic.md?raw';
import showcase from './showcase.md?raw';

/**
 * Built-in sample READMEs: the instant demo. Relative image paths in a sample
 * resolve against `${import.meta.env.BASE_URL}${sample.assetBase}`, and the
 * images live in public/samples/<id>/.
 */
export interface Sample {
  id: string;
  title: string;
  description: string;
  emoji: string;
  markdown: string;
  /** 'samples/<id>/', relative to BASE_URL. */
  assetBase: string;
  recommended: { theme: string; layout: 'document' | 'docs' | 'landing' | 'slides' | 'magazine' };
}

export const SAMPLES: Sample[] = [
  {
    id: 'nebula',
    title: 'Nebula Board',
    description: 'A real-time collaborative whiteboard: badges, alerts, diagrams, tables and more.',
    emoji: '🌌',
    markdown: nebula,
    assetBase: 'samples/nebula/',
    recommended: { theme: 'aurora', layout: 'landing' },
  },
  {
    id: 'quanta',
    title: 'Quanta',
    description: 'A Python statistics library with a Rust core: maths, API tables, benchmarks and a changelog.',
    emoji: '📈',
    markdown: quanta,
    assetBase: 'samples/quanta/',
    recommended: { theme: 'editorial', layout: 'docs' },
  },
  {
    id: 'pixel-quest',
    title: 'Pixel Quest',
    description: 'A cosy pixel-art adventure made with Godot: screenshots, controls, spoilers and an Arabic section.',
    emoji: '🕹️',
    markdown: pixelQuest,
    assetBase: 'samples/pixel-quest/',
    recommended: { theme: 'pixel', layout: 'document' },
  },
  {
    id: 'arabic',
    title: 'مِداد (Arabic)',
    description: 'A fully Arabic README that shows right-to-left rendering.',
    emoji: '🖋️',
    markdown: arabic,
    assetBase: 'samples/arabic/',
    recommended: { theme: 'zen', layout: 'document' },
  },
];

/** A short, pretty README for the theme previews on the landing page. */
export const SHOWCASE: Sample = {
  id: 'showcase',
  title: 'Lumen UI',
  description: 'A short README used to preview every theme.',
  emoji: '✨',
  markdown: showcase,
  assetBase: 'samples/showcase/',
  recommended: { theme: 'github', layout: 'document' },
};

export function getSample(id: string): Sample | undefined {
  return SAMPLES.find((s) => s.id === id) ?? (id === SHOWCASE.id ? SHOWCASE : undefined);
}
