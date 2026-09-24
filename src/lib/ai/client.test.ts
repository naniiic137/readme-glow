import { describe, expect, it } from 'vitest';
import { isAllowedAiEndpoint } from '../csp';
import { AI_PROVIDERS, OPENAI_COMPATIBLE_PRESETS, ollamaOriginsCommand, type AiConfig } from './providers';
import {
  AiError,
  AiResultSchema,
  MAX_README_CHARS,
  buildPrompt,
  describeRequest,
  normaliseAiOutput,
  parseJsonLoose,
  summariseWithAi,
  type AiErrorKind,
} from './client';

const README = '# Taskly\n\nTaskly is a fast task manager.\n';
const VALID = {
  summary: 'Taskly is a task manager for small teams. It syncs in real time. It also works offline.',
  keyPoints: ['Instant search', 'Offline mode'],
  tagline: 'Tasks, tidied.',
  improvements: ['Add screenshots'],
};
const KEY = 'sk-test-SECRET-123';

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return { fn, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const geminiReply = (text: string) => json({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] });
const openAiReply = (content: string) => json({ choices: [{ message: { role: 'assistant', content } }] });
const ollamaReply = (content: string) => json({ message: { role: 'assistant', content }, done: true });

const gemini: AiConfig = { provider: 'gemini', apiKey: KEY };
const bodyOf = (call: Call) => JSON.parse(String(call.init.body)) as Record<string, unknown>;
const headersOf = (call: Call) => call.init.headers as Record<string, string>;

async function failure(p: Promise<unknown>): Promise<AiError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(AiError);
    return e as AiError;
  }
  throw new Error('expected the call to fail');
}

async function expectKind(p: Promise<unknown>, kind: AiErrorKind): Promise<AiError> {
  const e = await failure(p);
  expect(e.kind).toBe(kind);
  expect(e.message).not.toContain(KEY);
  return e;
}

describe('providers', () => {
  it('lists Gemini, OpenAI-compatible and Ollama with the documented defaults', () => {
    expect(AI_PROVIDERS.map((p) => [p.id, p.needsKey, p.defaultModel, p.defaultBaseUrl])).toEqual([
      ['gemini', true, 'gemini-2.5-flash', 'https://generativelanguage.googleapis.com/v1beta'],
      ['openai', true, 'gpt-4o-mini', 'https://api.openai.com/v1'],
      ['ollama', false, 'llama3.2', 'http://localhost:11434'],
    ]);
    expect(AI_PROVIDERS[0]!.keyHelpUrl).toBe('https://aistudio.google.com/apikey');
    expect(AI_PROVIDERS[2]!.note).toContain('OLLAMA_ORIGINS');
    expect(ollamaOriginsCommand('https://naniiic137.github.io')).toBe('OLLAMA_ORIGINS="https://naniiic137.github.io" ollama serve');
  });

  it('only uses endpoints the page CSP allows', () => {
    for (const p of AI_PROVIDERS) expect(isAllowedAiEndpoint(p.defaultBaseUrl), p.id).toBe(true);
    expect(OPENAI_COMPATIBLE_PRESETS.map((p) => p.name)).toEqual(['OpenAI', 'OpenRouter', 'Groq', 'Mistral', 'DeepSeek', 'Together']);
    for (const p of OPENAI_COMPATIBLE_PRESETS) expect(isAllowedAiEndpoint(`${p.baseUrl}/chat/completions`), p.name).toBe(true);
  });
});

describe('buildPrompt', () => {
  it('asks for JSON only with the four fields, in plain text, and includes the README', () => {
    const prompt = buildPrompt(README);
    for (const part of ['ONLY a JSON object', '"summary"', '"keyPoints"', '"tagline"', '"improvements"', '3 to 5 sentences', 'no Markdown', 'British English', README]) {
      expect(prompt).toContain(part);
    }
    expect(prompt).not.toContain('truncated');
    expect(prompt).not.toContain('24 000');
  });

  it('truncates long READMEs to 24 000 characters with a note', () => {
    const long = `# Big\n\n${'x'.repeat(30_000)}THE-END`;
    const prompt = buildPrompt(long);
    expect(prompt).toContain('only its first 24 000 characters');
    expect(prompt).not.toContain('THE-END');
    expect(prompt).toContain(long.slice(0, MAX_README_CHARS));
  });
});

