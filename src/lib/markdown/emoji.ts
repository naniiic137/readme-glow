import type { Root, Text } from 'mdast';
import { walk } from './parse';

let table: Map<string, string> | null = null;

/** Loads the GitHub emoji table (gemoji) once. */
export async function emojiTable(): Promise<Map<string, string>> {
  if (table) return table;
  const { gemoji } = await import('gemoji');
  const map = new Map<string, string>();
  for (const entry of gemoji) for (const name of entry.names) map.set(name, entry.emoji);
  table = map;
  return map;
}

const SHORTCODES = /:([a-z0-9_+-]+):/gi;

/** Replaces `:rocket:` style shortcodes in text nodes. Returns true when any were replaced. */
export async function replaceShortcodes(tree: Root): Promise<boolean> {
  const map = await emojiTable();
  let changed = false;
  walk(tree, (node) => {
    if (node.type !== 'text') return;
    const t = node as Text;
    if (!t.value.includes(':')) return;
    const next = t.value.replace(SHORTCODES, (whole, name: string) => {
      const emoji = map.get(name.toLowerCase());
      if (emoji) {
        changed = true;
        return emoji;
      }
      return whole;
    });
    t.value = next;
  });
  return changed;
}
