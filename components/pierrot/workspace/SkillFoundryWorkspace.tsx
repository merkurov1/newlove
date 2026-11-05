'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, FilePlus2, Loader2, RotateCcw, Search, X } from 'lucide-react';
import type {
  SkillDefinition,
  SkillDetail,
  SkillExample,
  SkillRecord,
  SkillRun,
  SkillSuggestionResult,
  SkillTest,
} from '@/lib/pierrot/skills/types';
import { emptySkillDefinition, skillStatusLabel } from '@/lib/pierrot/skills/types';
import SkillAnalysisPanel from './SkillAnalysisPanel';

type FormState = {
  name: string;
  description: string;
  purpose: string;
  conditions: string;
  inputs: string;
  steps: string;
  tools: string;
  constraints: string;
  expectedResult: string;
  tests: string;
  examples: string;
  changelog: string;
};

function lines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseTests(value: string): SkillTest[] {
  return lines(value).flatMap((line) => {
    const [name, input, expected] = line.split('|').map((part) => part.trim());
    if (!name || !expected) return [];
    return [{ name, ...(input ? { input } : {}), expected }];
  });
}

function testsToLines(tests: SkillTest[]): string {
  return tests.map((test) => [test.name, test.input || '', test.expected].join(' | ')).join('\n');
}

function parseExamples(value: string): SkillExample[] {
  return lines(value).flatMap((line) => {
    const [title, input, result, date] = line.split('|').map((part) => part.trim());
    if (!title || !result) return [];
    return [
      {
        title,
        ...(input ? { input } : {}),
        result,
        ...(date ? { date } : {}),
      },
    ];
  });
}

function examplesToLines(examples: SkillExample[]): string {
  return examples
    .map((example) =>
      [example.title, example.input || '', example.result, example.date || ''].join(' | ')
    )
    .join('\n');
}

function definitionToForm(definition: SkillDefinition, changelog = ''): FormState {
  return {
    name: definition.name,
    description: definition.description,
    purpose: definition.purpose,
    conditions: definition.conditions.join('\n'),
    inputs: definition.inputs.join('\n'),
    steps: definition.steps.join('\n'),
    tools: definition.tools.join('\n'),
    constraints: definition.constraints.join('\n'),
    expectedResult: definition.expectedResult,
    tests: testsToLines(definition.tests),
    examples: examplesToLines(definition.examples),
    changelog,
  };
}

function formToDefinition(form: FormState): SkillDefinition {
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    purpose: form.purpose.trim(),
    conditions: lines(form.conditions),
    inputs: lines(form.inputs),
    steps: lines(form.steps),
    tools: lines(form.tools),
    constraints: lines(form.constraints),
    expectedResult: form.expectedResult.trim(),
    tests: parseTests(form.tests),
    examples: parseExamples(form.examples),
  };
}

const TEMPLATE = `name: Weekly studio review
description: Review the week's work and decide the next three moves.
purpose: Turn scattered notes into a short, honest weekly plan.
conditions: When the owner asks for a weekly review and there is enough material.
inputs: Current projects, unfinished tasks, recent decisions.
steps: Collect current projects
steps: List unfinished tasks and overdue reminders
steps: Identify one decision that needs a review
steps: Produce three next moves with a reason
tools: memory.search, brain.search
constraints: Read-only; owner authorization is required; no production changes without approval
expected: Three concrete next moves, each linked to a project or decision.
tests: Weekly review with no tasks | empty memory | Reports that there is not enough material instead of inventing tasks`;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const payload = (await response.json().catch(() => null)) as
    (T & { error?: string; code?: string }) | null;

  if (!response.ok) throw new Error(payload?.error || `Запрос не выполнен (${response.status}).`);
  return payload as T;
}

