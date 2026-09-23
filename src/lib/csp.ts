/**
 * The Content-Security-Policy shipped in the built index.html (see vite.config.ts).
 *
 * - Scripts: only our own bundle. No inline scripts, no eval.
 * - Styles: our CSS plus inline styles, which KaTeX (inline `style` attributes)
 *   and Mermaid (`<style>` inside the generated SVG) need. User-supplied
 *   `style` attributes and `<style>` tags are removed by the sanitiser, so this
 *   does not let a README restyle the page.
 * - Images: any https image (READMEs embed badges and screenshots from
 *   everywhere), data: URIs and blob: object URLs for local files.
 * - Network: the GitHub API and raw.githubusercontent.com for "Load from GitHub",
 *   plus the optional, off-by-default AI providers (only called when the user
 *   clicks "Summarise with AI" with their own key).
 */
export const AI_HOSTS = [
  'https://generativelanguage.googleapis.com',
  'https://api.openai.com',
  'https://openrouter.ai',
  'https://api.groq.com',
  'https://api.mistral.ai',
  'https://api.deepseek.com',
  'https://api.together.xyz',
  'http://localhost:11434',
  'http://127.0.0.1:11434',
] as const;

export const GITHUB_HOSTS = ['https://api.github.com', 'https://raw.githubusercontent.com'] as const;

export function contentSecurityPolicy(): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'https:', 'data:', 'blob:'],
    'media-src': ["'self'", 'https:', 'blob:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", ...GITHUB_HOSTS, ...AI_HOSTS, 'blob:', 'data:'],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'frame-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'none'"],
    'manifest-src': ["'self'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}

/** True when `url` may be called from the page under the CSP above. */
export function isAllowedAiEndpoint(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return AI_HOSTS.some((host) => parsed.origin === host);
}
