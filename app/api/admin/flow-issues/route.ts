
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  getServerSupabaseClient,
  requireAdminFromRequest,
} from "@/lib/serverAuth";
import {
  buildIssuePayload,
  resolveIssueWindow,
} from "@/lib/flow-issue/build";
import { renderIssue } from "@/lib/flow-issue/render";
import type { IssueLang } from "@/lib/flow-issue/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function validLang(value: unknown): value is IssueLang {
  return value === "ru" || value === "en";
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdminFromRequest(request);
    const body = await request.json();

    if (!validLang(body.lang)) {
      return NextResponse.json(
        { error: "lang должен быть ru или en" },
        { status: 400 },
      );
    }

    const lang: IssueLang = body.lang;
    const supabase = getServerSupabaseClient({
      useServiceRole: true,
    });

    const { start, end } = await resolveIssueWindow(
      supabase,
      lang,
      body.periodStart ?? null,
      body.periodEnd ?? null,
    );

    if (start >= end) {
      return NextResponse.json(
        { error: "Начало периода должно быть раньше окончания" },
        { status: 400 },
      );
    }

    const payload = await buildIssuePayload(
      supabase,
      lang,
      start,
      end,
    );

    const { data: previous, error: previousError } =
      await supabase
        .from("letters")
        .select("number")
        .eq("kind", "issue")
        .eq("lang", lang)
        .order("number", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (previousError) throw previousError;

    const number = (previous?.number ?? 0) + 1;
    const periodLabel = end.toISOString().slice(0, 10);
    const title =
      lang === "ru"
        ? `Выпуск ${number} · ${periodLabel}`
        : `Issue ${number} · ${periodLabel}`;

    const baseSlug = slugify(
      `${lang}-issue-${number}-${periodLabel}`,
    );
    const slug = `${baseSlug}-${randomUUID().slice(0, 8)}`;

    const rendered = renderIssue(payload, {
      title,
      slug,
      siteUrl: "https://www.merkurov.love",
    });

    const now = new Date().toISOString();

    const { data: issue, error: insertError } = await supabase
      .from("letters")
      .insert({
        id: randomUUID(),
        title,
        slug,
        content: rendered.htmlWeb,
        published: false,
        publishedAt: null,
        createdAt: now,
        updatedAt: now,
        authorId: admin.id,
        kind: "issue",
        lang,
        number,
        period_start: start.toISOString(),
        period_end: end.toISOString(),
        status: "draft",
        payload,
        html_web: rendered.htmlWeb,
        html_email: rendered.htmlEmail,
        text_email: rendered.textEmail,
      })
      .select(
        "id,title,slug,kind,lang,number,period_start,period_end,status,payload,html_web,html_email,text_email",
      )
      .single();

    if (insertError) {
      // Concurrent generation may claim the same number.
      // The unique index prevents duplicate issue numbers.
      if (insertError.code === "23505") {
        return NextResponse.json(
          {
            error:
              "Номер выпуска уже занят параллельной операцией. Обновите страницу и повторите сборку.",
          },
          { status: 409 },
        );
      }
      throw insertError;
    }

    return NextResponse.json({ issue }, { status: 201 });
  } catch (error) {
    console.error("[flow-issues] build failed", error);
    const message =
      error instanceof Error ? error.message : "Ошибка сборки выпуска";
    const unauthorized =
      /unauthorized|admin access required/i.test(message);

    return NextResponse.json(
      { error: unauthorized ? "Доступ запрещён" : message },
      { status: unauthorized ? 401 : 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdminFromRequest(request);
    const body = await request.json();

    if (
      typeof body.id !== "string" ||
      !body.id.trim() ||
      body.action !== "publish"
    ) {
      return NextResponse.json(
        { error: "Ожидаются id и action: publish" },
        { status: 400 },
      );
    }

    const supabase = getServerSupabaseClient({
      useServiceRole: true,
    });

    const { data: issue, error: fetchError } = await supabase
      .from("letters")
      .select("id,kind,status")
      .eq("id", body.id)
      .eq("kind", "issue")
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!issue) {
      return NextResponse.json(
        { error: "Выпуск не найден" },
        { status: 404 },
      );
    }

    if (issue.status === "published") {
      return NextResponse.json({ ok: true, alreadyPublished: true });
    }

    const now = new Date().toISOString();

    const { data: updated, error: updateError } = await supabase
      .from("letters")
      .update({
        published: true,
        status: "published",
        publishedAt: now,
        updatedAt: now,
      })
      .eq("id", body.id)
      .eq("kind", "issue")
      .eq("status", "draft")
      .select("id,title,slug,lang,number,status,publishedAt")
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updated) {
      return NextResponse.json(
        { error: "Выпуск изменён другим запросом. Обновите страницу." },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      issue: updated,
      url: `/letters/${updated.slug}`,
    });
  } catch (error) {
    console.error("[flow-issues] publish failed", error);
    const message =
      error instanceof Error ? error.message : "Ошибка публикации";
    const unauthorized =
      /unauthorized|admin access required/i.test(message);

    return NextResponse.json(
      {
        error: unauthorized ? "Доступ запрещён" : message,
      },
      { status: unauthorized ? 401 : 500 },
    );
  }
}
