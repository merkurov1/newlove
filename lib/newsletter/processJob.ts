import { createId } from "@paralleldrive/cuid2";
import { getServerSupabaseClient } from "@/lib/serverAuth";
import { sendNewsletterToSubscriber } from "@/lib/newsletter/sendNewsletterToSubscriber";
import { renderNewsletterEmail } from "@/emails/NewsletterEmail";
import { filterSubscribersByLang } from "@/lib/newsletter/language";

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1500;
const EMAIL_DELAY_MS = 400;

interface NewsletterLog {
  id: string;
  job_id: string;
  subscriber_id: string;
  status: "sent" | "failed" | "bounced" | "skipped";
  error_message?: string;
  provider_id?: string | null;
  provider_response?: unknown;
  sent_at: string;
}

export async function processNewsletterJob(
  jobId: string,
  supabase: ReturnType<typeof getServerSupabaseClient>,
) {
  try {
    const { data: job, error: jobError } = await supabase
      .from("newsletter_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();

    if (jobError || !job) {
      return {
        ok: false,
        error: "Задача рассылки не найдена",
        sentCount: 0,
        failedCount: 0,
        skippedCount: 0,
        totalSubscribers: 0,
      };
    }

    // Atomically claim the job
    const { data: claimedJob, error: claimError } = await supabase
      .from("newsletter_jobs")
      .update({
        status: "processing",
        started_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .in("status", ["pending", "processing"])
      .select("id")
      .maybeSingle();

    if (claimError || !claimedJob) {
      return {
        ok: false,
        error: "Задача уже обрабатывается другим процессом",
        sentCount: 0,
        failedCount: 0,
        skippedCount: 0,
        totalSubscribers: 0,
      };
    }

    const { data: letter, error: letterError } = await supabase
      .from("letters")
      .select(
        "id,title,slug,content,published,kind,lang,html_email,text_email,status,sent_at,sentAt",
      )
      .eq("id", job.letter_id)
      .maybeSingle();

    if (letterError || !letter) {
      await supabase
        .from("newsletter_jobs")
        .update({
          status: "failed",
          error_message: "Letter not found",
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      return {
        ok: false,
        error: "Выпуск или письмо не найдено",
        sentCount: 0,
        failedCount: 0,
        skippedCount: 0,
        totalSubscribers: 0,
      };
    }

    const { data: allSubscribers, error: subsError } = await supabase
      .from("subscribers")
      .select("id,email,locale")
      .eq("isActive", true);

    if (subsError) {
      await supabase
        .from("newsletter_jobs")
        .update({
          status: "failed",
          error_message: "Failed to fetch subscribers",
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      return {
        ok: false,
        error: "Не удалось получить список подписчиков",
        sentCount: 0,
        failedCount: 0,
        skippedCount: 0,
        totalSubscribers: 0,
      };
    }

    const subscribers = filterSubscribersByLang(
      allSubscribers || [],
      letter.lang,
    );

    if (!subscribers || subscribers.length === 0) {
      const langLabel = letter.lang === "en" ? "англоязычных" : "русскоязычных";
      const noSubsMsg = `Нет активных ${langLabel} подписчиков`;

      await supabase
        .from("newsletter_jobs")
        .update({
          status: "failed",
          total_count: 0,
          sent_count: 0,
          failed_count: 0,
          error_message: noSubsMsg,
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      return {
        ok: false,
        error: noSubsMsg,
        sentCount: 0,
        failedCount: 0,
        skippedCount: 0,
        totalSubscribers: 0,
      };
    }

    await supabase
      .from("newsletter_jobs")
      .update({ total_count: subscribers.length })
      .eq("id", job.id);

    let emailHtml = "";

    if (letter.kind === "issue") {
      emailHtml = letter.html_email || "";
      if (!emailHtml.trim()) {
        await supabase
          .from("newsletter_jobs")
          .update({
            status: "failed",
            error_message: "Flow issue has no stored email HTML",
            completed_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        return {
          ok: false,
          error: "У выпуска отсутствует HTML-версия письма",
          sentCount: 0,
          failedCount: 0,
          skippedCount: 0,
          totalSubscribers: subscribers.length,
        };
      }
    } else {
      try {
        emailHtml = renderNewsletterEmail(letter, "") || "";
      } catch (err) {
        console.error("[processNewsletterJob] Email rendering failed:", err);
      }
    }

    const letterObj = {
      id: letter.id,
      title: letter.title,
      content: letter.content,
      html: emailHtml,
      text: letter.kind === "issue" ? letter.text_email || "" : "",
      kind: letter.kind || "letter",
    };

    let sentCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
      const batch = subscribers.slice(i, i + BATCH_SIZE);
      const logs: NewsletterLog[] = [];

      for (const subscriber of batch) {
        try {
          const token = createId();
          const now = new Date();
          const expiresAt = new Date(
            now.getTime() + 7 * 24 * 60 * 60 * 1000,
          );

          await supabase.from("subscriber_tokens").insert({
            subscriber_id: subscriber.id,
            type: "unsubscribe",
            token,
            created_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
          });

          const result = await sendNewsletterToSubscriber(
            subscriber,
            letterObj,
            {
              token,
              skipTokenInsert: true,
            },
          );

          if (result.status === "sent") {
            sentCount++;
            logs.push({
              id: createId(),
              job_id: job.id,
              subscriber_id: subscriber.id,
              status: "sent",
              provider_id: result.providerResponse?.id || null,
              provider_response: result.providerResponse || null,
              sent_at: new Date().toISOString(),
            });
          } else if (result.status === "skipped") {
            skippedCount++;
            logs.push({
              id: createId(),
              job_id: job.id,
              subscriber_id: subscriber.id,
              status: "skipped",
              error_message:
                result.reason || "Email was skipped (e.g. dry-run)",
              provider_response: result,
              sent_at: new Date().toISOString(),
            });
          } else {
            failedCount++;
            logs.push({
              id: createId(),
              job_id: job.id,
              subscriber_id: subscriber.id,
              status: "failed",
              error_message: result.error || "Unknown send error",
              provider_response: result.providerDetails || null,
              sent_at: new Date().toISOString(),
            });
          }
        } catch (error) {
          failedCount++;
          logs.push({
            id: createId(),
            job_id: job.id,
            subscriber_id: subscriber.id,
            status: "failed",
            error_message:
              error instanceof Error ? error.message : String(error),
            sent_at: new Date().toISOString(),
          });
        }

        await new Promise((resolve) => setTimeout(resolve, EMAIL_DELAY_MS));
      }

      if (logs.length) {
        await supabase.from("newsletter_logs").insert(logs);
      }

      await supabase
        .from("newsletter_jobs")
        .update({
          sent_count: sentCount,
          failed_count: failedCount + skippedCount,
        })
        .eq("id", job.id);

      if (i + BATCH_SIZE < subscribers.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    const completedAt = new Date().toISOString();

    if (letter.kind === "issue" && (sentCount > 0 || skippedCount > 0)) {
      await supabase
        .from("letters")
        .update({ sent_at: completedAt })
        .eq("id", letter.id);
    } else if (letter.kind !== "issue" && (sentCount > 0 || skippedCount > 0)) {
      await supabase
        .from("letters")
        .update({ sentAt: completedAt })
        .eq("id", letter.id);
    }

    const jobStatus = sentCount > 0 ? "completed" : skippedCount > 0 ? "completed" : "failed";

    await supabase
      .from("newsletter_jobs")
      .update({
        status: jobStatus,
        sent_count: sentCount,
        failed_count: failedCount + skippedCount,
        completed_at: completedAt,
      })
      .eq("id", job.id);

    return {
      ok: true,
      sentCount,
      failedCount,
      skippedCount,
      totalSubscribers: subscribers.length,
    };
  } catch (error) {
    console.error("[processNewsletterJob] Unhandled exception:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
      totalSubscribers: 0,
    };
  }
}
