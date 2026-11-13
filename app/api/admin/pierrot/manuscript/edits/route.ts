import { NextResponse } from 'next/server';
import { getServerSupabaseClient, requireAdminFromRequest } from '@/lib/serverAuth';
import {
  approveManuscriptEdit,
  buildEditDiff,
  listManuscriptEditProposals,
  listManuscriptRevisions,
  proposeManuscriptEdit,
  rejectManuscriptEdit,
} from '@/lib/pierrot/editorial/edits';
import { loadUnframedProject } from '@/lib/pierrot/editorial/project';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function projectFor(ownerUserId: string) {
  const state = await loadUnframedProject({
    ownerUserId,
    includeManuscript: false,
  });
  return state.project;
}

export async function GET(request: Request) {
  try {
    const admin = await requireAdminFromRequest(request);
    const project = await projectFor(admin.id);
    if (!project) {
      return NextResponse.json(
        { error: 'UNFRAMED project not found', code: 'project_not_found' },
        { status: 404 }
      );
    }

    const [proposals, revisions] = await Promise.all([
      listManuscriptEditProposals({
        ownerUserId: admin.id,
        projectId: project.id,
      }),
      listManuscriptRevisions({
        ownerUserId: admin.id,
        projectId: project.id,
      }),
    ]);

    if (proposals.error) {
      return NextResponse.json(
        { error: proposals.error, code: 'proposal_query_failed' },
        { status: 500 }
      );
    }
    if (revisions.error) {
      return NextResponse.json(
        { error: revisions.error, code: 'revision_query_failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      project: { id: project.id, slug: project.slug, name: project.name },
      proposals: proposals.proposals.map((proposal) => ({
        ...proposal,
        diff: buildEditDiff(proposal.original, proposal.proposed),
      })),
      revisions: revisions.revisions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Editorial request failed';
    return NextResponse.json(
      { error: message },
      { status: message === 'Unauthorized' ? 401 : 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdminFromRequest(request);
    const project = await projectFor(admin.id);
    if (!project) {
      return NextResponse.json(
        { error: 'UNFRAMED project not found', code: 'project_not_found' },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const result = await proposeManuscriptEdit({
      store: getServerSupabaseClient({ useServiceRole: true }),
      ownerUserId: admin.id,
      projectId: project.id,
      conversationId:
        typeof body?.conversationId === 'string' ? body.conversationId : null,
      chapterNumber:
        typeof body?.chapterNumber === 'number' ? body.chapterNumber : null,
      chunkId: typeof body?.chunkId === 'string' ? body.chunkId : '',
      original: typeof body?.original === 'string' ? body.original : '',
      proposed: typeof body?.proposed === 'string' ? body.proposed : '',
      rationale: typeof body?.rationale === 'string' ? body.rationale : '',
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.error },
        { status: result.error === 'chunk_not_found' || result.error === 'original_not_in_source' ? 400 : 422 }
      );
    }

    return NextResponse.json(
      {
        proposal: result.proposal,
        diff: buildEditDiff(result.proposal.original, result.proposal.proposed),
        source_modified: false,
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Proposal failed';
    return NextResponse.json(
      { error: message },
      { status: message === 'Unauthorized' ? 401 : 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdminFromRequest(request);
    const project = await projectFor(admin.id);
    if (!project) {
      return NextResponse.json(
        { error: 'UNFRAMED project not found', code: 'project_not_found' },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const proposalId = typeof body?.proposalId === 'string' ? body.proposalId : '';
    const action = body?.action === 'approve' || body?.action === 'reject' ? body.action : null;
    if (!proposalId || !action) {
      return NextResponse.json(
        { error: 'proposalId and action are required', code: 'invalid_request' },
        { status: 400 }
      );
    }

    if (action === 'approve') {
      const result = await approveManuscriptEdit({
        store: getServerSupabaseClient({ useServiceRole: true }),
        ownerUserId: admin.id,
        projectId: project.id,
        proposalId,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error, code: result.error }, { status: 409 });
      }
      return NextResponse.json({
        revision: result.revision,
        source_modified: false,
        note:
          'Approved revision stored separately. The canonical manuscript source was not overwritten.',
      });
    }

    const result = await rejectManuscriptEdit({
      store: getServerSupabaseClient({ useServiceRole: true }),
      ownerUserId: admin.id,
      projectId: project.id,
      proposalId,
      reason: typeof body?.reason === 'string' ? body.reason : '',
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.error }, { status: 409 });
    }
    return NextResponse.json({ rejected: true, source_modified: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Review failed';
    return NextResponse.json(
      { error: message },
      { status: message === 'Unauthorized' ? 401 : 500 }
    );
  }
}
