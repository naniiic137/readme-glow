import { useDeferredValue, useMemo, useState } from 'react';
import { Drawer, revealSourceLine } from './Drawer';
import { Icon } from '../Icon';
import { AiSection } from './AiSection';
import { useStore } from '../../app/store';
import { doc, toast, ui } from '../../app/state';
import { checkHealth, applyFix, type HealthIssue } from '../../lib/health';
import { analyzeReadme, insightsToMarkdown, overviewSection, keyFeaturesSection, type Fact } from '../../lib/summary';
import { insertMarkdownBlock } from '../dialogs/SectionsDialog';

const SEV_ICON: Record<HealthIssue['severity'], string> = { error: 'alert', warning: 'info', info: 'lightbulb' };

export default function InsightsPanel({ markdown }: { markdown: string }) {
  const tab = useStore(ui, (s) => s.insightsTab);
  const current = useStore(ui, (s) => s.doc);
  const text = useDeferredValue(markdown);
  return (
    <Drawer title="Insights" label="Summary and health check">
      <div className="seg full insights-tabs" role="tablist" aria-label="Insights">
        <button type="button" role="tab" aria-selected={tab === 'summary'} onClick={() => ui.set({ insightsTab: 'summary' })}>
          <Icon name="lightbulb" size={15} /> Summary
        </button>
        <button type="button" role="tab" aria-selected={tab === 'health'} onClick={() => ui.set({ insightsTab: 'health' })}>
          <Icon name="health" size={15} /> Health check
        </button>
      </div>
      {tab === 'health' ? <HealthTab markdown={text} /> : <SummaryTab markdown={text} repo={current?.source.kind === 'github' ? { owner: current.source.owner, name: current.source.repo, description: current.meta?.description ?? null } : undefined} />}
    </Drawer>
  );
}

