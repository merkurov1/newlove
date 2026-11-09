'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ProjectRailItem, ProjectRailSession } from '@/lib/pierrot/workspace/types';

function formatSessionActivity(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  return new Intl.DateTimeFormat('ru-RU', {
    ...(sameDay ? {} : { day: '2-digit', month: 'short' }),
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function SessionLink({
  session,
  activeSessionId,
}: {
  session: ProjectRailSession;
  activeSessionId: string | null;
}) {
  const href = `/admin/pierrot?history=${encodeURIComponent(
    session.historyId
  )}&session=${encodeURIComponent(session.id)}`;

  return (
    <Link
      href={href}
      className="pw-project-rail-session"
      aria-current={activeSessionId === session.id ? 'page' : undefined}
    >
      <span className="pw-project-rail-session-title">{session.title}</span>
      <span className="pw-project-rail-session-meta">
        {formatSessionActivity(session.lastActivityAt)}
        {session.messageCount > 0 ? ` · ${session.messageCount}` : ''}
      </span>
    </Link>
  );
}

export default function ProjectRail({
  projects,
  activeHistoryId,
  activeSessionId,
}: {
  projects: ProjectRailItem[];
  activeHistoryId: string | null;
  activeSessionId?: string | null;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const activeProjectId = useMemo(() => {
    if (!activeHistoryId) return null;
    return projects.find((project) => project.historyId === activeHistoryId)?.id || null;
  }, [activeHistoryId, projects]);

  function toggle(projectId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  if (projects.length === 0) return null;

  return (
    <nav className="pw-project-rail" aria-label="Проекты Pierrot">
      <div className="pw-project-rail-scroll">
        {projects.map((project) => {
          const expanded = expandedIds.has(project.id);
          const active = activeProjectId === project.id;
          const sessionsId = `pw-project-sessions-${project.id}`;

          return (
            <section
              key={project.id}
              className="pw-project-rail-card"
              data-active={active ? 'true' : 'false'}
              data-expanded={expanded ? 'true' : 'false'}
            >
              <div className="pw-project-rail-card-head">
                <Link
                  href={project.chatHref}
                  className="pw-project-rail-link"
                  aria-current={active ? 'page' : undefined}
                  aria-label={`Открыть общий чат проекта ${project.name}`}
                >
                  <span className="pw-project-rail-name">{project.name}</span>
                </Link>
                <button
                  type="button"
                  className="pw-project-rail-toggle"
                  onClick={() => toggle(project.id)}
                  aria-expanded={expanded}
                  aria-controls={sessionsId}
                  aria-label={
                    expanded
                      ? `Свернуть сессии проекта ${project.name}`
                      : `Раскрыть сессии проекта ${project.name}`
                  }
                  title={expanded ? 'Свернуть сессии' : 'Показать сессии'}
                >
                  <span aria-hidden="true">{expanded ? '−' : '+'}</span>
                </button>
              </div>

              {expanded && (
                <div
                  id={sessionsId}
                  className="pw-project-rail-sessions"
                  aria-label={`Сессии проекта ${project.name}`}
                >
                  {project.sessions.length === 0 ? (
                    <p className="pw-project-rail-empty">Нет активных сессий</p>
                  ) : (
                    project.sessions.map((session) => (
                      <SessionLink
                        key={session.id}
                        session={session}
                        activeSessionId={activeSessionId || null}
                      />
                    ))
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </nav>
  );
}