describe('summariseWithAi: requests', () => {
  it('calls Gemini generateContent with the key header and JSON output', async () => {
    const f = fakeFetch(() => geminiReply(JSON.stringify(VALID)));
    await expect(summariseWithAi(README, gemini, { fetchImpl: f.fn })).resolves.toEqual(VALID);
    const call = f.calls[0]!;
    expect(call.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    expect(call.init.method).toBe('POST');
    expect(headersOf(call)['x-goog-api-key']).toBe(KEY);
    expect(headersOf(call).Authorization).toBeUndefined();
    const body = bodyOf(call);
    expect(body.generationConfig).toEqual({ responseMimeType: 'application/json', temperature: 0.3 });
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: buildPrompt(README) }] }]);
  });

  it('calls an OpenAI-compatible preset with a bearer token and json_object output', async () => {
    const groq = OPENAI_COMPATIBLE_PRESETS.find((p) => p.name === 'Groq')!;
    const f = fakeFetch(() => openAiReply(JSON.stringify(VALID)));
    const result = await summariseWithAi(README, { provider: 'openai', apiKey: KEY, baseUrl: `${groq.baseUrl}/`, model: groq.model }, { fetchImpl: f.fn });
    expect(result).toEqual(VALID);
    const call = f.calls[0]!;
    expect(call.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(headersOf(call).Authorization).toBe(`Bearer ${KEY}`);
    const body = bodyOf(call);
    expect(body).toMatchObject({ model: 'llama-3.3-70b-versatile', temperature: 0.3, response_format: { type: 'json_object' } });
    expect((body.messages as Array<{ role: string }>).map((m) => m.role)).toEqual(['system', 'user']);
  });

  it('calls a local Ollama without a key', async () => {
    const f = fakeFetch(() => ollamaReply(JSON.stringify(VALID)));
    await expect(summariseWithAi(README, { provider: 'ollama' }, { fetchImpl: f.fn })).resolves.toEqual(VALID);
    const call = f.calls[0]!;
    expect(call.url).toBe('http://localhost:11434/api/chat');
    expect(headersOf(call).Authorization).toBeUndefined();
    expect(bodyOf(call)).toMatchObject({ model: 'llama3.2', format: 'json', stream: false });
  });

  it('allows an OpenAI-compatible server on this computer without a key', async () => {
    const f = fakeFetch(() => openAiReply(JSON.stringify(VALID)));
    await summariseWithAi(README, { provider: 'openai', baseUrl: 'http://127.0.0.1:11434/v1', model: 'llama3.2' }, { fetchImpl: f.fn });
    expect(f.calls[0]!.url).toBe('http://127.0.0.1:11434/v1/chat/completions');
    expect(headersOf(f.calls[0]!).Authorization).toBeUndefined();
  });
});

