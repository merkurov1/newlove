import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { generateFlowContext } from '@/lib/flow/ai';
import {
  flowAiContextErrorPayload,
  flowAiContextGeneratingPayload,
  flowAiContextReadyPayload,
} from '@/lib/flow/aiContext';
import { isFlowAiRagEnabled } from '@/lib/knowledge/rag/flowRetrieval';

export const dynamic =
  'force-dynamic';

export const runtime =
  'nodejs';

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function errorMessage(
  error: unknown,
) {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message ===
      'string'
  ) {
    return error.message;
  }

  return 'Unknown server error.';
}

export async function POST(
  req: NextRequest,
  context: RouteContext,
) {
  try {
    await requireAdminFromRequest(
      req,
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          errorMessage(error),
      },
      { status: 401 },
    );
  }

  const { id } =
    await context.params;

  const supabase =
    createClient({
      useServiceRole: true,
    });

  try {
    const {
      data: item,
      error: itemError,
    } = await supabase
      .from('items')
      .select(
        'id,type,title,body_md,source_url,metadata,lang,ai_allowed,rag_allowed,status,visibility',
      )
      .eq('id', id)
      .maybeSingle();

    if (itemError) {
      throw itemError;
    }

    if (!item) {
      return NextResponse.json(
        {
          error:
            'Item not found.',
        },
        { status: 404 },
      );
    }

    if (
      item.status !==
        'published' ||
      item.visibility !==
        'public'
    ) {
      return NextResponse.json(
        {
          error:
            'Only public published items can receive Flow context.',
        },
        { status: 400 },
      );
    }

    if (
      item.ai_allowed === false
    ) {
      return NextResponse.json(
        {
          error:
            'AI context is disabled for this item.',
        },
        { status: 400 },
      );
    }

    const ragEnabled =
      item.rag_allowed !== false && isFlowAiRagEnabled();

    await supabase
      .from('flow_ai_context')
      .upsert(
        flowAiContextGeneratingPayload(id, ragEnabled),
        {
          onConflict:
            'item_id',
        },
      );

    try {
      const result =
        await generateFlowContext({
          id: item.id,
          type: item.type,
          title: item.title,
          body_md:
            item.body_md,
          source_url:
            item.source_url,
          metadata:
            item.metadata,
          lang: item.lang,
          rag_allowed: item.rag_allowed,
        });

      if (!result) {
        await supabase
          .from('flow_ai_context')
          .delete()
          .eq('item_id', id);

        return NextResponse.json({
          success: true,
          skipped: true,
          message:
            'AI context generation was skipped for this item type.',
        });
      }

      const {
        data: contextRow,
        error: saveError,
      } = await supabase
        .from(
          'flow_ai_context',
        )
        .upsert(
          flowAiContextReadyPayload(id, result),
          {
            onConflict:
              'item_id',
          },
        )
        .select('*')
        .single();

      if (saveError) {
        throw saveError;
      }

      return NextResponse.json({
        success: true,
        context:
          contextRow,
      });
    } catch (generationError) {
      const message =
        errorMessage(
          generationError,
        );

      await supabase
        .from(
          'flow_ai_context',
        )
        .upsert(
          flowAiContextErrorPayload(id, message, ragEnabled),
          {
            onConflict:
              'item_id',
          },
        );

      throw generationError;
    }
  } catch (error) {
    console.error(
      '[flow-ai] generation failed:',
      error,
    );

    return NextResponse.json(
      {
        error:
          errorMessage(error),
      },
      { status: 500 },
    );
  }
}
