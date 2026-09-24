import { describe, expect, it } from 'vitest';
import { applyChanges, type Command, type Sel } from './types';
import {
  COMMAND_SHORTCUTS,
  continueList,
  indentList,
  insertAlert,
  insertBlock,
  insertCodeBlock,
  insertDetails,
  insertFootnote,
  insertHorizontalRule,
  insertImage,
  insertInline,
  insertLink,
  setHeading,
  shortcutLabel,
  toggleBold,
  toggleBulletList,
  toggleInlineCode,
  toggleItalic,
  toggleNumberedList,
  toggleQuote,
  toggleStrike,
  toggleTaskList,
} from './commands';

/**
 * Notation: the selection is written inline as ⟨…⟩ (⟨⟩ = cursor).
 * run() applies a command and returns the new document in the same notation.
 */
function parse(spec: string): { doc: string; sel: Sel } {
  const from = spec.indexOf('⟨');
  const to = spec.indexOf('⟩') - 1;
  if (from < 0 || to < from) throw new Error(`bad spec: ${spec}`);
  return { doc: spec.replace('⟨', '').replace('⟩', ''), sel: { from, to } };
}

function show(doc: string, anchor: number, head: number): string {
  const from = Math.min(anchor, head);
  const to = Math.max(anchor, head);
  return `${doc.slice(0, from)}⟨${doc.slice(from, to)}⟩${doc.slice(to)}`;
}

function run(cmd: Command, spec: string): string | null {
  const { doc, sel } = parse(spec);
  const res = cmd(doc, sel);
  if (!res) return null;
  for (let i = 1; i < res.changes.length; i++) {
    expect(res.changes[i]!.from, 'changes sorted and not overlapping').toBeGreaterThanOrEqual(res.changes[i - 1]!.to);
  }
  for (const c of res.changes) {
    expect(c.from).toBeGreaterThanOrEqual(0);
    expect(c.to).toBeLessThanOrEqual(doc.length);
  }
  const out = applyChanges(doc, res.changes);
  const { anchor, head } = res.selection;
  expect(Math.min(anchor, head)).toBeGreaterThanOrEqual(0);
  expect(Math.max(anchor, head)).toBeLessThanOrEqual(out.length);
  return show(out, anchor, head);
}

describe('toggleBold', () => {
  it('wraps the selection', () => expect(run(toggleBold, 'a ⟨word⟩ b')).toBe('a **⟨word⟩** b'));
  it('unwraps markers right outside the selection', () => expect(run(toggleBold, 'a **⟨word⟩** b')).toBe('a ⟨word⟩ b'));
  it('unwraps markers inside the selection', () => expect(run(toggleBold, 'a ⟨**word**⟩ b')).toBe('a ⟨word⟩ b'));
  it('recognises __bold__ when unwrapping', () => expect(run(toggleBold, '__⟨word⟩__')).toBe('⟨word⟩'));
  it('wraps the word under an empty cursor and selects it', () => expect(run(toggleBold, 'hel⟨⟩lo world')).toBe('**⟨hello⟩** world'));
  it('unwraps the word under the cursor', () => expect(run(toggleBold, 'x **hel⟨⟩lo** y')).toBe('x ⟨hello⟩ y'));
  it('inserts **** with the cursor inside when not on a word', () => expect(run(toggleBold, 'a ⟨⟩ b')).toBe('a **⟨⟩** b'));
  it('removes an empty pair around the cursor', () => expect(run(toggleBold, 'a **⟨⟩** b')).toBe('a ⟨⟩ b'));
  it('works on an empty document', () => expect(run(toggleBold, '⟨⟩')).toBe('**⟨⟩**'));
  it('keeps surrounding spaces outside the markers', () => expect(run(toggleBold, 'a⟨ word ⟩b')).toBe('a⟨ **word** ⟩b'));
  it('removes bold from bold italic, leaving italic', () => expect(run(toggleBold, '⟨***x***⟩')).toBe('⟨*x*⟩'));
  it('wraps each line of a multi-line selection, skipping list markers', () => {
    expect(run(toggleBold, '- ⟨one\n- two⟩')).toBe('- **⟨one**\n- **two⟩**');
  });
  it('toggles a multi-line selection back off', () => {
    expect(run(toggleBold, '- **⟨one**\n- **two⟩**')).toBe('- ⟨one\n- two⟩');
  });
  it('skips blank lines in a multi-line selection', () => {
    expect(run(toggleBold, '⟨a\n\nb⟩')).toBe('**⟨a**\n\n**b⟩**');
  });
  it('treats emoji as word boundaries', () => expect(run(toggleBold, '🎉pa⟨⟩rty')).toBe('🎉**⟨party⟩**'));
  it('handles letters outside the BMP as one word', () => expect(run(toggleBold, 'x 𝒳𝒴⟨⟩')).toBe('x **⟨𝒳𝒴⟩**'));
  it('never splits a surrogate pair', () => {
    const doc = '😀x';
    const res = toggleBold(doc, { from: 1, to: 3 })!;
    expect(applyChanges(doc, res.changes)).toBe('**😀x**');
  });
  it('keeps apostrophes inside words', () => expect(run(toggleBold, "don⟨⟩'t stop")).toBe("**⟨don't⟩** stop"));
});