describe('summariseWithAi: errors', () => {
  it('needs a key for Gemini and OpenAI, without calling out', async () => {
    const f = fakeFetch(() => geminiReply('{}'));
    const e = await expectKind(summariseWithAi(README, { provider: 'gemini', apiKey: '  ' }, { fetchImpl: f.fn }), 'no-key');
    expect(e.message).toContain('Google Gemini API key');
    await expectKind(summariseWithAi(README, { provider: 'openai' }, { fetchImpl: f.fn }), 'no-key');
    expect(f.calls).toHaveLength(0);
  });

  it('refuses endpoints outside the allowed list and says which are allowed', async () => {
    const f = fakeFetch(() => openAiReply('{}'));
    const e = await expectKind(summariseWithAi(README, { provider: 'openai', apiKey: KEY, baseUrl: 'https://evil.example.com/v1' }, { fetchImpl: f.fn }), 'blocked-endpoint');
    expect(e.message).toContain('evil.example.com');
    expect(e.message).toContain('api.openai.com');
    expect(e.message).toContain('generativelanguage.googleapis.com');
    await expectKind(summariseWithAi(README, { provider: 'openai', apiKey: KEY, baseUrl: 'not a url' }, { fetchImpl: f.fn }), 'blocked-endpoint');
    await expectKind(summariseWithAi(README, { provider: 'nope' as never, apiKey: KEY }, { fetchImpl: f.fn }), 'blocked-endpoint');
    expect(f.calls).toHaveLength(0);
  });

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate-limit'],
    [500, 'server'],
    [503, 'server'],
    [418, 'server'],
  ] as const)('maps HTTP %i to %s', async (status, kind) => {
    const f = fakeFetch(() => json({ error: { message: `Something went wrong for ${KEY}` } }, status));
    const e = await expectKind(summariseWithAi(README, { provider: 'openai', apiKey: KEY }, { fetchImpl: f.fn }), kind);
    expect(e.status).toBe(status);
    expect(e.message).toContain(`HTTP ${status}`);
  });

  it('treats Gemini\'s "API key not valid" 400 as an auth error', async () => {
    const f = fakeFetch(() => json({ error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } }, 400));
    const e = await expectKind(summariseWithAi(README, gemini, { fetchImpl: f.fn }), 'auth');
    expect(e.message).toContain('did not accept the API key');
  });

  it('explains a missing Ollama model and an Ollama origin refusal', async () => {
    const missing = fakeFetch(() => json({ error: "model 'llama3.2' not found" }, 404));
    const e = await expectKind(summariseWithAi(README, { provider: 'ollama' }, { fetchImpl: missing.fn }), 'server');
    expect(e.message).toContain('ollama pull llama3.2');
    const forbidden = fakeFetch(() => new Response('', { status: 403 }));
    const f = await expectKind(summariseWithAi(README, { provider: 'ollama' }, { fetchImpl: forbidden.fn }), 'auth');
    expect(f.message).toContain('OLLAMA_ORIGINS');
  });

  it('reports network failures, mentioning CORS or Ollama origins', async () => {
    const down = fakeFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    const e = await expectKind(summariseWithAi(README, gemini, { fetchImpl: down.fn }), 'network');
    expect(e.message).toContain('generativelanguage.googleapis.com');
    expect(e.message).toContain('CORS');
    const local = await expectKind(summariseWithAi(README, { provider: 'ollama' }, { fetchImpl: down.fn }), 'network');
    expect(local.message).toContain('OLLAMA_ORIGINS');
  });

  it('times out when the provider never answers, even if fetch ignores the signal', async () => {
    const hang = fakeFetch(() => new Promise<Response>(() => undefined));
    const e = await expectKind(summariseWithAi(README, gemini, { fetchImpl: hang.fn, timeoutMs: 20 }), 'timeout');
    expect(e.message).toContain('did not answer');
  });

  it('times out (not "cancelled") when fetch honours the abort signal', async () => {
    const abortable = fakeFetch(
      ({ init }) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
        }),
    );
    await expectKind(summariseWithAi(README, gemini, { fetchImpl: abortable.fn, timeoutMs: 10 }), 'timeout');
  });

  it('can be cancelled by the caller, before or during the request', async () => {
    const before = new AbortController();
    before.abort();
    const f = fakeFetch(() => geminiReply(JSON.stringify(VALID)));
    await expectKind(summariseWithAi(README, gemini, { fetchImpl: f.fn, signal: before.signal }), 'cancelled');
    expect(f.calls).toHaveLength(0);

    const during = new AbortController();
    const hang = fakeFetch(() => {
      setTimeout(() => during.abort(), 5);
      return new Promise<Response>(() => undefined);
    });
    await expectKind(summariseWithAi(README, gemini, { fetchImpl: hang.fn, signal: during.signal, timeoutMs: 5_000 }), 'cancelled');
  });

  it('reports unusable answers as bad output', async () => {
    const cases: Array<() => Response> = [
      () => geminiReply('Sorry, I cannot help with that.'),
      () => geminiReply('{"summary": '),
      () => new Response('<html>Bad gateway</html>', { status: 200 }),
      () => json({ candidates: [], promptFeedback: { blockReason: 'SAFETY' } }),
      () => geminiReply(JSON.stringify({ keyPoints: ['no summary here'] })),
      () => geminiReply(JSON.stringify({ ...VALID, summary: '   ' })),
      () => geminiReply('[1, 2, 3]'),
    ];
    for (const reply of cases) {
      const f = fakeFetch(reply);
      await expectKind(summariseWithAi(README, gemini, { fetchImpl: f.fn }), 'bad-output');
    }
    const blocked = fakeFetch(() => json({ candidates: [], promptFeedback: { blockReason: 'SAFETY' } }));
    expect((await failure(summariseWithAi(README, gemini, { fetchImpl: blocked.fn }))).message).toContain('SAFETY');
  });
});

