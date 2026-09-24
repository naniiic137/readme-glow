import webApp from './templates/web-app.md?raw';
import library from './templates/library.md?raw';
import cli from './templates/cli.md?raw';
import game from './templates/game.md?raw';
import profile from './templates/profile.md?raw';
import minimal from './templates/minimal.md?raw';

/** A complete README to start from ("Start from a template"). */
export interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  emoji: string;
  markdown: string;
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: 'web-app',
    name: 'Web app',
    description: 'Centred header, badges, features, tech stack, setup, configuration and roadmap.',
    emoji: '🌐',
    markdown: webApp,
  },
  {
    id: 'library',
    name: 'Library / package',
    description: 'Install commands, a usage example and an API table for an npm or PyPI package.',
    emoji: '📦',
    markdown: library,
  },
  {
    id: 'cli',
    name: 'CLI tool',
    description: 'Installation, a terminal session, commands, options and exit codes.',
    emoji: '⌨️',
    markdown: cli,
  },
  {
    id: 'game',
    name: 'Game',
    description: 'Tagline, controls table, how to play, roadmap and credits.',
    emoji: '🎮',
    markdown: game,
  },
  {
    id: 'profile',
    name: 'GitHub profile',
    description: 'A portfolio README: about me, tech stack badges, featured projects, stats and contact.',
    emoji: '👋',
    markdown: profile,
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Title, one sentence, install, usage and licence. Nothing else.',
    emoji: '✏️',
    markdown: minimal,
  },
];

export function findTemplate(id: string): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find((t) => t.id === id);
}