describe('toggleItalic', () => {
  it('wraps with underscores', () => expect(run(toggleItalic, 'a ⟨b⟩ c')).toBe('a _⟨b⟩_ c'));
  it('uses asterisks inside a word', () => expect(run(toggleItalic, 'un⟨believ⟩able')).toBe('un*⟨believ⟩*able'));
  it('unwraps *x* and _x_', () => {
    expect(run(toggleItalic, '*⟨x⟩*')).toBe('⟨x⟩');
    expect(run(toggleItalic, '⟨_x_⟩')).toBe('⟨x⟩');
  });
  it('does not mistake bold for italic', () => expect(run(toggleItalic, '**⟨b⟩**')).toBe('**_⟨b⟩_**'));
  it('removes italic from bold italic, leaving bold', () => expect(run(toggleItalic, '***⟨x⟩***')).toBe('**⟨x⟩**'));
  it('inserts an empty pair on an empty document', () => expect(run(toggleItalic, '⟨⟩')).toBe('_⟨⟩_'));
});

describe('toggleStrike', () => {
  it('wraps', () => expect(run(toggleStrike, 'a ⟨b⟩ c')).toBe('a ~~⟨b⟩~~ c'));
  it('unwraps ~~ and single ~', () => {
    expect(run(toggleStrike, '~~⟨b⟩~~')).toBe('⟨b⟩');
    expect(run(toggleStrike, '⟨~b~⟩')).toBe('⟨b⟩');
  });
  it('wraps the word under the cursor at the end of the document', () => expect(run(toggleStrike, 'old⟨⟩')).toBe('~~⟨old⟩~~'));
});

describe('toggleInlineCode', () => {
  it('wraps', () => expect(run(toggleInlineCode, 'a ⟨b⟩ c')).toBe('a `⟨b⟩` c'));
  it('unwraps backticks outside or inside the selection', () => {
    expect(run(toggleInlineCode, 'a `⟨b⟩` c')).toBe('a ⟨b⟩ c');
    expect(run(toggleInlineCode, '⟨`b`⟩')).toBe('⟨b⟩');
  });
  it('uses a double fence with padding when the text has a backtick', () => {
    expect(run(toggleInlineCode, 'use ⟨a`b⟩ here')).toBe('use `` ⟨a`b⟩ `` here');
  });
  it('unwraps padded double fences', () => {
    expect(run(toggleInlineCode, '`` ⟨a`b⟩ ``')).toBe('⟨a`b⟩');
    expect(run(toggleInlineCode, '⟨`` a`b ``⟩')).toBe('⟨a`b⟩');
  });
  it('turns a multi-line selection into a fenced block', () => {
    expect(run(toggleInlineCode, '⟨one\ntwo⟩')).toBe('```\n⟨one\ntwo⟩\n```\n\n');
  });
  it('handles an empty cursor on and off a word', () => {
    expect(run(toggleInlineCode, 'run np⟨⟩m now')).toBe('run `⟨npm⟩` now');
    expect(run(toggleInlineCode, '⟨⟩')).toBe('`⟨⟩`');
    expect(run(toggleInlineCode, '`⟨⟩`')).toBe('⟨⟩');
  });
});