function runSummary(run: SkillRun | null): string {
  if (!run) return 'Тестов ещё не было.';

  const structural = run.checks.filter((check) => !check.phase || check.phase === 'structural');
  const historical = run.checks.filter((check) => check.phase === 'historical');
  const structuralFailed = structural.filter((check) => !check.passed);

  if (structuralFailed.length > 0) {
    return `Структурная проверка не пройдена: ${structuralFailed
      .map((check) => check.name)
      .join(', ')}.`;
  }

  const historicalPassed = historical.filter((check) => check.passed).length;
  const execution = run.checks.find((check) => check.phase === 'execution');

  return [
    'Структурная проверка пройдена.',
    historical.length > 0
      ? `Историческая применимость: ${historicalPassed}/${historical.length} проверок.`
      : 'Исторические примеры не проверялись.',
    execution ? 'Реальное исполнение не запускалось.' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export default function SkillFoundryWorkspace() {
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [selected, setSelected] = useState<SkillDetail | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => definitionToForm(emptySkillDefinition()));
  const [creating, setCreating] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
      const data = await api<{ skills: SkillRecord[] }>(`/api/pierrot/skills${params}`);
      setSkills(data.skills || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Навыки недоступны.');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  async function openSkill(id: string) {
    setBusy('load');
    setError(null);
    setNotice(null);

    try {
      const data = await api<{ skill: SkillDetail }>(`/api/pierrot/skills/${id}`);
      setSelected(data.skill);
      setForm(definitionToForm(data.skill.currentVersion?.definition || emptySkillDefinition()));
      setCreating(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось открыть навык.');
    } finally {
      setBusy(null);
    }
  }

  function beginCreate() {
    setSelected(null);
    setCreating(true);
    setError(null);
    setNotice(null);
    setForm(definitionToForm(emptySkillDefinition()));
  }

  async function createDraftFromAnalysis(
    definition: SkillDefinition,
    changelog: string,
    label: string,
    relatedSkillId?: string
  ) {
    setError(null);
    setNotice(label);

    if (!relatedSkillId) {
      setSelected(null);
      setCreating(true);
      setForm(definitionToForm(definition, changelog));
      return;
    }

    setBusy('analysis-draft');

    try {
      const data = await api<{ skill: SkillDetail }>(`/api/pierrot/skills/${relatedSkillId}`);
      setSelected(data.skill);
      setCreating(false);
      setForm(definitionToForm(definition, changelog));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Не удалось открыть существующий навык для новой версии.'
      );
    } finally {
      setBusy(null);
    }
  }

  async function suggestFromMemory() {
    setBusy('suggest');
    setError(null);
    setNotice(null);

    try {
      const data = await api<SkillSuggestionResult>('/api/pierrot/skills/suggest');

      if (!data.available || !data.suggestion) {
        setNotice(
          data.reason === 'not_enough_repetition'
            ? 'Пока не вижу достаточно повторяющейся процедуры в памяти. Нужно как минимум три похожие записи.'
            : 'Не удалось проанализировать память для черновика.'
        );
        return;
      }

      setSelected(null);
      setCreating(true);
      setForm(definitionToForm(data.suggestion.definition, data.suggestion.changelog));
      setNotice(
        `Нашёл повторяемую процедуру: ${data.suggestion.basedOn.length} записей. Это черновик, ничего не создано. ${
          data.suggestion.gaps.length > 0
            ? `Неясные места: ${data.suggestion.gaps.join(', ')}.`
            : ''
        }`
      );
    } catch {
      setError('Не удалось подготовить черновик из памяти.');
    } finally {
      setBusy(null);
    }
  }

  function applyTemplate() {
    const parsed = TEMPLATE.split('\n').reduce<Record<string, string[]>>((acc, line) => {
      const index = line.indexOf(':');
      if (index < 0) return acc;
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim();
      if (!key || !value) return acc;
      acc[key] = [...(acc[key] || []), value];
      return acc;
    }, {});

    setForm({
      name: parsed.name?.[0] || '',
      description: parsed.description?.[0] || '',
      purpose: parsed.purpose?.[0] || '',
      conditions: (parsed.conditions || []).join('\n'),
      inputs: (parsed.inputs || []).join('\n'),
      steps: (parsed.steps || []).join('\n'),
      tools: (parsed.tools || []).join('\n'),
      constraints: (parsed.constraints || []).join('\n'),
      expectedResult: parsed.expected?.[0] || '',
      tests: (parsed.tests || []).join('\n'),
      examples: '',
      changelog: 'Initial draft',
    });
  }

  async function saveVersion() {
    if (!form.name.trim()) {
      setError('Название навыка обязательно.');
      return;
    }

    setBusy('save');
    setError(null);
    setNotice(null);

    try {
      if (creating || !selected) {
        const data = await api<{ skill: SkillDetail }>('/api/pierrot/skills', {
          method: 'POST',
          body: JSON.stringify({
            definition: formToDefinition(form),
            changelog: form.changelog || 'Initial draft',
          }),
        });
        setSelected(data.skill);
        setCreating(false);
        setNotice('Черновик создан. Проверьте его тестом перед утверждением.');
      } else {
        const data = await api<{ skill: SkillDetail }>(`/api/pierrot/skills/${selected.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            action: 'version',
            definition: formToDefinition(form),
            changelog: form.changelog || 'New version',
          }),
        });
        setSelected(data.skill);
        setNotice('Создана новая версия. Проверенная версия не заменена автоматически.');
      }

      await loadList();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить навык.');
    } finally {
      setBusy(null);
    }
  }

  async function act(action: 'test' | 'approve' | 'disable', versionId?: string) {
    if (!selected) return;

    setBusy(action);
    setError(null);
    setNotice(null);

    try {
      const data = await api<{
        skill: SkillDetail;
        run?: SkillRun;
      }>(`/api/pierrot/skills/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          action,
          ...(versionId ? { versionId } : {}),
        }),
      });

      setSelected(data.skill);
      setNotice(
        action === 'test'
          ? runSummary(data.run || null)
          : action === 'approve'
            ? 'Навык утверждён и доступен Пьеро.'
            : 'Навык отключён. История сохранена.'
      );
      await loadList();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Операция не выполнена.');
    } finally {
      setBusy(null);
    }
  }

  async function restore(versionId: string) {
    if (!selected) return;

    setBusy(`restore-${versionId}`);
    setError(null);
    setNotice(null);

    try {
      const data = await api<{ skill: SkillDetail }>(`/api/pierrot/skills/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'restore', versionId }),
      });
      setSelected(data.skill);
      setForm(definitionToForm(data.skill.currentVersion?.definition || emptySkillDefinition()));
      setNotice('Вернул предыдущую проверенную версию.');
      await loadList();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось вернуть версию.');
    } finally {
      setBusy(null);
    }
  }

  const canApprove = useMemo(
    () => selected?.latestRun?.status === 'passed' && selected.status !== 'active',
    [selected]
  );

  return (
    <>
      <SkillAnalysisPanel onCreateDraft={createDraftFromAnalysis} />

      <div className="pw-skills">
        <div className="pw-skills-list">
          <div className="pw-skills-list-head">
            <label className="pw-label" style={{ flex: 1 }}>
              Поиск навыка
              <input
                className="pw-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="название или описание"
              />
            </label>
            <button type="button" className="pw-button pw-button-primary" onClick={beginCreate}>
              <FilePlus2 size={14} aria-hidden="true" />
              Новый
            </button>
            <button
              type="button"
              className="pw-button"
              onClick={() => void suggestFromMemory()}
              disabled={busy !== null}
            >
              {busy === 'suggest' ? (
                <Loader2 size={14} className="pw-spin" aria-hidden="true" />
              ) : (
                <Search size={14} aria-hidden="true" />
              )}
              Из памяти
            </button>
          </div>

          {loading ? (
            <p className="pw-inspector-empty">Загружаю навыки…</p>
          ) : skills.length === 0 ? (
            <p className="pw-inspector-empty">
              Навыков пока нет. Пьеро предложит черновик после повторяемой успешной процедуры;
              создать его вручную тоже можно.
            </p>
          ) : (
            <ul className="pw-skills-items">
              {skills.map((skill) => (
                <li key={skill.id}>
                  <button
                    type="button"
                    className={`pw-skill-item${selected?.id === skill.id ? ' is-active' : ''}`}
                    onClick={() => void openSkill(skill.id)}
                  >
                    <span className="pw-skill-item-name">{skill.name}</span>
                    <span className="pw-skill-item-meta">
                      {skillStatusLabel(skill.status)}
                      {skill.currentVersion ? ` · v${skill.currentVersion.version}` : ''}
                    </span>
                    <span className="pw-skill-item-description">{skill.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="pw-skills-detail">
          {error && <p className="pw-notice pw-notice-warning">{error}</p>}
          {notice && <p className="pw-notice">{notice}</p>}

          {(selected || creating) && (
            <>
              <div className="pw-skills-detail-head">
                <div>
                  <p className="pw-kicker">
                    {creating
                      ? 'новый черновик'
                      : `версия ${selected?.currentVersion?.version ?? 1}`}
                  </p>
                  <h2 className="pw-page-title" style={{ marginTop: 4 }}>
                    {form.name || 'Без названия'}
                  </h2>
                  {selected && (
                    <p className="pw-skill-item-meta">
                      {skillStatusLabel(selected.status)}
                      {selected.currentVersion
                        ? ` · активная версия ${selected.currentVersion.version}`
                        : ''}
                    </p>
                  )}
                </div>
                {!creating && selected && (
                  <button
                    type="button"
                    className="pw-icon-button"
                    onClick={() => {
                      setSelected(null);
                      setCreating(false);
                    }}
                    aria-label="Закрыть навык"
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                )}
              </div>

              <div className="pw-skills-form">
                <label className="pw-label">
                  Название
                  <input
                    className="pw-input"
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                  />
                </label>
                <label className="pw-label">
                  Описание
                  <textarea
                    className="pw-textarea"
                    value={form.description}
                    onChange={(event) => setForm({ ...form, description: event.target.value })}
                  />
                </label>
                <label className="pw-label">
                  Назначение
                  <textarea
                    className="pw-textarea"
                    value={form.purpose}
                    onChange={(event) => setForm({ ...form, purpose: event.target.value })}
                  />
                </label>
                <label className="pw-label">
                  Условия применения · по одному на строку
                  <textarea
                    className="pw-textarea"
                    value={form.conditions}
                    onChange={(event) => setForm({ ...form, conditions: event.target.value })}
                  />
                </label>
                <label className="pw-label">
                  Входные данные · по одному на строку
                  <textarea
                    className="pw-textarea"
                    value={form.inputs}
                    onChange={(event) => setForm({ ...form, inputs: event.target.value })}
                  />
                </label>
                <label className="pw-label">
                  Шаги · по одному на строку
                  <textarea
                    className="pw-textarea"
                    value={form.steps}
                    onChange={(event) => setForm({ ...form, steps: event.target.value })}
                    style={{ minHeight: 140 }}
                  />
                </label>
                <label className="pw-label">
                  Инструменты · по одному на строку
                  <textarea
                    className="pw-textarea"
                    value={form.tools}
                    onChange={(event) => setForm({ ...form, tools: event.target.value })}
                  />
                </label>
                <label className="pw-label">
                  Ограничения и безопасность · по одному на строку
                  <textarea
                    className="pw-textarea"
                    value={form.constraints}
                    onChange={(event) => setForm({ ...form, constraints: event.target.value })}
                  />
                </label>
                <label className="pw-label">
                  Ожидаемый результат
                  <textarea
                    className="pw-textarea"
                    value={form.expectedResult}
                    onChange={(event) => setForm({ ...form, expectedResult: event.target.value })}
                  />
                </label>
                <label className="pw-label">
                  Контрольные тесты · `name | input | expected`, по одному на строку
                  <textarea
                    className="pw-textarea"
                    value={form.tests}
                    onChange={(event) => setForm({ ...form, tests: event.target.value })}
                  />
                </label>
                <label className="pw-label">
                  Исторические примеры · `title | input | result | date`, по одному на строку
                  <textarea
                    className="pw-textarea"
                    value={form.examples}
                    onChange={(event) => setForm({ ...form, examples: event.target.value })}
                  />
                </label>
                <label className="pw-label">
                  Комментарий к версии
                  <input
                    className="pw-input"
                    value={form.changelog}
                    onChange={(event) => setForm({ ...form, changelog: event.target.value })}
                  />
                </label>

                <div className="pw-skills-actions">
                  <button
                    type="button"
                    className="pw-button pw-button-primary"
                    onClick={() => void saveVersion()}
                    disabled={busy !== null}
                  >
                    {busy === 'save' ? (
                      <Loader2 size={14} className="pw-spin" aria-hidden="true" />
                    ) : (
                      <Check size={14} aria-hidden="true" />
                    )}
                    {creating ? 'Создать черновик' : 'Сохранить как новую версию'}
                  </button>
                  {creating && (
                    <button type="button" className="pw-button" onClick={applyTemplate}>
                      Подставить шаблон
                    </button>
                  )}
                </div>
              </div>

              {!creating && selected && (
                <>
                  <div className="pw-skills-actions" style={{ marginTop: 18 }}>
                    <button
                      type="button"
                      className="pw-button"
                      onClick={() => void act('test')}
                      disabled={busy !== null}
                    >
                      Проверить
                    </button>
                    <button
                      type="button"
                      className="pw-button pw-button-primary"
                      onClick={() => void act('approve')}
                      disabled={busy !== null || !canApprove}
                    >
                      Утвердить
                    </button>
                    <button
                      type="button"
                      className="pw-button"
                      onClick={() => void act('disable')}
                      disabled={busy !== null || selected.status === 'disabled'}
                    >
                      Отключить
                    </button>
                  </div>

                  <div className="pw-skills-run">
                    <p className="pw-section-title">Последний тест</p>
                    <p className="pw-skill-item-meta">{runSummary(selected.latestRun)}</p>
                    {selected.latestRun && (
                      <ul>
                        {selected.latestRun.checks.map((check) => (
                          <li
                            key={`${check.phase || 'structural'}-${check.name}`}
                            data-passed={check.passed ? 'true' : 'false'}
                            data-phase={check.phase || 'structural'}
                          >
                            {check.passed ? '✓' : '×'} {check.phase ? `[${check.phase}] ` : ''}
                            {check.name}
                            {check.detail ? ` — ${check.detail}` : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="pw-skills-history">
                    <p className="pw-section-title">История версий</p>
                    <ul>
                      {selected.versions.map((version) => (
                        <li key={version.id}>
                          <span>
                            v{version.version} · {skillStatusLabel(version.status)} ·{' '}
                            {version.createdAt.slice(0, 10)}
                            {version.changelog ? ` — ${version.changelog}` : ''}
                          </span>
                          {version.id !== selected.currentVersionId && (
                            <button
                              type="button"
                              className="pw-button pw-button-small"
                              onClick={() => void restore(version.id)}
                              disabled={busy !== null}
                            >
                              <RotateCcw size={12} aria-hidden="true" />
                              Вернуть
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </>
          )}

          {!selected && !creating && (
            <div className="pw-skills-empty">
              <Search size={22} strokeWidth={1.2} aria-hidden="true" />
              <p className="pw-page-lede">
                Навык описывает повторяемую процедуру: условия, шаги, инструменты, ограничения и
                контрольные тесты. Он не заменяет память и не даёт новых прав.
              </p>
              <button type="button" className="pw-button" onClick={beginCreate}>
                Создать первый навык
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
