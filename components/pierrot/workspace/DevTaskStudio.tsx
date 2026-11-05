'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clipboard, FileCheck2, Loader2, Plus, Save, ShieldCheck } from 'lucide-react';
import { diagnosisToTaskInput } from '@/lib/pierrot/dev/diagnosis';
import type {
  DevDiagnosis,
  DevTask,
  DevTaskStatus,
  DevVerificationStatus,
} from '@/lib/pierrot/dev/types';

type RepoOption = {
  key: string;
  label: string;
  fullName: string;
  workBranch: string;
  lastCommitSha: string | null;
};

type TaskForm = {
  title: string;
  objective: string;
  context: string;
  repository: string;
  baseRef: string;
  baseCommit: string;
  currentBehavior: string;
  requiredBehavior: string;
  technicalPlan: string;
  affectedFiles: string;
  backendChanges: string;
  frontendChanges: string;
  databaseChanges: string;
  migrations: string;
  securityConstraints: string;
  tests: string;
  acceptanceCriteria: string;
  unverified: string;
  status: DevTaskStatus;
};

const STATUS_LABELS: Record<DevTaskStatus, string> = {
  draft: 'Draft',
  ready: 'Ready',
  in_progress: 'In Progress',
  review: 'Review',
  verified: 'Verified',
  rejected: 'Rejected',
  archived: 'Archived',
};