describe('setHeading', () => {
  it('turns a paragraph into a heading', () => expect(run(setHeading(1), 'Title⟨⟩')).toBe('# Title⟨⟩'));
  it('toggles the same level back to a paragraph', () => expect(run(setHeading(2), '## Title⟨⟩')).toBe('Title⟨⟩'));
  it('replaces an existing level', () => expect(run(setHeading(3), '## Title⟨⟩')).toBe('### Title⟨⟩'));
  it('removes a heading with level 0', () => expect(run(setHeading(0), '#### x⟨⟩')).toBe('x⟨⟩'));
  it('applies to every touched line, skipping blank ones', () => expect(run(setHeading(2), '⟨a\n\nb⟩')).toBe('## ⟨a\n\n## b⟩'));
  it('moves a cursor at the line start after the new marker', () => expect(run(setHeading(1), '⟨⟩Title')).toBe('# ⟨⟩Title'));
  it('works on an empty document', () => expect(run(setHeading(1), '⟨⟩')).toBe('# ⟨⟩'));
  it('replaces a list marker instead of nesting it', () => expect(run(setHeading(2), '- item⟨⟩')).toBe('## item⟨⟩'));
  it('ignores a selection that ends at the start of the next line', () => {
    expect(run(setHeading(1), '⟨a\n⟩b')).toBe('# ⟨a\n⟩b');
  });
});

describe('toggleQuote', () => {
  it('quotes every touched line', () => expect(run(toggleQuote, '⟨a\nb⟩')).toBe('> ⟨a\n> b⟩'));
  it('unquotes when every line is quoted', () => expect(run(toggleQuote, '> ⟨a\n> b⟩')).toBe('⟨a\nb⟩'));
  it('keeps the quote together across blank lines', () => expect(run(toggleQuote, '⟨a\n\nb⟩')).toBe('> ⟨a\n>\n> b⟩'));
  it('works on an empty document', () => expect(run(toggleQuote, '⟨⟩')).toBe('> ⟨⟩'));
  it('only quotes lines that are not quoted yet', () => expect(run(toggleQuote, '⟨> a\nb⟩')).toBe('⟨> a\n> b⟩'));
});

describe('toggleBulletList', () => {
  it('adds a bullet', () => expect(run(toggleBulletList, 'a⟨⟩')).toBe('- a⟨⟩'));
  it('removes bullets when all lines have one', () => expect(run(toggleBulletList, '- a⟨⟩')).toBe('a⟨⟩'));
  it('converts numbered items', () => expect(run(toggleBulletList, '⟨1. a\n2. b⟩')).toBe('- ⟨a\n- b⟩'));
  it('converts task items', () => expect(run(toggleBulletList, '- [x] done⟨⟩')).toBe('- done⟨⟩'));
  it('keeps indentation', () => expect(run(toggleBulletList, '  a⟨⟩')).toBe('  - a⟨⟩'));
  it('skips blank lines and handles an empty line', () => {
    expect(run(toggleBulletList, '⟨a\n\nb⟩')).toBe('- ⟨a\n\n- b⟩');
    expect(run(toggleBulletList, '⟨⟩')).toBe('- ⟨⟩');
  });
});

