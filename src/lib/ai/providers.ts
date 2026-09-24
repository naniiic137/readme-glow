/**
 * The optional, off-by-default "Summarise with AI" providers. Users bring their
 * own key; requests go straight from the browser to the provider (the page CSP
 * only allows the origins in `AI_HOSTS`, see src/lib/csp.ts).
 */
export type AiProviderId = 'gemini' | 'openai' | 'ollama';

export interface AiProviderInfo {
  id: AiProviderId;
  name: string;
  needsKey: boolean;
  defaultModel: string;
  defaultBaseUrl: string;
  keyHelpUrl?: string;
  note: string;
}

export const AI_PROVIDERS: AiProviderInfo[] = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    needsKey: true,
    defaultModel: 'gemini-2.5-flash',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    keyHelpUrl: 'https://aistudio.google.com/apikey',
    note: 'Has a free tier. Create a key in Google AI Studio; the README and your key go straight from your browser to Google.',
  },
  {
    id: 'openai',
    name: 'OpenAI-compatible',
    needsKey: true,
    defaultModel: 'gpt-4o-mini',
    defaultBaseUrl: 'https://api.openai.com/v1',
    keyHelpUrl: 'https://platform.openai.com/api-keys',
    note: 'Works with OpenAI, OpenRouter, Groq, Mistral, DeepSeek and Together: pick a preset, then paste a key from that service.',
  },
  {
    id: 'ollama',
    name: 'Ollama (local)',
    needsKey: false,
    defaultModel: 'llama3.2',
    defaultBaseUrl: 'http://localhost:11434',
    note: "Runs on your own computer, so nothing leaves it. Start Ollama with OLLAMA_ORIGINS set to this site's origin so the browser is allowed to call it.",
  },
];

export const OPENAI_COMPATIBLE_PRESETS: Array<{ name: string; baseUrl: string; model: string }> = [
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
  { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  { name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-latest' },
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: 'Together', baseUrl: 'https://api.together.xyz/v1', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
];

export interface AiConfig {
  provider: AiProviderId;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export function getProvider(id: AiProviderId | string): AiProviderInfo | undefined {
  return AI_PROVIDERS.find((p) => p.id === id);
}

/** The shell command that lets this site talk to a local Ollama, e.g. for the settings panel. */
export function ollamaOriginsCommand(origin: string): string {
  return `OLLAMA_ORIGINS="${origin}" ollama serve`;
}