function linesToArray(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function arrayToLines(value: string[]): string {
  return value.join('\n');
}

function formFromTask(task: DevTask): TaskForm {
  return {
    title: task.title,
    objective: task.objective,
    context: task.context,
    repository: task.repository,
    baseRef: task.baseRef,
    baseCommit: task.baseCommit || '',
    currentBehavior: task.currentBehavior,
    requiredBehavior: task.requiredBehavior,
    technicalPlan: task.technicalPlan,
    affectedFiles: arrayToLines(task.affectedFiles),
    backendChanges: arrayToLines(task.backendChanges),
    frontendChanges: arrayToLines(task.frontendChanges),
    databaseChanges: arrayToLines(task.databaseChanges),
    migrations: arrayToLines(task.migrations),
    securityConstraints: arrayToLines(task.securityConstraints),
    tests: arrayToLines(task.tests),
    acceptanceCriteria: arrayToLines(task.acceptanceCriteria),
    unverified: arrayToLines(task.unverified),
    status: task.status,
  };
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function verificationTone(status: DevVerificationStatus | null): string {
  if (status === 'verified') return 'is-verified';
  if (status === 'verified_with_warnings') return 'is-warn';
  if (status === 'rejected') return 'is-rejected';
  if (status === 'not_verified') return 'is-unverified';
  return '';
}

export default function DevTaskStudio({
  initialTasks,
  repositories,
  activeRepository,
  conversationId,
  conversationContext,
  suggestedTitle,
  diagnosis,
  createNonce,
  onCopyPrompt,
}: {
  initialTasks: DevTask[];
  repositories: RepoOption[];
  activeRepository: string;
  conversationId: string | null;
  conversationContext: string;
  suggestedTitle: string;
  diagnosis?: DevDiagnosis | null;
  createNonce?: number;
  onCopyPrompt?: (prompt: string) => void;
}) {
  const [tasks, setTasks] = useState<DevTask[]>(initialTasks);
  const [selectedId, setSelectedId] = useState<string | null>(initialTasks[0]?.id ?? null);
  const [form, setForm] = useState<TaskForm | null>(
    initialTasks[0] ? formFromTask(initialTasks[0]) : null
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [review, setReview] = useState<{
    verdict: DevVerificationStatus;
    summary: string;
    markdown: string;
  } | null>(null);
  const [resultCommit, setResultCommit] = useState('');
  const [resultNotes, setResultNotes] = useState('');
  const lastCreateNonce = useRef(createNonce || 0);

  const selected = useMemo(
    () => tasks.find((task) => task.id === selectedId) || null,
    [selectedId, tasks]
  );

  useEffect(() => {
    if (!selectedId && initialTasks[0]) {
      setSelectedId(initialTasks[0].id);
      setForm(formFromTask(initialTasks[0]));
    }
  }, [initialTasks, selectedId]);

  useEffect(() => {
    if (!createNonce || createNonce === lastCreateNonce.current) return;
    lastCreateNonce.current = createNonce;
    void createFromConversation();
    // The nonce is the explicit create signal; the latest closure is fine here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createNonce]);

  useEffect(() => {
    if (!selected) return;
    setForm(formFromTask(selected));
    setResultCommit(selected.resultCommit || '');
    setResultNotes(selected.resultNotes || '');
    setReview(
      selected.verificationStatus && selected.verificationNotes
        ? {
            verdict: selected.verificationStatus,
            summary: selected.verificationNotes.split('\n').slice(0, 4).join(' '),
            markdown: selected.verificationNotes,
          }
        : null
    );
  }, [selected]);

  function selectTask(task: DevTask) {
    setSelectedId(task.id);
    setForm(formFromTask(task));
    setError(null);
    setNotice(null);
  }

  function updateField<K extends keyof TaskForm>(key: K, value: TaskForm[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function upsertTask(task: DevTask) {
    setTasks((current) => {
      const exists = current.some((item) => item.id === task.id);
      return exists
        ? current.map((item) => (item.id === task.id ? task : item))
        : [task, ...current];
    });
    setSelectedId(task.id);
    setForm(formFromTask(task));
  }

  async function createFromConversation() {
    if (busy) return;
    setBusy('create');
    setError(null);
    setNotice(null);

    const repo = repositories.find((entry) => entry.key === activeRepository) || repositories[0];

    const structured =
      diagnosis && diagnosis.shouldCreateTask
        ? diagnosisToTaskInput(diagnosis, {
            conversationId,
            baseRef: repo?.workBranch || diagnosis.ref || 'main',
            baseCommit: diagnosis.commitSha || repo?.lastCommitSha || null,
          })
        : null;

    const input = structured || {
      title: suggestedTitle.trim() || 'Инженерное задание из Dev-треда',
      objective: 'Преобразовать текущее обсуждение в проверяемое инженерное изменение.',
      context: conversationContext.slice(0, 12_000),
      repository: repo?.key || activeRepository,
      baseRef: repo?.workBranch || 'main',
      baseCommit: repo?.lastCommitSha || null,
      conversationId,
      status: 'draft' as const,
    };

    try {
      const response = await fetch('/api/admin/pierrot/dev/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || `Task creation failed (${response.status}).`);
      }
      if (payload?.task) {
        upsertTask(payload.task as DevTask);
        setNotice(
          structured
            ? `Задание создано из диагностики: ${structured.affectedFiles?.length || 0} проверенных файлов. Отредактируйте поля и сохраните.`
            : 'Задание создано из обсуждения без структурированной диагностики. Проверьте поля и добавьте файлы только при наличии свидетельств.'
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Task creation failed.');
    } finally {
      setBusy(null);
    }
  }

  async function saveTask() {
    if (!selected || !form || busy) return;
    setBusy('save');
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/admin/pierrot/dev/tasks/${encodeURIComponent(selected.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: form.title,
            objective: form.objective,
            context: form.context,
            repository: form.repository,
            baseRef: form.baseRef,
            baseCommit: form.baseCommit || null,
            currentBehavior: form.currentBehavior,
            requiredBehavior: form.requiredBehavior,
            technicalPlan: form.technicalPlan,
            affectedFiles: linesToArray(form.affectedFiles),
            backendChanges: linesToArray(form.backendChanges),
            frontendChanges: linesToArray(form.frontendChanges),
            databaseChanges: linesToArray(form.databaseChanges),
            migrations: linesToArray(form.migrations),
            securityConstraints: linesToArray(form.securityConstraints),
            tests: linesToArray(form.tests),
            acceptanceCriteria: linesToArray(form.acceptanceCriteria),
            unverified: linesToArray(form.unverified),
            status: form.status,
          }),
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || `Task update failed (${response.status}).`);
      }
      if (payload?.task) {
        upsertTask(payload.task as DevTask);
        setNotice('Задание сохранено.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Task update failed.');
    } finally {
      setBusy(null);
    }
  }

  async function copyPrompt() {
    if (!selected) return;
    const prompt = selected.promptText;
    if (!prompt) return;

    try {
      await navigator.clipboard.writeText(prompt);
      setNotice('Полный prompt скопирован.');
      onCopyPrompt?.(prompt);
    } catch {
      setError('Не удалось скопировать prompt. Откройте его вручную.');
    }
  }

  async function attachResult() {
    if (!selected || busy) return;
    setBusy('attach');
    setError(null);
    setNotice(null);

    try {
      const pullRequests = resultNotes.match(/https?:\/\/\S+\/pull\/\d+/g)?.slice(0, 20) || [];
      const response = await fetch(
        `/api/admin/pierrot/dev/tasks/${encodeURIComponent(selected.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'attach_result',
            resultCommit: resultCommit.trim() || null,
            resultNotes: resultNotes.trim(),
            pullRequests,
            status: 'review',
          }),
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || `Attach failed (${response.status}).`);
      }
      if (payload?.task) {
        upsertTask(payload.task as DevTask);
        setNotice('Результат прикреплён. Теперь можно запустить проверку.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Attach failed.');
    } finally {
      setBusy(null);
    }
  }

  async function runReview() {
    if (!selected || busy) return;
    setBusy('review');
    setError(null);
    setNotice(null);

    try {
      const response = await fetch('/api/admin/pierrot/dev/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: selected.id,
          ...(resultCommit.trim() ? { head: resultCommit.trim() } : {}),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || `Review failed (${response.status}).`);
      }
      if (payload?.task) upsertTask(payload.task as DevTask);
      if (payload?.report) {
        setReview({
          verdict: payload.report.verdict as DevVerificationStatus,
          summary: payload.report.summary as string,
          markdown: String(payload.markdown || ''),
        });
        setNotice('Проверка завершена. Тесты, которые не запускались, отмечены явно.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Review failed.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="pw-dev-studio" aria-label="Task Studio">
      <div className="pw-dev-studio-head">
        <div>
          <p className="pw-dev-kicker">TASK STUDIO</p>
          <h2>Инженерные задания</h2>
        </div>
        <button
          type="button"
          className="pw-dev-icon-text"
          onClick={() => void createFromConversation()}
          disabled={busy === 'create'}
          title={
            diagnosis?.shouldCreateTask
              ? 'Создать задание из проверенной диагностики'
              : 'Создать задание из текущего Dev-треда'
          }
        >
          {busy === 'create' ? (
            <Loader2 size={14} className="pw-spin" aria-hidden="true" />
          ) : (
            <Plus size={14} aria-hidden="true" />
          )}
          из треда
        </button>
      </div>

      {tasks.length === 0 ? (
        <p className="pw-dev-studio-empty">
          Заданий пока нет. Создайте одно из текущего обсуждения или заполните форму вручную после
          первого сохранения.
        </p>
      ) : (
        <ul className="pw-dev-task-list">
          {tasks.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                className="pw-dev-task-item"
                aria-current={selectedId === task.id ? 'true' : undefined}
                onClick={() => selectTask(task)}
              >
                <span className="pw-dev-task-title">{task.title}</span>
                <span className="pw-dev-task-meta">
                  {task.repository === 'pierrot' ? 'Pierrot' : 'newlove'} ·{' '}
                  {STATUS_LABELS[task.status]} · {formatDate(task.updatedAt)}
                </span>
                {task.verificationStatus && (
                  <span className={`pw-dev-verdict ${verificationTone(task.verificationStatus)}`}>
                    {task.verificationStatus.replaceAll('_', ' ')}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && form && (
        <div className="pw-dev-task-editor">
          <div className="pw-dev-task-editor-head">
            <span className="pw-dev-label">SELECTED TASK</span>
            <span className="pw-dev-task-id">{selected.id.slice(0, 8)}</span>
          </div>

          {selected.decisionIds.length > 0 && (
            <p className="pw-dev-context-muted">
              Из памяти: {selected.decisionIds.map((id) => id.slice(0, 8)).join(', ')}
            </p>
          )}

          <label className="pw-dev-field">
            <span>Название</span>
            <input
              value={form.title}
              onChange={(event) => updateField('title', event.target.value)}
            />
          </label>

          <div className="pw-dev-field-row">
            <label className="pw-dev-field">
              <span>Репозиторий</span>
              <select
                value={form.repository}
                onChange={(event) => updateField('repository', event.target.value)}
              >
                {repositories.map((repo) => (
                  <option key={repo.key} value={repo.key}>
                    {repo.label} · {repo.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label className="pw-dev-field">
              <span>Статус</span>
              <select
                value={form.status}
                onChange={(event) => updateField('status', event.target.value as DevTaskStatus)}
              >
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="pw-dev-field-row">
            <label className="pw-dev-field">
              <span>Base ref</span>
              <input
                value={form.baseRef}
                onChange={(event) => updateField('baseRef', event.target.value)}
              />
            </label>
            <label className="pw-dev-field">
              <span>Base commit</span>
              <input
                value={form.baseCommit}
                onChange={(event) => updateField('baseCommit', event.target.value)}
                placeholder="SHA, если известен"
              />
            </label>
          </div>

          <label className="pw-dev-field">
            <span>Цель</span>
            <textarea
              rows={2}
              value={form.objective}
              onChange={(event) => updateField('objective', event.target.value)}
            />
          </label>

          <label className="pw-dev-field">
            <span>Контекст</span>
            <textarea
              rows={3}
              value={form.context}
              onChange={(event) => updateField('context', event.target.value)}
            />
          </label>

          <label className="pw-dev-field">
            <span>Текущее поведение</span>
            <textarea
              rows={2}
              value={form.currentBehavior}
              onChange={(event) => updateField('currentBehavior', event.target.value)}
            />
          </label>

          <label className="pw-dev-field">
            <span>Требуемое поведение</span>
            <textarea
              rows={2}
              value={form.requiredBehavior}
              onChange={(event) => updateField('requiredBehavior', event.target.value)}
            />
          </label>

          <label className="pw-dev-field">
            <span>Технический план</span>
            <textarea
              rows={3}
              value={form.technicalPlan}
              onChange={(event) => updateField('technicalPlan', event.target.value)}
            />
          </label>

          <div className="pw-dev-field-row">
            <label className="pw-dev-field">
              <span>Затронутые файлы · по одному в строке</span>
              <textarea
                rows={3}
                value={form.affectedFiles}
                onChange={(event) => updateField('affectedFiles', event.target.value)}
              />
            </label>
            <label className="pw-dev-field">
              <span>Backend changes · по одному</span>
              <textarea
                rows={3}
                value={form.backendChanges}
                onChange={(event) => updateField('backendChanges', event.target.value)}
              />
            </label>
          </div>

          <div className="pw-dev-field-row">
            <label className="pw-dev-field">
              <span>Frontend changes</span>
              <textarea
                rows={2}
                value={form.frontendChanges}
                onChange={(event) => updateField('frontendChanges', event.target.value)}
              />
            </label>
            <label className="pw-dev-field">
              <span>Database changes</span>
              <textarea
                rows={2}
                value={form.databaseChanges}
                onChange={(event) => updateField('databaseChanges', event.target.value)}
              />
            </label>
          </div>

          <div className="pw-dev-field-row">
            <label className="pw-dev-field">
              <span>Migrations</span>
              <textarea
                rows={2}
                value={form.migrations}
                onChange={(event) => updateField('migrations', event.target.value)}
              />
            </label>
            <label className="pw-dev-field">
              <span>Security</span>
              <textarea
                rows={2}
                value={form.securityConstraints}
                onChange={(event) => updateField('securityConstraints', event.target.value)}
              />
            </label>
          </div>

          <label className="pw-dev-field">
            <span>Тесты · по одному в строке</span>
            <textarea
              rows={2}
              value={form.tests}
              onChange={(event) => updateField('tests', event.target.value)}
            />
          </label>

          <label className="pw-dev-field">
            <span>Acceptance criteria · по одному в строке</span>
            <textarea
              rows={3}
              value={form.acceptanceCriteria}
              onChange={(event) => updateField('acceptanceCriteria', event.target.value)}
            />
          </label>

          <label className="pw-dev-field">
            <span>Unverified / out of scope</span>
            <textarea
              rows={2}
              value={form.unverified}
              onChange={(event) => updateField('unverified', event.target.value)}
            />
          </label>

          <div className="pw-dev-actions">
            <button
              type="button"
              className="pw-dev-action"
              onClick={() => void saveTask()}
              disabled={Boolean(busy)}
            >
              {busy === 'save' ? (
                <Loader2 size={14} className="pw-spin" aria-hidden="true" />
              ) : (
                <Save size={14} aria-hidden="true" />
              )}
              Сохранить
            </button>
            <button
              type="button"
              className="pw-dev-action"
              onClick={() => void copyPrompt()}
              disabled={!selected.promptText}
            >
              <Clipboard size={14} aria-hidden="true" />
              Copy prompt
            </button>
            <button
              type="button"
              className="pw-dev-action"
              onClick={() => void attachResult()}
              disabled={Boolean(busy)}
            >
              <FileCheck2 size={14} aria-hidden="true" />
              Прикрепить результат
            </button>
            <button
              type="button"
              className="pw-dev-action pw-dev-action-strong"
              onClick={() => void runReview()}
              disabled={Boolean(busy)}
            >
              {busy === 'review' ? (
                <Loader2 size={14} className="pw-spin" aria-hidden="true" />
              ) : (
                <ShieldCheck size={14} aria-hidden="true" />
              )}
              Проверить
            </button>
          </div>

          <div className="pw-dev-field-row">
            <label className="pw-dev-field">
              <span>Result commit</span>
              <input
                value={resultCommit}
                onChange={(event) => setResultCommit(event.target.value)}
                placeholder="SHA результата"
              />
            </label>
            <label className="pw-dev-field">
              <span>PR / notes</span>
              <input
                value={resultNotes}
                onChange={(event) => setResultNotes(event.target.value)}
                placeholder="Ссылки и краткий результат"
              />
            </label>
          </div>

          {selected.pullRequests.length > 0 && (
            <p className="pw-dev-context-muted">PR: {selected.pullRequests.join(' · ')}</p>
          )}

          {selected.promptText && (
            <details className="pw-dev-prompt">
              <summary>
                <Clipboard size={13} aria-hidden="true" />
                Полный prompt для OpenCode
              </summary>
              <pre>{selected.promptText}</pre>
            </details>
          )}

          {review && (
            <div className={`pw-dev-review-card ${verificationTone(review.verdict)}`}>
              <div className="pw-dev-review-head">
                {review.verdict === 'verified' ? (
                  <Check size={14} aria-hidden="true" />
                ) : (
                  <ShieldCheck size={14} aria-hidden="true" />
                )}
                <strong>{review.verdict.replaceAll('_', ' ')}</strong>
              </div>
              <p>{review.summary}</p>
              <details>
                <summary>Технический отчёт</summary>
                <pre>{review.markdown}</pre>
              </details>
            </div>
          )}
        </div>
      )}

      {notice && <p className="pw-dev-notice">{notice}</p>}
      {error && (
        <p className="pw-dev-studio-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