describe('toggleNumberedList', () => {
  it('numbers lines', () => expect(run(toggleNumberedList, '⟨a\nb\nc⟩')).toBe('1. ⟨a\n2. b\n3. c⟩'));
  it('removes numbers when all lines are numbered', () => expect(run(toggleNumberedList, '⟨1. a\n2. b⟩')).toBe('⟨a\nb⟩'));
  it('renumbers mixed items from 1', () => expect(run(toggleNumberedList, '⟨3. a\n- b⟩')).toBe('1. ⟨a\n2. b⟩'));
  it('continues the list above', () => expect(run(toggleNumberedList, '1. a\n2. b\n⟨c⟩')).toBe('1. a\n2. b\n3. ⟨c⟩'));
  it('numbers each indentation level separately', () => {
    expect(run(toggleNumberedList, '⟨a\n  b\n  c\nd⟩')).toBe('1. ⟨a\n  1. b\n  2. c\n2. d⟩');
  });
});

describe('toggleTaskList', () => {
  it('adds a task box', () => expect(run(toggleTaskList, 'a⟨⟩')).toBe('- [ ] a⟨⟩'));
  it('keeps the bullet character when converting bullets', () => expect(run(toggleTaskList, '* a⟨⟩')).toBe('* [ ] a⟨⟩'));
  it('removes tasks when all lines are tasks', () => expect(run(toggleTaskList, '- [ ] a⟨⟩')).toBe('a⟨⟩'));
  it('converts only the lines that are not tasks yet', () => {
    expect(run(toggleTaskList, '⟨- [x] a\n- b⟩')).toBe('⟨- [x] a\n- [ ] b⟩');
  });
  it('converts numbered items', () => expect(run(toggleTaskList, '1. a⟨⟩')).toBe('- [ ] a⟨⟩'));
});

describe('insertLink', () => {
  it('inserts a placeholder link with the text selected', () => expect(run(insertLink(), 'See ⟨⟩')).toBe('See [⟨link text⟩](https://)'));
  it('wraps the selection and selects the URL placeholder', () => expect(run(insertLink(), 'See ⟨docs⟩')).toBe('See [docs](⟨https://⟩)'));
  it('uses a given URL and puts the cursor after the link', () => {
    expect(run(insertLink('https://x.y'), 'See ⟨docs⟩ now')).toBe('See [docs](https://x.y)⟨⟩ now');
  });
  it('turns a selected URL into a link with the cursor in the text', () => {
    expect(run(insertLink(), '⟨https://x.y⟩')).toBe('[⟨⟩](https://x.y)');
  });
  it('removes the link when the selection is a link', () => expect(run(insertLink(), '⟨[docs](https://x.y)⟩')).toBe('⟨docs⟩'));
  it('wraps URLs with spaces in <>', () => {
    expect(run(insertLink('my file.md'), '⟨docs⟩')).toBe('[docs](<my file.md>)⟨⟩');
  });
});

describe('insertImage', () => {
  it('selects the URL placeholder when no URL is given', () => {
    expect(run(insertImage(), '⟨⟩')).toBe('![Describe this image](⟨https://⟩)');
  });
  it('puts the image on its own paragraph when the line has text', () => {
    expect(run(insertImage('a.png'), 'Text ⟨⟩more')).toBe('Text\n\n![⟨Describe this image⟩](a.png)\n\nmore');
  });
  it('uses the given alt text and places the cursor after the image', () => {
    expect(run(insertImage('a.png', 'Logo'), '⟨⟩')).toBe('![Logo](a.png)⟨⟩');
  });
  it('uses the selection as alt text, or as the URL when it is one', () => {
    expect(run(insertImage('a.png'), 'x\n\n⟨A cat⟩\n')).toBe('x\n\n![A cat](a.png)⟨⟩\n');
    expect(run(insertImage(), '⟨https://x.y/a.png⟩')).toBe('![⟨Describe this image⟩](https://x.y/a.png)');
  });
});

