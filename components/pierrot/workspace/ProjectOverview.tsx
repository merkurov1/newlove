'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { PierrotProjectSnapshot } from '@/lib/pierrot/projects/types';

export default function ProjectOverview({ project: initial }: { project: PierrotProjectSnapshot }) {
  const [project, setProject] = useState(initial);
  const [brief, setBrief] = useState(initial.projectBrief);
  const [notice, setNotice] = useState('');
  async function saveBrief() {
    const response = await fetch(`/api/admin/pierrot/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectBrief: brief, briefRevision: project.briefRevision }),
    });
    if (!response.ok) {
      setNotice('Не удалось сохранить бриф.');
      return;
    }
    const data = await response.json();
    setProject((current) => ({ ...current, ...data.project }));
    setNotice('Бриф сохранён.');
  }
  return (
    <section className="pw-project-overview">
      <header className="pw-section-header">
        <div>
          <Link href="/admin/pierrot/projects">← Все проекты</Link>
          <p className="pw-eyebrow">PROJECT / {project.status}</p>
          <h1>{project.name}</h1>
          <p>{project.description || project.objective}</p>
        </div>
        <Link className="pw-button" href={`/admin/pierrot?new=1&project=${project.slug}`}>
          Новый разговор в проекте
        </Link>
      </header>
      <div className="pw-project-overview-grid">
        <article className="pw-project-panel pw-project-panel--brief">
          <h2>Project Brief</h2>
          <textarea value={brief} onChange={(event) => setBrief(event.target.value)} rows={12} />
          <div>
            <button onClick={() => void saveBrief()}>Сохранить бриф</button>
            {notice && <span>{notice}</span>}
          </div>
        </article>
        <ProjectList
          title="Решения"
          items={project.decisions.map((item) => `${item.title} · ${item.status}`)}
        />
        <ProjectList
          title="Задачи"
          items={project.tasks.map((item) => `${item.title} · ${item.status}`)}
        />
        <ProjectList
          title="Разговоры"
          items={project.conversations.map((item) => item.title || item.id)}
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

function ProjectList({ title, items }: { title: string; items: string[] }) {
  return (
    <article className="pw-project-panel">
      <h2>{title}</h2>
      {items.length ? (
        <ul>
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="pw-muted">Пока ничего не связано.</p>
      )}
    </article>
  );
}
