import type { Metadata } from 'next';
import Link from 'next/link';
import { getServerSupabaseClient, requireAdmin } from '@/lib/serverAuth';
import {
  buildEditDiff,
  listManuscriptEditProposals,
  listManuscriptRevisions,
} from '@/lib/pierrot/editorial/edits';
import {
  loadEditorialContext,
  loadEditorialDiagnostics,
} from '@/lib/pierrot/editorial/context';
import { listEpisodeRecords } from '@/lib/pierrot/editorial/episodes';
import { loadStoredEditorialProfile } from '@/lib/pierrot/editorial/profile';
import { formatProjectState, loadUnframedProject } from '@/lib/pierrot/editorial/project';
import { formatCoverage, manuscriptPartCount } from '@/lib/knowledge/rag/manuscriptStructure';
import ManuscriptEditingPanel from './ManuscriptEditingPanel';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'UNFRAMED — редакция',
  robots: { index: false, follow: false },
};

function coverageTone(value: number | null | undefined): string {
  if (typeof value !== 'number') return '#6b6255';
  if (value >= 0.97) return '#1f6b3a';
  if (value >= 0.9) return '#8a5a10';
  return '#8a1f1f';
}

export default async function UnframedManuscriptPage() {
  const admin = await requireAdmin();
  const state = await loadUnframedProject({
    ownerUserId: admin.id,
    includeManuscript: true,
  });
  const project = state.project;
  const store = getServerSupabaseClient({ useServiceRole: true });

  const [proposalResult, revisionResult, diagnosticResult, contextResult, episodeResult, profileResult] =
    await Promise.all([
      project
        ? listManuscriptEditProposals({ ownerUserId: admin.id, projectId: project.id })
        : Promise.resolve({ proposals: [], error: null }),
      project
        ? listManuscriptRevisions({ ownerUserId: admin.id, projectId: project.id })
        : Promise.resolve({ revisions: [], error: null }),
      loadEditorialDiagnostics({
        store,
        conversationId: project?.conversationId || '',
        limit: 20,
      }),
      loadEditorialContext({ store, conversationId: project?.conversationId || '' }),
      project
        ? listEpisodeRecords({
            ownerUserId: admin.id,
            projectId: project.id,
            store,
            limit: 300,
          })
        : Promise.resolve({ episodes: [], error: null }),
      project
        ? loadStoredEditorialProfile({
            ownerUserId: admin.id,
            projectId: project.id,
            store,
          })
        : Promise.resolve({ id: null, revision: 0, markdown: '', data: null, error: null }),
    ]);

  const manuscript = state.manuscript;
  const coverage = manuscript?.coverage || null;
  const context = contextResult.context;

  return (
    <div className="pw-page">
      <div className="pw-page-inner">
        <p className="pw-kicker">UNFRAMED · owner diagnostics</p>
        <h1 className="pw-page-title">Редакция и диагностика</h1>
        <p className="pw-page-lede">
          Активный проект, документ, покрытие рукописи, стратегия извлечения и история ревизий.
          Оригинал неизменяем: одобренные правки хранятся отдельными ревизиями.
        </p>

        <p>
          <Link href="/admin/pierrot?project=unframed">← Вернуться в чат UNFRAMED</Link>
        </p>

        <section style={{ marginTop: 24 }}>
          <h2>Активный контекст</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <th style={{ textAlign: 'left', width: 220 }}>Project</th>
                <td>{project ? `${project.name} (${project.slug})` : 'не найден'}</td>
              </tr>
              <tr>
                <th style={{ textAlign: 'left' }}>Project brief</th>
                <td>
                  {project?.projectBrief.trim()
                    ? `r${project.briefRevision}, ${project.projectBrief.length} символов`
                    : 'пуст'}
                </td>
              </tr>
              <tr>
                <th style={{ textAlign: 'left' }}>Document</th>
                <td>
                  {manuscript
                    ? `${manuscript.document.title} (${manuscript.document.id})`
                    : state.manuscriptUnavailable || 'недоступен'}
                </td>
              </tr>
              <tr>
                <th style={{ textAlign: 'left' }}>Source</th>
                <td>{manuscript?.document.sourcePath || '—'}</td>
              </tr>
              <tr>
                <th style={{ textAlign: 'left' }}>Coverage</th>
                <td style={{ color: coverageTone(coverage?.coverageRatio) }}>
                  {coverage ? formatCoverage(coverage) : '—'}
                </td>
              </tr>
              <tr>
                <th style={{ textAlign: 'left' }}>Chunk integrity</th>
                <td>
                  {coverage
                    ? coverage.complete
                      ? 'последовательно; пропусков и дублей нет'
                      : coverage.warnings.join(', ')
                    : '—'}
                </td>
              </tr>
              <tr>
                <th style={{ textAlign: 'left' }}>Last context</th>
                <td>
                  {context?.activeTask
                    ? `${context.activeTask} · ${context.lastRetrievalScope || '—'} · chapter ${
                        context.activeChapterNumber ?? '—'
                      } · ${context.updatedAt?.slice(0, 16).replace('T', ' ') || '—'}`
                    : 'ещё не записан в этой сессии'}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section style={{ marginTop: 24 }}>
          <h2>Текущий эпизод</h2>
          {episodeResult.error ? (
            <p style={{ color: '#8a1f1f' }}>Реестр эпизодов недоступен: {episodeResult.error}</p>
          ) : episodeResult.episodes.length === 0 ? (
            <p>Эпизодов пока нет. Начните в чате: «Найди пять историй для следующего эпизода».</p>
          ) : (
            (() => {
              const active =
                episodeResult.episodes.find(
                  (episode) => episode.number === context?.activeEpisodeNumber
                ) ||
                episodeResult.episodes
                  .filter(
                    (episode) =>
                      episode.status !== 'PUBLISHED' && episode.status !== 'ARCHIVED'
                  )
                  .sort((left, right) => right.number - left.number)[0] ||
                episodeResult.episodes[episodeResult.episodes.length - 1];
              return (
                <div>
                  <p>
                    <strong>
                      Episode {active.number} — {active.title}
                    </strong>{' '}
                    · {active.status} · {active.chapterLabel || 'глава не записана'}
                  </p>
                  <p>
                    Script: {active.approvedScriptId ? 'approved' : active.scriptId ? 'draft' : 'none'} ·
                    Video: {active.videoUrl || 'not recorded'} · Page:{' '}
                    {active.publicPageUrl || 'not created'}
                  </p>
                  <p>
                    <Link href="/admin/pierrot?project=unframed">
                      Продолжить в чате →
                    </Link>
                  </p>
                </div>
              );
            })()
          )}
        </section>

        <section style={{ marginTop: 24 }}>
          <h2>Реестр эпизодов</h2>
          {episodeResult.episodes.length === 0 ? (
            <p>Пусто.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>#</th>
                    <th style={{ textAlign: 'left' }}>Title</th>
                    <th style={{ textAlign: 'left' }}>Status</th>
                    <th style={{ textAlign: 'left' }}>Chapter</th>
                    <th style={{ textAlign: 'left' }}>Script</th>
                    <th style={{ textAlign: 'left' }}>Video</th>
                  </tr>
                </thead>
                <tbody>
                  {episodeResult.episodes.map((episode) => (
                    <tr key={episode.id} style={{ borderTop: '1px solid #e6e0d4' }}>
                      <td>{episode.number}</td>
                      <td>{episode.title}</td>
                      <td>{episode.status}</td>
                      <td>{episode.chapterLabel || '—'}</td>
                      <td>
                        {episode.approvedScriptId
                          ? 'approved'
                          : episode.scriptId
                            ? 'draft'
                            : '—'}
                      </td>
                      <td>{episode.videoUrl ? 'yes' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section style={{ marginTop: 24 }}>
          <h2>Editorial profile</h2>
          {profileResult.error ? (
            <p style={{ color: '#8a1f1f' }}>Профиль недоступен: {profileResult.error}</p>
          ) : profileResult.markdown ? (
            <details>
              <summary>r{profileResult.revision} · {profileResult.markdown.length} символов</summary>
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                {profileResult.markdown}
              </pre>
            </details>
          ) : (
            <p>Профиль ещё не сформирован. Он создастся при первом project overview в чате.</p>
          )}
        </section>

        <section style={{ marginTop: 24 }}>
          <h2>Структура</h2>
          {manuscript ? (
            <>
              <p>
                {manuscriptPartCount(manuscript.structure)} частей · {manuscript.structure.chapters.length}{' '}
                глав/разделов · {manuscript.chunks.length} фрагментов
              </p>
              <details>
                <summary>Оглавление с диапазонами chunks</summary>
                <ul style={{ columns: 2, gap: 28 }}>
                  {manuscript.structure.chapters.map((chapter) => (
                    <li key={chapter.key}>
                      {chapter.label} — {chapter.startChunkIndex}–{chapter.endChunkIndex} ·{' '}
                      {chapter.charEnd - chapter.charStart} симв.
                    </li>
                  ))}
                </ul>
              </details>
            </>
          ) : (
            <p>Структура недоступна: {state.manuscriptUnavailable || 'unknown'}.</p>
          )}
        </section>

        <section style={{ marginTop: 24 }}>
          <h2>Проект</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
            {formatProjectState(state)}
          </pre>
        </section>

        <section style={{ marginTop: 24 }}>
          <h2>Диагностика операций</h2>
          <p style={{ color: '#6b6255' }}>
            Показывает, почему Pierrot сделал вывод: стратегия, сколько фрагментов вернулось,
            покрытие, обрезка и ошибки источника. Текст рукописи здесь не логируется.
          </p>
          {diagnosticResult.error ? (
            <p style={{ color: '#8a1f1f' }}>
              Диагностика недоступна: {diagnosticResult.error}. Это ошибка чтения, а не отсутствие
              операций.
            </p>
          ) : null}
          {diagnosticResult.diagnostics.length === 0 ? (
            <p>Записей пока нет.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Время</th>
                    <th style={{ textAlign: 'left' }}>Операция</th>
                    <th style={{ textAlign: 'left' }}>Стратегия</th>
                    <th style={{ textAlign: 'right' }}>Chunks</th>
                    <th style={{ textAlign: 'right' }}>Coverage</th>
                    <th style={{ textAlign: 'left' }}>Truncated</th>
                    <th style={{ textAlign: 'left' }}>Finish</th>
                    <th style={{ textAlign: 'left' }}>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {diagnosticResult.diagnostics.map((row) => {
                    const payload = row.payload;
                    const diagnostics =
                      payload && typeof payload.diagnostics === 'object' && payload.diagnostics
                        ? (payload.diagnostics as Record<string, unknown>)
                        : payload;
                    const chunkCount = diagnostics.chunk_count ?? diagnostics.chunkCount;
                    const ratio = diagnostics.coverage;
                    const errors = Array.isArray(diagnostics.errors)
                      ? diagnostics.errors.join(', ')
                      : '';
                    return (
                      <tr key={row.id} style={{ borderTop: '1px solid #e6e0d4' }}>
                        <td>{row.createdAt?.slice(0, 16).replace('T', ' ') || '—'}</td>
                        <td>{String(diagnostics.operation || '—')}</td>
                        <td>{String(diagnostics.retrieval_strategy || '—')}</td>
                        <td style={{ textAlign: 'right' }}>{String(chunkCount ?? '—')}</td>
                        <td style={{ textAlign: 'right' }}>
                          {typeof ratio === 'number' ? `${(ratio * 100).toFixed(1)}%` : '—'}
                        </td>
                        <td>{diagnostics.truncated ? 'yes' : 'no'}</td>
                        <td>{String(diagnostics.finish_reason || '—')}</td>
                        <td>{errors || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section style={{ marginTop: 24 }}>
          <h2>Ревизии</h2>
          {revisionResult.error ? (
            <p style={{ color: '#8a1f1f' }}>Ревизии недоступны: {revisionResult.error}</p>
          ) : revisionResult.revisions.length === 0 ? (
            <p>Одобренных ревизий пока нет.</p>
          ) : (
            <ul>
              {revisionResult.revisions.map((revision) => (
                <li key={revision.id}>
                  r{revision.revision} · {revision.chapterLabel || revision.chunkId} ·{' '}
                  {revision.approvedAt.slice(0, 10)} · hash {revision.contentHash.slice(0, 12)}…
                </li>
              ))}
            </ul>
          )}
        </section>

        <section style={{ marginTop: 24 }}>
          <ManuscriptEditingPanel
            proposals={proposalResult.proposals.map((proposal) => ({
              id: proposal.id,
              chapterLabel: proposal.chapterLabel,
              status: proposal.status,
              original: proposal.original,
              proposed: proposal.proposed,
              rationale: proposal.rationale,
              createdAt: proposal.createdAt,
              diff: buildEditDiff(proposal.original, proposal.proposed),
            }))}
          />
          {proposalResult.error ? (
            <p style={{ color: '#8a1f1f' }}>Предложения недоступны: {proposalResult.error}</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