describe('insertCodeBlock', () => {
  it('inserts an empty block with the cursor inside', () => expect(run(insertCodeBlock(), 'a⟨⟩')).toBe('a\n\n```\n⟨⟩\n```\n\n'));
  it('adds the language', () => expect(run(insertCodeBlock('js'), '⟨⟩')).toBe('```js\n⟨⟩\n```\n\n'));
  it('wraps the touched lines as their own block', () => {
    expect(run(insertCodeBlock(), 'x\n⟨one\ntwo⟩\ny')).toBe('x\n\n```\n⟨one\ntwo⟩\n```\n\ny');
  });
  it('uses whole lines for a partial selection', () => {
    expect(run(insertCodeBlock(), 'ab⟨cd\nef⟩gh')).toBe('```\n⟨abcd\nefgh⟩\n```\n\n');
  });
  it('uses a longer fence when the content has ```', () => {
    expect(run(insertCodeBlock(), '⟨a\n```\nb⟩')).toBe('````\n⟨a\n```\nb⟩\n````\n\n');
  });
  it('keeps list indentation for the fences', () => {
    expect(run(insertCodeBlock(), '- item\n\n  ⟨code⟩')).toBe('- item\n\n  ```\n⟨  code⟩\n  ```\n\n');
  });
});

describe('insertHorizontalRule', () => {
  it('adds a rule after a paragraph', () => expect(run(insertHorizontalRule, 'a⟨⟩')).toBe('a\n\n---\n\n⟨⟩'));
  it('splits the line at the cursor', () => expect(run(insertHorizontalRule, 'ab ⟨⟩cd')).toBe('ab\n\n---\n\n⟨⟩cd'));
  it('collapses extra blank lines to exactly one on each side', () => {
    expect(run(insertHorizontalRule, 'a\n\n\n⟨⟩\n\n\nb')).toBe('a\n\n---\n\n⟨⟩b');
  });
  it('works on an empty document', () => expect(run(insertHorizontalRule, '⟨⟩')).toBe('---\n\n⟨⟩'));
});

describe('insertAlert', () => {
  it('inserts a placeholder and selects it', () => {
    expect(run(insertAlert('NOTE'), '⟨⟩')).toBe('> [!NOTE]\n> ⟨Useful information that readers should know, even when skimming.⟩\n\n');
  });
  it('quotes the selected lines', () => {
    expect(run(insertAlert('WARNING'), 'x\n\n⟨Be careful\n\nwith this⟩')).toBe('x\n\n> [!WARNING]\n> Be careful\n>\n> with this\n\n⟨⟩');
  });
  it('splits a paragraph around a selection', () => {
    expect(run(insertAlert('TIP'), 'a ⟨b⟩ c')).toBe('a\n\n> [!TIP]\n> b\n\n⟨⟩c');
  });
});

describe('insertDetails', () => {
  it('inserts placeholder content and selects it', () => {
    expect(run(insertDetails(), '⟨⟩')).toBe('<details>\n<summary>Click to expand</summary>\n\n⟨Hidden content goes here.⟩\n\n</details>\n\n');
  });
  it('wraps the selection and selects the default summary', () => {
    expect(run(insertDetails(), '⟨text⟩')).toBe('<details>\n<summary>⟨Click to expand⟩</summary>\n\ntext\n\n</details>\n\n');
  });
  it('uses the given summary and puts the cursor after the block', () => {
    expect(run(insertDetails('More'), 'a\n\n⟨text⟩\n\nb')).toBe('a\n\n<details>\n<summary>More</summary>\n\ntext\n\n</details>\n\n⟨⟩b');
  });
});

describe('insertFootnote', () => {
  it('adds a reference and a definition at the end', () => {
    expect(run(insertFootnote(), 'Claim⟨⟩ here.')).toBe('Claim[^1] here.\n\n[^1]: ⟨⟩');
  });
  it('uses the next free number and joins existing definitions', () => {
    expect(run(insertFootnote(), 'A[^1] B[^3]⟨⟩\n\n[^1]: x\n[^3]: y\n')).toBe('A[^1] B[^3][^4]\n\n[^1]: x\n[^3]: y\n[^4]: ⟨⟩\n');
  });
  it('works at the end of the document and in an empty one', () => {
    expect(run(insertFootnote(), 'Claim⟨⟩')).toBe('Claim[^1]\n\n[^1]: ⟨⟩');
    expect(run(insertFootnote(), '⟨⟩')).toBe('[^1]\n\n[^1]: ⟨⟩');
  });
  it('keeps the selected text and adds the reference after it', () => {
    expect(run(insertFootnote(), 'A ⟨claim⟩.\n')).toBe('A claim[^1].\n\n[^1]: ⟨⟩\n');
  });
});