function HealthTab({ markdown }: { markdown: string }) {
  const report = useMemo(() => checkHealth(markdown), [markdown]);
  const [showPassed, setShowPassed] = useState(false);
  const title = useStore(ui, (s) => s.doc?.title);
  const fix = (issue: HealthIssue) => {
    if (!issue.fix) return;
    const next = applyFix(doc.text, issue.fix, { projectName: title && title !== 'Untitled README' ? title : undefined });
    if (next === doc.text) {
      toast('Nothing to change for that one.', 'info');
      return;
    }
    doc.commit(next, { origin: 'fix' });
    doc.breakGroup();
    toast(`${issue.fixLabel ?? 'Fixed'} — done.`, 'success', { action: { label: 'Undo', run: () => doc.undo() } });
  };
  const deg = Math.round((report.score / 100) * 360);
  return (
    <div className="health">
      <div className="score-card">
        <div className={`score-ring grade-${report.grade.replace('+', 'plus')}`} style={{ ['--deg' as string]: `${deg}deg` }} role="img" aria-label={`Score ${report.score} out of 100, grade ${report.grade}`}>
          <span className="score-num">{report.score}</span>
          <span className="score-grade">{report.grade}</span>
        </div>
        <div>
          <h3>{report.score >= 90 ? 'Looking great!' : report.score >= 70 ? 'Solid — a few quick wins left' : report.score >= 50 ? 'A good start' : 'Let’s give it some love'}</h3>
          <p className="muted">
            {report.issues.length ? `${report.issues.length} suggestion${report.issues.length === 1 ? '' : 's'}` : 'No suggestions'} · {report.passed.length} check{report.passed.length === 1 ? '' : 's'} passed
          </p>
        </div>
      </div>
      <ul className="issues">
        {report.issues.map((issue) => (
          <li key={`${issue.id}-${issue.line ?? 0}`} className={`issue sev-${issue.severity}`}>
            <Icon name={SEV_ICON[issue.severity]} size={16} />
            <div className="issue-body">
              <strong>
                {issue.title}
                {issue.count && issue.count > 1 ? <span className="issue-count">×{issue.count}</span> : null}
              </strong>
              <p>{issue.detail}</p>
              <div className="issue-actions">
                {issue.fix && (
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => fix(issue)}>
                    <Icon name="wand" size={14} /> {issue.fixLabel ?? 'Fix it'}
                  </button>
                )}
                {issue.line !== undefined && (
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => revealSourceLine(issue.line!)}>
                    Show line {issue.line}
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-sm btn-ghost" aria-expanded={showPassed} onClick={() => setShowPassed(!showPassed)}>
        <Icon name={showPassed ? 'chevronDown' : 'chevronRight'} size={14} /> {report.passed.length} passed checks
      </button>
      {showPassed && (
        <ul className="passed">
          {report.passed.map((p) => (
            <li key={p.id}>
              <Icon name="check" size={14} /> {p.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FactList({ title, facts, copy, icon }: { title: string; facts: Fact[]; copy?: boolean; icon: string }) {
  if (!facts.length) return null;
  return (
    <section className="facts">
      <h3>
        <Icon name={icon} size={15} /> {title}
      </h3>
      <ul>
        {facts.map((f, i) => (
          <li key={`${f.value}-${i}`}>
            <button type="button" className="fact" onClick={() => revealSourceLine(f.line)} title={`Line ${f.line}`}>
              {copy ? <code>{f.value}</code> : <span>{f.value}</span>}
              {f.label && f.label !== f.value && <small>{f.label}</small>}
            </button>
            {copy && (
              <button type="button" className="icon-btn sm" aria-label={`Copy ${f.value}`} onClick={() => void navigator.clipboard?.writeText(f.value).then(() => toast('Copied.', 'success', { timeout: 1200 }))}>
                <Icon name="copy" size={13} />
              </button>
            )}
            {f.href && !copy && (
              <a className="icon-btn sm" href={f.href} target="_blank" rel="noopener noreferrer" aria-label={`Open ${f.label}`}>
                <Icon name="arrowRight" size={13} />
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SummaryTab({ markdown, repo }: { markdown: string; repo?: { owner: string; name: string; description: string | null } }) {
  const ins = useMemo(() => analyzeReadme(markdown, { repo }), [markdown, repo]);
  const insert = (md: string, what: string) => {
    insertMarkdownBlock(md);
    toast(`${what} inserted.`, 'success', { action: { label: 'Undo', run: () => doc.undo() } });
  };
  return (
    <div className="summary">
      <section className="one-liner">
        <p className="kicker">What is this?</p>
        <p className="one-liner-text">{ins.oneLiner}</p>
      </section>
      {ins.summary.length > 0 && (
        <section className="facts">
          <h3>
            <Icon name="book" size={15} /> Summary
          </h3>
          <ol className="summary-list">
            {ins.summary.map((s) => (
              <li key={s.line + s.text}>
                <button type="button" className="fact prose" onClick={() => revealSourceLine(s.line)}>
                  {s.text}
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
      <div className="summary-actions">
        <button type="button" className="btn btn-sm" onClick={() => void navigator.clipboard?.writeText(insightsToMarkdown(ins)).then(() => toast('Summary copied as Markdown.', 'success'))}>
          <Icon name="copy" size={14} /> Copy as Markdown
        </button>
        <button type="button" className="btn btn-sm" onClick={() => insert(overviewSection(ins), 'Overview section')}>
          <Icon name="plus" size={14} /> Insert “Overview”
        </button>
        <button type="button" className="btn btn-sm" onClick={() => insert(keyFeaturesSection(ins), 'Key features section')}>
          <Icon name="plus" size={14} /> Insert “Key features”
        </button>
      </div>
      {ins.tech.length > 0 && (
        <section className="facts">
          <h3>
            <Icon name="zap" size={15} /> Tech stack
          </h3>
          <div className="tech-chips">
            {ins.tech.map((t) => (
              <button key={t.value} type="button" className="chip" onClick={() => revealSourceLine(t.line)}>
                {t.value}
              </button>
            ))}
          </div>
        </section>
      )}
      <FactList title="Install" facts={ins.install} copy icon="download" />
      <FactList title="Run & use" facts={ins.run} copy icon="play" />
      <FactList title="Requirements" facts={ins.requirements} icon="listChecks" />
      <FactList title="Links" facts={ins.links} icon="link" />
      {ins.licence && <FactList title="Licence" facts={[ins.licence]} icon="shield" />}
      <FactList title="People" facts={ins.authors} icon="heart" />
      {ins.outline.length > 0 && (
        <section className="facts">
          <h3>
            <Icon name="list" size={15} /> Outline
          </h3>
          <ul className="outline">
            {ins.outline.map((h) => (
              <li key={h.id + h.line} style={{ paddingInlineStart: `${(h.depth - 1) * 12}px` }}>
                <button type="button" className="fact" onClick={() => revealSourceLine(h.line)}>
                  {h.text}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="stats-grid" aria-label="Statistics">
        <div>
          <strong>{ins.stats.words.toLocaleString()}</strong>
          <span>words</span>
        </div>
        <div>
          <strong>{ins.stats.readingMinutes}</strong>
          <span>min read</span>
        </div>
        <div>
          <strong>{ins.stats.sections}</strong>
          <span>sections</span>
        </div>
        <div>
          <strong>{ins.stats.codeBlocks}</strong>
          <span>code blocks</span>
        </div>
        <div>
          <strong>{ins.stats.images}</strong>
          <span>images</span>
        </div>
        <div>
          <strong>{ins.stats.links}</strong>
          <span>links</span>
        </div>
      </section>
      <AiSection markdown={markdown} fallback={ins} />
    </div>
  );
}
