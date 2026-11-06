'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { PierrotProject } from '@/lib/pierrot/projects/types';

export default function ProjectsWorkspace({
  initialProjects,
}: {
  initialProjects: PierrotProject[];
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [name, setName] = useState('');
  const [brief, setBrief] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    const response = await fetch('/api/admin/pierrot/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, projectBrief: brief }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'Не удалось создать проект.');
      return;
    }
    setProjects((current) => [data.project, ...current]);
    setName('');
    setBrief('');
  }

  return (
    <section className="pw-projects">
      <header className="pw-section-header">
        <div>
          <p className="pw-eyebrow">PIERROT / WORKSPACES</p>
          <h1>Проекты</h1>
          <p>Постоянный контекст для работы между разговорами.</p>
        </div>
      </header>
      <div className="pw-project-grid">
        {projects.map((project) => (
          <Link
            className="pw-project-card"
            href={`/admin/pierrot/projects/${project.slug}`}
            key={project.id}
          >
            <span className="pw-project-status">{project.status}</span>
            <h2>{project.name}</h2>
            <p>
              {project.description || project.objective || project.projectBrief || 'Без описания.'}
            </p>
            <small>
              Последняя активность: {new Date(project.lastActivityAt).toLocaleDateString('ru-RU')}
            </small>
          </Link>
        ))}
        <div className="pw-project-card pw-project-card--new">
          <h2>Новый проект</h2>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Название"
          />
          <textarea
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            placeholder="Короткий проверяемый бриф"
            rows={4}
          />
          <button onClick={() => void create()} disabled={!name.trim()}>
            Создать
          </button>
          {error && <p role="alert">{error}</p>}
        </div>
      </div>
    </section>
  );
}
