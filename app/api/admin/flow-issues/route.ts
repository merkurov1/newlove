
import { NextResponse } from "next/server";
import {
  getServerSupabaseClient,
  requireAdminFromRequest,
} from "@/lib/serverAuth";
import {
  DEFAULT_ISSUE_TEMPLATE,
  normalizeIssueTemplate,
} from "@/lib/flow-issue/template";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminFromRequest(request);

    const supabase = getServerSupabaseClient({
      useServiceRole: true,
    });

    const { data, error } = await supabase
      .from("flow_issue_template_versions")
      .select("version,config,created_at")
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({
      version: data?.version ?? 0,
      config: normalizeIssueTemplate(
        data?.config ?? DEFAULT_ISSUE_TEMPLATE,
      ),
      updatedAt: data?.created_at ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Ошибка загрузки настроек";

    const unauthorized =
      /unauthorized|admin access required/i.test(message);

    return NextResponse.json(
      { error: unauthorized ? "Доступ запрещён" : message },
      { status: unauthorized ? 401 : 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const admin = await requireAdminFromRequest(request);
    const body = await request.json();

    if (!body || typeof body !== "object" || !body.config) {
      return NextResponse.json(
        { error: "Не передана конфигурация шаблона" },
        { status: 400 },
      );
    }

    const config = normalizeIssueTemplate(body.config);

    const supabase = getServerSupabaseClient({
      useServiceRole: true,
    });

    // Insert the new version first. If insertion fails, the active
    // version remains intact.
    const { data: inserted, error: insertError } = await supabase
      .from("flow_issue_template_versions")
      .insert({
        config,
        is_active: false,
        created_by: admin.id,
      })
      .select("id,version,created_at")
      .single();

    if (insertError) throw insertError;

    const { error: deactivateError } = await supabase
      .from("flow_issue_template_versions")
      .update({ is_active: false })
      .eq("is_active", true);

    if (deactivateError) throw deactivateError;

    const { data: activated, error: activateError } = await supabase
      .from("flow_issue_template_versions")
      .update({ is_active: true })
      .eq("id", inserted.id)
      .select("id,version,created_at")
      .single();

    if (activateError) throw activateError;

    return NextResponse.json({
      ok: true,
      version: activated.version,
      updatedAt: activated.created_at,
      config,
    });
  } catch (error) {
    console.error("[flow-issue-template] save failed", error);

    const message =
      error instanceof Error ? error.message : "Ошибка сохранения настроек";

    const unauthorized =
      /unauthorized|admin access required/i.test(message);

    return NextResponse.json(
      { error: unauthorized ? "Доступ запрещён" : message },
      { status: unauthorized ? 401 : 500 },
    );
  }
}
