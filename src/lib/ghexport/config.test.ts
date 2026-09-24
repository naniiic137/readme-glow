import { describe, expect, it } from 'vitest';
import { configFromSettings, formatConfig, readConfig, settingsFromConfig, stripConfig, writeConfig } from './config';
import { DEFAULT_SETTINGS } from '../settings';

describe('README config comment', () => {
  it('reads theme, layout, accent and mode from the top of the file', () => {
    expect(readConfig('<!-- readmeglow theme="aurora" layout="landing" accent="#7c5cff" -->\n# Hi')).toEqual({ theme: 'aurora', layout: 'landing', accent: '#7c5cff' });
    expect(readConfig('\n\n  <!--readmeglow mode="dark" theme="midnight"-->\n# Hi')).toEqual({ theme: 'midnight', mode: 'dark' });
    expect(readConfig(`${String.fromCharCode(0xfeff)}<!-- readmeglow theme="zen" -->`)).toEqual({ theme: 'zen' });
  });

  it('accepts short accents and ignores unknown or invalid values', () => {
    expect(readConfig('<!-- readmeglow theme="nope" layout="slides" accent="#abc" size="9" -->')).toEqual({ layout: 'slides', accent: '#aabbcc' });
    expect(readConfig('<!-- readmeglow accent="red" -->')).toBeNull();
  });

  it('only looks at the very top (not inside the text or code)', () => {
    expect(readConfig('# Title\n\n<!-- readmeglow theme="aurora" -->')).toBeNull();
    expect(readConfig('```\n<!-- readmeglow theme="aurora" -->\n```')).toBeNull();
    expect(readConfig('<!-- other comment -->\n<!-- readmeglow theme="aurora" -->')).toBeNull();
  });

  it('never mistakes the GitHub export markers for the config', () => {
    const exported = '<!-- readmeglow:begin hero\n# Title\n\nTagline\n-->\n<h1 align="center">x</h1>\n<!-- readmeglow:end hero -->\n';
    expect(readConfig(exported)).toBeNull();
    expect(stripConfig(exported)).toBe(exported);
    expect(writeConfig(exported, { theme: 'zen' })).toBe(`<!-- readmeglow theme="zen" -->\n${exported}`);
    expect(readConfig('<!-- readmeglow theme="zen"\nlayout="docs" -->')).toBeNull();
  });

  it('writes once, replacing an existing comment', () => {
    const once = writeConfig('# Hi\n', { theme: 'aurora', layout: 'landing', accent: '#7c5cff' });
    expect(once).toBe('<!-- readmeglow theme="aurora" layout="landing" accent="#7c5cff" -->\n# Hi\n');
    const again = writeConfig(once, { theme: 'pixel', layout: 'document' });
    expect(again).toBe('<!-- readmeglow theme="pixel" layout="document" -->\n# Hi\n');
    expect(stripConfig(again)).toBe('# Hi\n');
    expect(stripConfig('# No config\n')).toBe('# No config\n');
  });

  it('formats from settings (default mode left out)', () => {
    expect(formatConfig(configFromSettings({ ...DEFAULT_SETTINGS, theme: 'terminal', layout: 'docs', accent: null }))).toBe('<!-- readmeglow theme="terminal" layout="docs" -->');
    expect(formatConfig(configFromSettings({ ...DEFAULT_SETTINGS, mode: 'light' }))).toContain('mode="light"');
  });

  it('applies the config under URL parameters', () => {
    const current = { ...DEFAULT_SETTINGS, theme: 'github' as const, accent: '#123456' };
    const config = { theme: 'aurora' as const, layout: 'landing' as const };
    // A theme without an accent resets to the theme's own accent.
    expect(settingsFromConfig(config, current)).toEqual({ theme: 'aurora', layout: 'landing', accent: null });
    // Values given in the URL win.
    expect(settingsFromConfig(config, current, new Set(['theme', 'accent']))).toEqual({ layout: 'landing' });
    expect(settingsFromConfig(null, current)).toEqual({});
    // Nothing to change → empty patch.
    expect(settingsFromConfig({ theme: 'github' }, { ...current, accent: null })).toEqual({});
  });
});