describe('model output parsing', () => {
  it('accepts fenced JSON and JSON wrapped in prose', async () => {
    for (const text of [`\`\`\`json\n${JSON.stringify(VALID)}\n\`\`\``, `Here you go:\n${JSON.stringify(VALID)}\nHope that helps!`]) {
      const f = fakeFetch(() => openAiReply(text));
      await expect(summariseWithAi(README, { provider: 'openai', apiKey: KEY }, { fetchImpl: f.fn })).resolves.toEqual(VALID);
    }
    expect(parseJsonLoose('```\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(() => parseJsonLoose('no json')).toThrow();
  });

  it('trims, drops empty items, strips Markdown and shortens over-long output', async () => {
    const messy = {
      summary: '  **Taskly** is a `task` manager.  ',
      key_points: ['  - Fast  ', '', '   ', ...Array.from({ length: 12 }, (_, i) => `Point ${i}`)],
      tagline: `  ${'Long tagline '.repeat(30)}`,
      improvements: '1. Add screenshots\n2. Explain setup\n',
    };
    const f = fakeFetch(() => ollamaReply(JSON.stringify(messy)));
    const result = await summariseWithAi(README, { provider: 'ollama' }, { fetchImpl: f.fn });
    expect(result.summary).toBe('Taskly is a task manager.');
    expect(result.keyPoints[0]).toBe('Fast');
    expect(result.keyPoints).toHaveLength(10);
    expect(result.tagline.length).toBeLessThanOrEqual(200);
    expect(result.tagline.endsWith('…')).toBe(true);
    expect(result.improvements).toEqual(['Add screenshots', 'Explain setup']);
  });

  it('AiResultSchema trims and drops empties, and rejects out-of-range values', () => {
    expect(AiResultSchema.parse({ summary: '  Hi.  ', keyPoints: [' a ', ''], improvements: [] })).toEqual({
      summary: 'Hi.',
      keyPoints: ['a'],
      tagline: '',
      improvements: [],
    });
    expect(AiResultSchema.safeParse({ summary: '' }).success).toBe(false);
    expect(AiResultSchema.safeParse({}).success).toBe(false);
    expect(AiResultSchema.safeParse({ summary: 'x'.repeat(2001) }).success).toBe(false);
    expect(AiResultSchema.safeParse({ summary: 'ok', keyPoints: Array.from({ length: 11 }, () => 'p') }).success).toBe(false);
    expect(AiResultSchema.safeParse({ summary: 'ok', improvements: ['x'.repeat(301)] }).success).toBe(false);
    expect(AiResultSchema.safeParse({ summary: 'ok', tagline: 'x'.repeat(201) }).success).toBe(false);
  });

  it('normaliseAiOutput leaves non-objects alone for the schema to reject', () => {
    expect(normaliseAiOutput('text')).toBe('text');
    expect(normaliseAiOutput([1])).toEqual([1]);
  });
});

describe('describeRequest', () => {
  it('says where the README and the key go', () => {
    expect(describeRequest(gemini)).toEqual({ host: 'generativelanguage.googleapis.com', sendsKeyTo: 'generativelanguage.googleapis.com' });
    expect(describeRequest({ provider: 'openai', baseUrl: 'https://openrouter.ai/api/v1' })).toEqual({ host: 'openrouter.ai', sendsKeyTo: 'openrouter.ai' });
    expect(describeRequest({ provider: 'ollama' })).toEqual({ host: 'localhost:11434', sendsKeyTo: '' });
    expect(describeRequest({ provider: 'openai', baseUrl: 'http://localhost:11434/v1' })).toEqual({ host: 'localhost:11434', sendsKeyTo: '' });
  });
});