describe('insertBlock', () => {
  const table = '| a | b |\n|---|---|\n| 1 | 2 |';
  it('splits the line and leaves one blank line on each side', () => {
    expect(run(insertBlock(table), 'ab⟨⟩cd')).toBe(`ab\n\n${table}\n\n⟨⟩cd`);
  });
  it('inserts at the start of the document without a leading blank line', () => {
    expect(run(insertBlock(table), '⟨⟩text')).toBe(`${table}\n\n⟨⟩text`);
  });
  it('keeps the indentation of the following line', () => {
    expect(run(insertBlock('X'), 'a⟨⟩\n\n    code')).toBe('a\n\nX\n\n⟨⟩    code');
  });
  it('replaces the selection and trims newlines around the block', () => {
    expect(run(insertBlock('\n\nX\n\n'), 'a ⟨sel⟩ b')).toBe('a\n\nX\n\n⟨⟩b');
  });
  it('returns null for an empty block', () => {
    expect(insertBlock('  \n')('abc', { from: 1, to: 1 })).toBeNull();
  });
});

describe('insertInline', () => {
  it('inserts at the cursor', () => expect(run(insertInline('🎉'), 'a⟨⟩b')).toBe('a🎉⟨⟩b'));
  it('replaces the selection', () => expect(run(insertInline(':)'), 'a⟨xx⟩b')).toBe('a:)⟨⟩b'));
  it('inserts badge Markdown in an empty document', () => {
    const badge = '![CI](https://img.shields.io/badge/ci-passing-green)';
    expect(run(insertInline(badge), '⟨⟩')).toBe(`${badge}⟨⟩`);
  });
});

describe('indentList', () => {
  it('returns null outside lists', () => {
    expect(run(indentList(1), 'text⟨⟩')).toBeNull();
    expect(run(indentList(-1), '⟨⟩')).toBeNull();
  });
  it('nests a bullet under the previous item', () => expect(run(indentList(1), '- a\n- b⟨⟩')).toBe('- a\n  - b⟨⟩'));
  it('nests a numbered item by the parent marker width and restarts at 1', () => {
    expect(run(indentList(1), '1. a\n2. b⟨⟩')).toBe('1. a\n   1. b⟨⟩');
  });
  it('ignores the task box when measuring the parent marker', () => {
    expect(run(indentList(1), '- [ ] a\n- [ ] b⟨⟩')).toBe('- [ ] a\n  - [ ] b⟨⟩');
  });
  it('indents every selected item', () => expect(run(indentList(1), '- a\n⟨- b\n- c⟩')).toBe('- a\n  ⟨- b\n  - c⟩'));
  it('outdents to the parent level', () => expect(run(indentList(-1), '- a\n  - b⟨⟩')).toBe('- a\n- b⟨⟩'));
  it('continues the parent numbering when outdenting', () => {
    expect(run(indentList(-1), '1. a\n   1. b⟨⟩')).toBe('1. a\n2. b⟨⟩');
  });
  it('does nothing (but handles the key) at the top level', () => expect(run(indentList(-1), '- a⟨⟩')).toBe('- a⟨⟩'));
});

