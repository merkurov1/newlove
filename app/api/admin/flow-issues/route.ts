
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
import { processNewsletterJob } from "@/lib/newsletter/processJob";
import {
  filterSubscribersByLang,
  isSubscriberMatchingLang,
} from "@/lib/newsletter/language";
import type { IssueLang } from "@/lib/flow-issue/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const SITE_URL = "https://www.merkurov.love";

function validLang(value: unknown): value is IssueLang {
  return value === "ru" || value === "en";
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

async function getAdminSupabase() {
  return getServerSupabaseClient({ useServiceRole: true });
}

export async function GET(request: Request) {
  try {
    await requireAdminFromRequest(request);
    const supabase = await getAdminSupabase();

    const { data: issues, error } = await supabase
      .from("letters")
      .select(
        "id,title,slug,number,lang,status,published,sent_at,sentAt,createdAt,publishedAt,updatedAt",
      )
      .eq("kind", "issue")
      .order("createdAt", { ascending: false });

    if (error) throw error;

    const { data: activeSubs } = await supabase
      .from("subscribers")
      .select("id,locale")
      .eq("isActive", true);

    const activeList = activeSubs || [];
    const activeSubscribersTotal = activeList.length;
    const activeSubscribersEn = activeList.filter((s) =>
      isSubscriberMatchingLang(s.locale, "en"),
    ).length;
    const activeSubscribersRu = activeList.filter((s) =>
      isSubscriberMatchingLang(s.locale, "ru"),
    ).length;

    return NextResponse.json({
      ok: true,
      issues: issues || [],
      activeSubscribers: activeSubscribersTotal,
      activeSubscribersRu,
      activeSubscribersEn,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Ошибка загрузки выпусков";
    const unauthorized = /unauthorized|admin access required/i.test(message);

    return NextResponse.json(
      { error: unauthorized ? "Доступ запрещён" : message },
      { status: unauthorized ? 401 : 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdminFromRequest(request);

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

    if (!validLang(body.lang)) {
      return NextResponse.json(
        { error: "lang должен быть ru или en." },
        { status: 400 },
      );
    }

    const lang = body.lang;
    const supabase = await getAdminSupabase();

    const { start, end } = await resolveIssueWindow(
      supabase,
      lang,
      typeof body.periodStart === "string" ? body.periodStart : null,
      typeof body.periodEnd === "string" ? body.periodEnd : null,
    );

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      start >= end
    ) {
      return NextResponse.json(
        { error: "Период выпуска задан некорректно." },
        { status: 400 },
      );
    }

    const payload = await buildIssuePayload(
      supabase,
      lang,
      start,
      end,
    );

    const { data: previous, error: previousError } = await supabase
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
      siteUrl: SITE_URL,
      number,
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
        "id,title,slug,kind,lang,number,period_start,period_end,status,payload,html_web,html_email,text_email,published,sent_at",
      )
      .single();

    if (insertError) {
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

    const id = typeof body.id === "string" ? body.id.trim() : "";
    const action = body.action;

    if (!id || (action !== "publish" && action !== "send")) {
      return NextResponse.json(
        { error: "Ожидаются id и action: publish или send." },
        { status: 400 },
      );
    }

    const supabase = await getAdminSupabase();

    const { data: issue, error: fetchError } = await supabase
      .from("letters")
      .select(
        "id,title,slug,kind,lang,status,published,publishedAt,sent_at,html_email,text_email",
      )
      .eq("id", id)
      .eq("kind", "issue")
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (!issue) {
      return NextResponse.json(
        { error: "Выпуск не найден." },
        { status: 404 },
      );
    }

    const now = new Date().toISOString();

    if (action === "publish") {
      if (issue.status === "published" && issue.published) {
        return NextResponse.json({
          ok: true,
          alreadyPublished: true,
          issue,
        });
      }

      const { data: updated, error: updateError } = await supabase
        .from("letters")
        .update({
          published: true,
          status: "published",
          publishedAt: issue.publishedAt || now,
          updatedAt: now,
        })
        .eq("id", issue.id)
        .eq("kind", "issue")
        .eq("status", "draft")
        .select(
          "id,title,slug,lang,number,status,published,publishedAt,sent_at",
        )
        .maybeSingle();

      if (updateError) throw updateError;

      if (!updated) {
        return NextResponse.json(
          {
            error:
              "Выпуск изменён другим запросом. Обновите страницу.",
          },
          { status: 409 },
        );
      }

      return NextResponse.json({
        ok: true,
        issue: updated,
        url: `/letters/${updated.slug}`,
      });
    }

    // action === "send"

    if (issue.sent_at) {
      return NextResponse.json(
        {
          error:
            "Этот выпуск уже отправлялся. Повторная рассылка заблокирована.",
          sent_at: issue.sent_at,
        },
        { status: 409 },
      );
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        {
          error:
            "RESEND_API_KEY не настроен. Рассылка не поставлена в очередь.",
        },
        { status: 503 },
      );
    }

    if (!issue.html_email?.trim()) {
      return NextResponse.json(
        {
          error:
            "У выпуска отсутствует HTML-версия письма. Соберите новый выпуск.",
        },
        { status: 409 },
      );
    }

    // If this issue is already being sent, return its existing job.
    const { data: activeJobs, error: activeJobsError } = await supabase
      .from("newsletter_jobs")
      .select("id,status")
      .eq("letter_id", issue.id)
      .in("status", ["pending", "processing"])
      .order("created_at", { ascending: false })
      .limit(1);

    if (activeJobsError) throw activeJobsError;

    if (activeJobs?.length) {
      return NextResponse.json({
        ok: true,
        queued: true,
        alreadyQueued: true,
        jobId: activeJobs[0].id,
        jobStatus: activeJobs[0].status,
        issue: {
          id: issue.id,
          title: issue.title,
          slug: issue.slug,
          status: issue.status,
          sent_at: issue.sent_at,
        },
      });
    }

    const { data: activeSubs, error: subscribersError } =
      await supabase
        .from("subscribers")
        .select("id,locale")
        .eq("isActive", true);

    if (subscribersError) throw subscribersError;

    const matchingSubs = filterSubscribersByLang(
      activeSubs || [],
      issue.lang,
    );

    if (!matchingSubs.length) {
      const langLabel =
        issue.lang === "en" ? "англоязычных" : "русскоязычных";
      return NextResponse.json(
        {
          error: `Нет активных ${langLabel} подписчиков. Рассылка не создана.`,
        },
        { status: 409 },
      );
    }

    // The worker rejects unpublished issues, so publish before queueing.
    if (issue.status !== "published" || !issue.published) {
      const { data: publishedIssue, error: publishError } = await supabase
        .from("letters")
        .update({
          published: true,
          status: "published",
          publishedAt: issue.publishedAt || now,
          updatedAt: now,
        })
        .eq("id", issue.id)
        .eq("kind", "issue")
        .select("id")
        .maybeSingle();

      if (publishError) throw publishError;

      if (!publishedIssue) {
        return NextResponse.json(
          {
            error:
              "Не удалось опубликовать выпуск перед рассылкой.",
          },
          { status: 409 },
        );
      }
    }

    const jobId = randomUUID();

    const { error: jobError } = await supabase
      .from("newsletter_jobs")
      .insert({
        id: jobId,
        letter_id: issue.id,
        status: "pending",
        created_at: now,
      });

    if (jobError) {
      // The unique index in the migration prevents concurrent duplicate jobs.
      if (jobError.code === "23505") {
        const { data: existingJob, error: existingJobError } =
          await supabase
            .from("newsletter_jobs")
            .select("id,status")
            .eq("letter_id", issue.id)
            .in("status", ["pending", "processing"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (existingJobError) throw existingJobError;

        if (existingJob) {
          return NextResponse.json({
            ok: true,
            queued: true,
            alreadyQueued: true,
            jobId: existingJob.id,
            jobStatus: existingJob.status,
          });
        }
      }

      throw jobError;
    }

    const sendResult = await processNewsletterJob(jobId, supabase);

    const { data: updatedIssue } = await supabase
      .from("letters")
      .select("id,title,slug,status,published,sent_at,publishedAt")
      .eq("id", issue.id)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      queued: true,
      alreadyQueued: false,
      jobId,
      activeSubscribers: matchingSubs.length,
      sentCount: sendResult.sentCount,
      failedCount: sendResult.failedCount,
      skippedCount: sendResult.skippedCount,
      issue: updatedIssue || {
        id: issue.id,
        title: issue.title,
        slug: issue.slug,
        status: "published",
        sent_at: new Date().toISOString(),
      },
      message:
        sendResult.sentCount > 0
          ? `Выпуск успешно разослан ${sendResult.sentCount} подписчикам.`
          : sendResult.skippedCount > 0
            ? `Выпуск обработан (отправка пропущена: ${sendResult.skippedCount} адресов).`
            : sendResult.failedCount > 0
              ? `Ошибка отправки подписчикам: ${sendResult.error || 'проверьте журнал рассылок'}.`
              : "Выпуск опубликован и разослан.",
    });
  } catch (error) {
    console.error("[flow-issues] PATCH failed", error);

    const message =
      error instanceof Error ? error.message : "Ошибка обработки выпуска";

    const unauthorized =
      /unauthorized|admin access required/i.test(message);

    return NextResponse.json(
      { error: unauthorized ? "Доступ запрещён" : message },
      { status: unauthorized ? 401 : 500 },
    );
  }
}
