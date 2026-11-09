import { assertServerOnly } from '@/lib/serverOnly';
import type { WorkspaceSnapshotData } from './collect';
import type { GroomingProposal, ProjectHealth, WorkspaceHealth } from './types';
import { summaryIsStale } from './context';

assertServerOnly('lib/pierrot/grooming/health');

function projectForRecord(
  snapshot: WorkspaceSnapshotData,
  recordId: string,
  fallbackProject: string | null
): string | null {
  const linked = snapshot.linkedProjectIds.get(recordId) || [];
  if (linked.length === 1) return linked[0];
  if (fallbackProject) {
    const project = snapshot.projects.find(
      (item) =>
        item.name.toLowerCase() === fallbackProject.toLowerCase() ||
        item.slug.toLowerCase() === fallbackProject.toLowerCase()
    );
    if (project) return project.id;
  }
  return null;
}

export function computeProjectHealth(
  snapshot: WorkspaceSnapshotData,
  proposals: GroomingProposal[] | Array<Omit<GroomingProposal, 'id' | 'status' | 'selected' | 'ordinal'>>
): WorkspaceHealth {
  const now = Date.now();
  const globalUnlinkedTasks = snapshot.tasks.filter(
    (task) =>
      task.status === 'current' &&
      !task.project &&
      (snapshot.linkedProjectIds.get(task.id) || []).length === 0
  ).length;
  const projectHealth: ProjectHealth[] = snapshot.projects.map((project) => {
    const activeTasks = snapshot.tasks.filter(
      (task) =>
        task.status === 'current' &&
        projectForRecord(snapshot, task.id, task.project) === project.id
    );
    const staleTasks = activeTasks.filter((task) => {
      const updated = Date.parse(task.updatedAt);
      const due = task.reviewAt ? Date.parse(task.reviewAt) : Number.NaN;
      return (
        (Number.isFinite(due) && due < now) ||
        (Number.isFinite(updated) && now - updated > 180 * 24 * 60 * 60 * 1000)
      );
    });
    const unlinkedTasks = snapshot.tasks.filter(
      (task) =>
        task.status === 'current' &&
        (snapshot.linkedProjectIds.get(task.id) || []).length === 0 &&
        (task.project?.toLowerCase() === project.name.toLowerCase() ||
          task.project?.toLowerCase() === project.slug.toLowerCase())
    );
    const unresolvedDecisions = snapshot.decisions.filter(
      (record) =>
        record.status === 'uncertain' &&
        projectForRecord(snapshot, record.id, record.project) === project.id
    );
    const githubResults = snapshot.githubResults.filter(
      (result) =>
        projectForRecord(
          snapshot,
          result.taskId,
          snapshot.tasks.find((task) => task.id === result.taskId)?.project || null
        ) === project.id
    );
    const githubErrors = githubResults.filter(
      (result) => result.result === 'sync_error' || result.result === 'not_found'
    );
    const projectConversation = project.conversationId
      ? snapshot.conversations.find((conversation) => conversation.id === project.conversationId)
      : null;
    const staleSummary = project.conversationId
      ? !projectConversation?.summary || summaryIsStale(projectConversation.summaryGeneratedAt)
      : false;
    const duplicateCandidates = proposals.filter(
      (proposal) =>
        proposal.projectId === project.id &&
        (proposal.operation === 'merge_tasks' || proposal.operation === 'merge_memory')
    ).length;
    const pendingProposals = proposals.filter(
      (proposal) => proposal.projectId === project.id
    ).length;

    const reasons: string[] = [];
    if (staleTasks.length) reasons.push(`${staleTasks.length} устаревших задач`);
    if (githubErrors.length) reasons.push(`${githubErrors.length} ошибок GitHub`);
    if (unresolvedDecisions.length) reasons.push(`${unresolvedDecisions.length} спорных решений`);
    if (duplicateCandidates) reasons.push(`${duplicateCandidates} дублей`);
    if (staleSummary) reasons.push('резюме проекта устарело');
    if (unlinkedTasks.length) reasons.push(`${unlinkedTasks.length} задач без проекта`);

    const state =
      githubErrors.length > 0 || unresolvedDecisions.length > 0
        ? 'blocked'
        : reasons.length > 0
          ? 'attention'
          : 'healthy';

    return {
      projectId: project.id,
      projectName: project.name,
      projectSlug: project.slug,
      state,
      activeTasks: activeTasks.length,
      staleTasks: staleTasks.length,
      unlinkedTasks: unlinkedTasks.length,
      duplicateCandidates,
      unresolvedDecisions: unresolvedDecisions.length,
      githubErrors: githubErrors.length,
      staleSummary,
      pendingProposals,
      reasons,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    totalProjects: projectHealth.length,
    attentionProjects: projectHealth.filter((project) => project.state === 'attention').length,
    blockedProjects: projectHealth.filter((project) => project.state === 'blocked').length,
    staleTasks: projectHealth.reduce((sum, project) => sum + project.staleTasks, 0),
    unlinkedTasks: globalUnlinkedTasks,
    duplicateCandidates: projectHealth.reduce(
      (sum, project) => sum + project.duplicateCandidates,
      0
    ),
    githubErrors: projectHealth.reduce((sum, project) => sum + project.githubErrors, 0),
    staleSummaries: snapshot.summaryCandidates.length,
    projects: projectHealth,
  };
}
