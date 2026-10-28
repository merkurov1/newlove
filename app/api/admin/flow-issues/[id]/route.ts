import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  getServerSupabaseClient,
  requireAdminFromRequest,
} from "@/lib/serverAuth";
import { renderIssue } from "@/lib/flow-issue/render";
import {
  applyIssueEdits,
  type EditableIssueSections,
} from "@/lib/flow-issue/edit";
import type { IssuePayload } from "@/lib/flow-issue/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SITE_URL = "https://www.merkurov.love";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  try {
    await requireAdminFromRequest(request);
  } catch {
    return NextResponse.json(
      { error: "Доступ запрещён" },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;

  try {
    const parsed: unknown = await request.json();

    if (!isRecord(parsed)) {
      return NextResponse.json(
        { error: "Тело запроса должно быть JSON-объектом." },
        { status: 400 },
      );
    }

    body = parsed;
  } catch {
    return NextResponse.json(
      { error: "Некорректный JSON." },
      { status: 400 },
    );
  }

  const { id } = await context.params;

  if (!id) {
    return NextResponse.json(
      { error: "Не указан id выпуска." },
      { status: 400 },
    );
  }

  const supabase = getServerSupabaseClient({
    useServiceRole: true,
  });

  const { data: issue, error: fetchError } = await supabase
    .from("letters")
    .select(
      "id,title,slug,kind,status,published,number,lang,payload",
    )
    .eq("id", id)
    .eq("kind", "issue")
    .maybeSingle();

  if (fetchError) {
    console.error(
      "[flow-issues] edit fetch failed",
      fetchError,
    );

    return NextResponse.json(
      { error: "Не удалось загрузить выпуск." },
      { status: 500 },
    );
  }

  if (!issue) {
    return NextResponse.json(
      { error: "Выпуск не найден." },
      { status: 404 },
    );
  }

  if (issue.status !== "draft" || issue.published) {
    return NextResponse.json(
      {
        error:
          "Опубликованный выпуск нельзя изменить. Соберите новый черновик.",
      },
      { status: 409 },
    );
  }

  if (!isRecord(issue.payload)) {
    return NextResponse.json(
      { error: "У выпуска отсутствует корректный payload." },
      { status: 409 },
    );
  }

  const title =
    body.title === undefined
      ? String(issue.title || "Flow issue")
      : typeof body.title === "string"
        ? body.title.trim().slice(0, 240)
        : "";

  if (!title) {
    return NextResponse.json(
      { error: "Заголовок выпуска не может быть пустым." },
      { status: 400 },
    );
  }

  if (
    body.sections !== undefined &&
    !isRecord(body.sections)
  ) {
    return NextResponse.json(
      { error: "sections должен быть объектом." },
      { status: 400 },
    );
  }

  let payload: IssuePayload;

  try {
    payload = applyIssueEdits(
      issue.payload as IssuePayload,
      (body.sections || {}) as EditableIssueSections,
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Некорректные правки выпуска.",
      },
      { status: 400 },
    );
  }

  const number =
    typeof issue.number === "number" ? issue.number : null;

  const rendered = renderIssue(payload, {
    title,
    slug: String(issue.slug || ""),
    siteUrl: SITE_URL,
    number,
  });

  const now = new Date().toISOString();

  const { data: updated, error: updateError } = await supabase
    .from("letters")
    .update({
      title,
      payload,
      html_web: rendered.htmlWeb,
      html_email: rendered.htmlEmail,
      text_email: rendered.textEmail,
      updatedAt: now,
    })
    .eq("id", issue.id)
    .eq("kind", "issue")
    .eq("status", "draft")
    .select(
      "id,title,slug,kind,lang,number,status,published,sent_at,updatedAt",
    )
    .maybeSingle();

  if (updateError) {
    console.error(
      "[flow-issues] edit update failed",
      updateError,
    );

    return NextResponse.json(
      { error: "Не удалось сохранить выпуск." },
      { status: 500 },
    );
  }

  if (!updated) {
    return NextResponse.json(
      {
        error:
          "Выпуск изменён другим запросом. Обновите страницу.",
      },
      { status: 409 },
    );
  }

  revalidatePath("/admin/flow-issues");
  revalidatePath(`/admin/flow-issues/${issue.id}`);
  revalidatePath(`/letters/${issue.slug}`);

  return NextResponse.json({
    ok: true,
    issue: updated,
    htmlWeb: rendered.htmlWeb,
  });
}
