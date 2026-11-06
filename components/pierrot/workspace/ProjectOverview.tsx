'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { PierrotProjectSnapshot } from '@/lib/pierrot/projects/types';
import { getProjectStatusSummary } from '@/lib/pierrot/projects/status';

export default function ProjectOverview({ project: initial }: { project: PierrotProjectSnapshot }) {
  const [project, setProject] = useState(initial);
  const [notice, setNotice] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);
  const statusSummary = getProjectStatusSummary(project);
  async function setStatus(status: 'active' | 'paused' | 'archived') {
    setSavingStatus(true);
    setNotice('');
    try {
      const response = await fetch(`/api/admin/pierrot/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'status_failed');
      setProject((current) => ({ ...current, ...data.project }));
      setNotice(
        status === 'paused'
          ? 'Проект приостановлен.'
          : status === 'archived'
            ? 'Проект архивирован.'
            : 'Проект возобновлён.'
      );
    } catch {
      setNotice('Не удалось изменить статус проекта.');
    } finally {
      setSavingStatus(false);
    }
  }
  return (
    <section className="pw-project-overview">
      <header className="pw-section-header">
        <div>
          <Link href="/admin/pierrot/projects">← Все проекты</Link>
          <p className="pw-eyebrow">PROJECT / {project.status}</p>
          <h1>{project.name}</h1>
          <p>
            {project.description || project.objective || 'Постоянное рабочее пространство Pierrot.'}
          </p>
          <small>
            {statusSummary.label}
            {project.ownerRating ? ` · оценка ${project.ownerRating}/10` : ''} · последняя
            активность{' '}
            {project.lastActivityAt
              ? new Date(project.lastActivityAt).toLocaleDateString('ru-RU')
              : '—'}
          </small>
        </div>
        <div>
          <Link
            className="pw-project-open-chat"
            href={`/admin/pierrot?project=${encodeURIComponent(project.slug)}`}
          >
            Открыть постоянный чат →
          </Link>
          {project.status === 'active' ? (
            <button type="button" onClick={() => void setStatus('paused')} disabled={savingStatus}>
              Приостановить
            </button>
          ) : project.status === 'paused' ? (
            <button type="button" onClick={() => void setStatus('active')} disabled={savingStatus}>
              Возобновить
            </button>
          ) : null}
          {project.status !== 'archived' && (
            <button
              type="button"
              onClick={() => void setStatus('archived')}
              disabled={savingStatus}
            >
              Архивировать
            </button>
          )}
        </div>
      </header>
      <div className="pw-project-overview-grid">
        <article className="pw-project-panel pw-project-panel--status">
          <h2>Статус проекта</h2>
          <p>{statusSummary.explanation}</p>
          <p className="pw-muted">
            Обновлено:{' '}
            {project.updatedAt ? new Date(project.updatedAt).toLocaleDateString('ru-RU') : '—'}
          </p>
        </article>
        <article className="pw-project-panel pw-project-panel--brief">
          <h2>Что известно о проекте</h2>
          <p>
            {project.projectBrief ||
              project.objective ||
              project.description ||
              'Pierrot пока ничего не знает об этом проекте.'}
          </p>
          {project.latestReview?.summary && (
            <>
              <h2>Последняя ревизия</h2>
              <p>{project.latestReview.summary}</p>
              <p className="pw-muted">
                {project.latestReview.completedAt
                  ? new Date(project.latestReview.completedAt).toLocaleDateString('ru-RU')
                  : ''}
              </p>
            </>
          )}
          <p className="pw-muted">
            Чтобы добавить контекст, открой постоянный чат проекта и напиши Pierrot о цели, состоянии
            и важных решениях. Команда «Наведи порядок в проекте» запускает ревизию.
          </p>
        </article>
        <ProjectList
          title="Решения"
          items={project.decisions
            .filter((item) => item.kind !== 'task' && item.kind !== 'reminder')
            .map((item) => `${item.title} · ${item.status}`)}
        />
        <ProjectList
          title="Задачи"
          items={project.tasks.map((item) => `${item.title} · ${item.status}`)}
        />
        <ProjectList
          title="Разговоры"
          items={project.conversations.map((item) => ({
            label: item.title || item.id,
            href: `/admin/pierrot?conversation=${encodeURIComponent(item.id)}&project=${encodeURIComponent(project.slug)}`,
          }))}
        />
        <ProjectList
          title="Знания"
          items={project.knowledge.map((item) => item.title || item.id)}
        />
        <ProjectList
          title="Артефакты"
          items={project.artifacts.map((item) => `${item.title} · ${item.artifactType}`)}
        />
      </div>
    </section>
  );
}

function ProjectList({
  title,
  items,
}: {
  title: string;
  items: Array<string | { label: string; href: string }>;
}) {
  return (
    <article className="pw-project-panel">
      <h2>{title}</h2>
      {items.length ? (
        <ul>
          {items.map((item, index) => (
            <li key={`${typeof item === 'string' ? item : item.label}-${index}`}>
              {typeof item === 'string' ? item : <Link href={item.href}>{item.label}</Link>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="pw-muted">Пока ничего не связано.</p>
      )}
    </article>
  );
}
