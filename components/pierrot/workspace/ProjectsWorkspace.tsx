'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PierrotProject } from '@/lib/pierrot/projects/types';

function projectHref(project: PierrotProject): string {
  return `/admin/pierrot?project=${encodeURIComponent(project.slug)}`;
}

function formatActivity(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export default function ProjectsWorkspace({
  initialProjects,
}: {
  initialProjects: PierrotProject[];
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  async function create() {
    if (creating || !name.trim()) return;
    setError(null);
    setCreating(true);
    try {
      const response = await fetch('/api/admin/pierrot/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || 'Не удалось создать проект.');
        return;
      }
      setProjects((current) => [data.project, ...current]);
      setName('');
      router.push(projectHref(data.project as PierrotProject));
    } catch {
      setError('Сеть недоступна. Проект не создан.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="pw-project-catalog">
      <header className="pw-project-catalog-head">
        <p className="pw-kicker">Pierrot · contexts</p>
        <h1>Проекты</h1>
        <p>Рабочие контексты с собственной памятью, задачами и историей.</p>
      </header>

      <div className="pw-project-catalog-list">
        {projects.map((project, index) => (
          <article className="pw-project-row" key={project.id}>
            <span className="pw-project-index">{String(index + 1).padStart(2, '0')}</span>
            <div className="pw-project-row-main">
              <Link href={projectHref(project)} className="pw-project-row-link">
                <span className="pw-project-row-heading">
                  <h2>{project.name}</h2>
                  <span className="pw-project-row-status">{project.status}</span>
                </span>
                <p>
                  {project.description ||
                    project.objective ||
                    project.projectBrief ||
                    'Контекст без описания.'}
                </p>
              </Link>
              <div className="pw-project-row-meta">
                {project.ownerRating ? <span>Оценка {project.ownerRating}/10</span> : null}
                {project.lastActivityAt ? (
                  <span>Активность {formatActivity(project.lastActivityAt)}</span>
                ) : null}
                {project.slug === 'art-engine' ? (
                  <Link href="/admin/pierrot/art-engine" className="pw-project-context-link">
                    Art Engine →
                  </Link>
                ) : null}
              </div>
            </div>
          </article>
        ))}

        <div className="pw-project-new-row">
          <span className="pw-project-index">＋</span>
          <div className="pw-project-new-body">
            <label htmlFor="pw-project-name">Новый проект</label>
            <div className="pw-project-new-controls">
              <input
                id="pw-project-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void create();
                  }
                }}
                placeholder="Название контекста"
              />
              <button type="button" onClick={() => void create()} disabled={!name.trim() || creating}>
                {creating ? 'Создаём…' : 'Создать'}
              </button>
            </div>
            {error ? <p role="alert">{error}</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
