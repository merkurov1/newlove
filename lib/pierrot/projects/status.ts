import type { PierrotProjectSnapshot } from './types';

export type ProjectStatusSummary = {
  label: string;
  explanation: string;
};

/**
 * Project status is deliberately derived only from the project's own records.
 * Site analytics and the global Pierrot activity state never enter this path.
 */
export function getProjectStatusSummary(project: PierrotProjectSnapshot): ProjectStatusSummary {
  if (project.status === 'archived') {
    return { label: 'Архивирован', explanation: 'Проект находится в архиве.' };
  }
  if (project.status === 'paused') {
    return { label: 'Приостановлен', explanation: 'Работа по проекту приостановлена.' };
  }

  const activeTasks = project.tasks.filter(
    (task) => !['verified', 'completed', 'archived', 'cancelled'].includes(task.status)
  ).length;
  const hasProjectData = Boolean(
    project.projectBrief ||
    project.description ||
    project.objective ||
    project.decisions.length ||
    project.tasks.length ||
    project.conversations.length ||
    project.knowledge.length ||
    project.artifacts.length
  );

  if (!hasProjectData) {
    return {
      label: 'Недостаточно данных',
      explanation: 'Расскажи Pierrot о цели проекта, чтобы зафиксировать его состояние.',
    };
  }
  if (activeTasks > 0) {
    return {
      label: 'В работе',
      explanation: `${activeTasks} ${activeTasks === 1 ? 'активная задача' : 'активных задач'} в проекте.`,
    };
  }
  return {
    label: 'Активен',
    explanation: 'Проект активен; новых незавершённых задач сейчас не зафиксировано.',
  };
}
