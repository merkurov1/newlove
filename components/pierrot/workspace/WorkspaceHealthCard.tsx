'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { WorkspaceHealth } from '@/lib/pierrot/grooming/types';

export default function WorkspaceHealthCard() {
  const [health, setHealth] = useState<WorkspaceHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/pierrot/workspace-health');
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Не удалось проверить состояние.');
      setHealth(data.health as WorkspaceHealth);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось проверить состояние.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="pw-workspace-health" aria-label="Состояние рабочей среды">
      <div className="pw-workspace-health-head">
        <div>
          <span className="pw-eyebrow">WORKSPACE HEALTH</span>
          <h2>Состояние рабочей среды</h2>
          <p>
            Проверка задач, памяти, проектов, GitHub-связей и резюме. Проверка ничего не меняет.
          </p>
        </div>
        <button type="button" onClick={() => void check()} disabled={loading}>
          {loading ? 'Проверяем…' : health ? 'Проверить снова' : 'Проверить состояние'}
        </button>
      </div>

      {error && <p className="pw-workspace-health-error">{error}</p>}

      {health && (
        <>
          <div className="pw-workspace-health-metrics">
            <span>Проектов: {health.totalProjects}</span>
            <span>Требуют внимания: {health.attentionProjects}</span>
            <span>Заблокировано: {health.blockedProjects}</span>
            <span>Устаревших задач: {health.staleTasks}</span>
            <span>Без проекта: {health.unlinkedTasks}</span>
            <span>Дублей: {health.duplicateCandidates}</span>
            <span>GitHub-ошибок: {health.githubErrors}</span>
            <span>Устаревших резюме: {health.staleSummaries}</span>
          </div>
          <ul className="pw-workspace-health-projects">
            {health.projects.map((project) => (
              <li key={project.projectId}>
                <span className={`pw-workspace-health-state pw-workspace-health-state--${project.state}`}>
                  {project.state}
                </span>
                <Link href={`/admin/pierrot?project=${encodeURIComponent(project.projectSlug)}`}>
                  {project.projectName}
                </Link>
                <span>
                  {project.reasons.length > 0
                    ? project.reasons.join('; ')
                    : 'Актуально; действий не требуется.'}
                </span>
              </li>
            ))}
          </ul>
          <p className="pw-muted">
            Изменения выполняются только через команду «Наведи порядок» и подтверждение плана.
          </p>
        </>
      )}
    </section>
  );
}