describe('continueList', () => {
  it('continues a bullet list', () => expect(run(continueList(), '- a⟨⟩')).toBe('- a\n- ⟨⟩'));
  it('continues a numbered list with the next number', () => expect(run(continueList(), '1. a⟨⟩')).toBe('1. a\n2. ⟨⟩'));
  it('adds an unchecked task after a task', () => expect(run(continueList(), '- [x] a⟨⟩')).toBe('- [x] a\n- [ ] ⟨⟩'));
  it('moves the text after the cursor into the new item', () => expect(run(continueList(), '- ab ⟨⟩cd')).toBe('- ab \n- ⟨⟩cd'));
  it('ends the list on an empty item', () => expect(run(continueList(), '- a\n- ⟨⟩')).toBe('- a\n⟨⟩'));
  it('renumbers the items below', () => expect(run(continueList(), '1. a⟨⟩\n2. b\n3. c')).toBe('1. a\n2. ⟨⟩\n3. b\n4. c'));
  it('keeps lazy 1. 1. 1. numbering', () => expect(run(continueList(), '1. a⟨⟩\n1. b')).toBe('1. a\n1. ⟨⟩\n1. b'));
  it('returns null outside a list or with the cursor in the marker', () => {
    expect(run(continueList(), 'text⟨⟩')).toBeNull();
    expect(run(continueList(), '⟨⟩- a')).toBeNull();
    expect(run(continueList(), '⟨⟩')).toBeNull();
  });
  it('keeps indentation and blockquote prefixes', () => {
    expect(run(continueList(), '  - a⟨⟩')).toBe('  - a\n  - ⟨⟩');
    expect(run(continueList(), '> 1) a⟨⟩')).toBe('> 1) a\n> 2) ⟨⟩');
  });
});

describe('shortcuts', () => {
  it('labels the main commands', () => {
    expect(COMMAND_SHORTCUTS).toMatchObject({
      bold: 'Mod-B',
      italic: 'Mod-I',
      strike: 'Mod-Shift-X',
      code: 'Mod-E',
      link: 'Mod-Shift-L',
      h1: 'Mod-Alt-1',
      quote: 'Mod-Shift-.',
      bullet: 'Mod-Shift-8',
      numbered: 'Mod-Shift-7',
      task: 'Mod-Shift-9',
      codeBlock: 'Mod-Alt-C',
    });
  });
  it('formats labels for macOS and other platforms', () => {
    expect(shortcutLabel('Mod-Shift-X', true)).toBe('⇧⌘X');
    expect(shortcutLabel('Mod-Shift-X', false)).toBe('Ctrl+Shift+X');
    expect(shortcutLabel('Mod-Alt-1', false)).toBe('Ctrl+Alt+1');
    expect(shortcutLabel('Mod-Shift-.', true)).toBe('⇧⌘.');
  });
});

describe('all commands', () => {
  const commands: Array<[string, Command]> = [
    ['bold', toggleBold],
    ['italic', toggleItalic],
    ['strike', toggleStrike],
    ['code', toggleInlineCode],
    ['h2', setHeading(2)],
    ['quote', toggleQuote],
    ['bullet', toggleBulletList],
    ['numbered', toggleNumberedList],
    ['task', toggleTaskList],
    ['link', insertLink()],
    ['image', insertImage()],
    ['codeBlock', insertCodeBlock()],
    ['hr', insertHorizontalRule],
    ['alert', insertAlert('NOTE')],
    ['details', insertDetails()],
    ['footnote', insertFootnote()],
    ['block', insertBlock('X')],
    ['inline', insertInline('x')],
    ['indent', indentList(1)],
    ['enter', continueList()],
  ];
  const docs: Array<[string, Sel]> = [
    ['', { from: 0, to: 0 }],
    ['\n\n\n', { from: 1, to: 2 }],
    ['- a\n- b', { from: 7, to: 7 }],
    ['😀 end', { from: 0, to: 6 }],
  ];
  it.each(commands)('%s produces valid changes at document edges', (_name, cmd) => {
    for (const [doc, sel] of docs) {
      const res = cmd(doc, sel);
      if (!res) continue;
      const out = applyChanges(doc, res.changes);
      expect(res.selection.anchor).toBeLessThanOrEqual(out.length);
      expect(res.selection.head).toBeLessThanOrEqual(out.length);
      expect(out).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
    }
  });
});
