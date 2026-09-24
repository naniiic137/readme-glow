import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { toast, doc } from '../../app/state';
import { insertMarkdownBlock } from '../dialogs/SectionsDialog';
import type { Insights } from '../../lib/summary';
import type { AiProviderId, AiResult } from '../../lib/ai/client';

type AiModule = typeof import('../../lib/ai');

/**
 * Optional AI mode: off by default, bring your own key, nothing is sent until
 * you press the button. Keys stay in this tab (sessionStorage) unless you ask
 * to remember them on this device.
 */
export function AiSection({ markdown, fallback }: { markdown: string; fallback: Insights }) {
  const [open, setOpen] = useState(false);
  const [ai, setAi] = useState<AiModule | null>(null);
  const [provider, setProvider] = useState<AiProviderId>('gemini');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [key, setKey] = useState('');
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open || ai) return;
    void import('../../lib/ai').then((m) => setAi(m));
  }, [open, ai]);

  useEffect(() => {
    if (!ai) return;
    const info = ai.AI_PROVIDERS.find((p) => p.id === provider)!;
    setBaseUrl(info.defaultBaseUrl);
    setModel(info.defaultModel);
    setKey(ai.loadKey(provider) ?? '');
    setRemember(ai.isRemembered(provider));
  }, [ai, provider]);

  useEffect(() => () => abort.current?.abort(), []);

  const info = ai?.AI_PROVIDERS.find((p) => p.id === provider);

  const run = async () => {
    if (!ai || !info) return;
    setError(null);
    setResult(null);
    if (info.needsKey && key.trim()) ai.saveKey(provider, key.trim(), remember);
    abort.current = new AbortController();
    setBusy(true);
    try {
      const r = await ai.summariseWithAi(markdown, { provider, apiKey: key.trim() || undefined, baseUrl, model }, { signal: abort.current.signal });
      setResult(r);
    } catch (err) {
      setError((err as Error).message || 'The AI request failed.');
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  const request = ai && info ? ai.describeRequest({ provider, baseUrl, model, apiKey: key }) : null;

  return (
    <section className="ai-box">
      <button type="button" className="ai-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="sparkles" size={16} />
        <span>
          <strong>AI summary</strong>
          <small>Optional · off by default · your own key</small>
        </span>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={15} />
      </button>
      {open && (
        <div className="ai-body">
          {!ai || !info ? (
            <p className="muted">Loading…</p>
          ) : (
            <>
              <p className="muted small">
                The offline summary above never leaves your browser. AI mode sends this README to the provider you choose, only when you press the button.
              </p>
              <label className="field">
                <span>Provider</span>
                <select className="select" value={provider} onChange={(e) => setProvider(e.target.value as AiProviderId)}>
                  {ai.AI_PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              {provider === 'openai' && (
                <label className="field">
                  <span>Service</span>
                  <select
                    className="select"
                    value={baseUrl}
                    onChange={(e) => {
                      const preset = ai.OPENAI_COMPATIBLE_PRESETS.find((p) => p.baseUrl === e.target.value);
                      setBaseUrl(e.target.value);
                      if (preset) setModel(preset.model);
                    }}
                  >
                    {ai.OPENAI_COMPATIBLE_PRESETS.map((p) => (
                      <option key={p.baseUrl} value={p.baseUrl}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="field">
                <span>Model</span>
                <input className="input" value={model} onChange={(e) => setModel(e.target.value)} spellCheck={false} />
              </label>
              {info.needsKey && (
                <label className="field">
                  <span>
                    API key{' '}
                    {info.keyHelpUrl && (
                      <a href={info.keyHelpUrl} target="_blank" rel="noopener noreferrer">
                        get one
                      </a>
                    )}
                  </span>
                  <input className="input" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Stays in this browser" />
                </label>
              )}
              {info.needsKey && (
                <label className="switch">
                  <span>Remember the key on this device</span>
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                </label>
              )}
              <p className="muted small">{info.note}</p>
              {request && (
                <p className="ai-note">
                  <Icon name="shield" size={13} /> Sends the README text to <strong>{request.host}</strong>.
                </p>
              )}
              <div className="ai-actions">
                {busy ? (
                  <button type="button" className="btn btn-sm" onClick={() => abort.current?.abort()}>
                    <span className="spinner" aria-hidden="true" /> Cancel
                  </button>
                ) : (
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => void run()} disabled={info.needsKey && !key.trim()}>
                    <Icon name="sparkles" size={14} /> Summarise with AI
                  </button>
                )}
                {ai.loadKey(provider) && (
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => {
                      ai.forgetKeys();
                      setKey('');
                      toast('AI keys removed from this browser.', 'info');
                    }}
                  >
                    Forget keys
                  </button>
                )}
              </div>
              {error && (
                <div className="ai-error" role="alert">
                  <strong>{error}</strong>
                  <p>Your offline summary is still here: {fallback.oneLiner}</p>
                </div>
              )}
              {result && (
                <div className="ai-result" aria-live="polite">
                  {result.tagline && <p className="ai-tagline">“{result.tagline}”</p>}
                  <p>{result.summary}</p>
                  {result.keyPoints.length > 0 && (
                    <>
                      <h4>Key points</h4>
                      <ul>
                        {result.keyPoints.map((k) => (
                          <li key={k}>{k}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {result.improvements.length > 0 && (
                    <>
                      <h4>Suggested improvements</h4>
                      <ul>
                        {result.improvements.map((k) => (
                          <li key={k}>{k}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  <div className="ai-actions">
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => {
                        insertMarkdownBlock(`## Overview\n\n${result.summary}\n`);
                        toast('Overview inserted.', 'success', { action: { label: 'Undo', run: () => doc.undo() } });
                      }}
                    >
                      <Icon name="plus" size={14} /> Insert as Overview
                    </button>
                    {result.keyPoints.length > 0 && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => {
                          insertMarkdownBlock(`## Key features\n\n${result.keyPoints.map((k) => `- ${k}`).join('\n')}\n`);
                          toast('Key features inserted.', 'success', { action: { label: 'Undo', run: () => doc.undo() } });
                        }}
                      >
                        <Icon name="plus" size={14} /> Insert key points
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
