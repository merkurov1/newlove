import Link from "next/link";
import { getServerSupabaseClient } from "@/lib/serverAuth";
import { deleteLetter } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminLettersPage() {
  const supabase = getServerSupabaseClient({ useServiceRole: true });

  let letters: any[] = [];
  let error: string | null = null;

  const { data, error: queryError } = await supabase
    .from("letters")
    .select("id,title,slug,kind,status,lang,published,sentAt,createdAt,author:authorId(name)")
    .order("createdAt", { ascending: false });

  if (queryError) {
    console.error("[admin/letters]", queryError);
    error = "Unable to load the existing newsletter archive.";
  } else {
    letters = data ?? [];
  }

  return (
    <div className="space-y-8 pb-10">
      <header className="border-b border-[#D9D3CD] pb-7">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#89827B]">
          Publishing / Archive
        </p>
        <h1 className="mt-3 font-serif text-4xl tracking-tight sm:text-5xl">
          Newsletter
        </h1>
        <p className="mt-2 max-w-xl text-sm text-[#746D66]">
          Existing letters and their delivery history are preserved. New
          weekly issues will be assembled from Flow.
        </p>
        <div className="mt-5 flex flex-wrap gap-4 text-xs">
          <Link
            href="/admin/newsletter-jobs"
            className="text-[#990F3D] hover:underline"
          >
            Delivery logs ↗
          </Link>
          <Link href="/journal" className="text-[#746D66] hover:text-[#990F3D]">
            Public journal ↗
          </Link>
          <Link href="/letters" className="text-[#746D66] hover:text-[#990F3D]">
            Public letters ↗
          </Link>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="border border-[#E7C9D2] bg-[#FFF1E5] px-4 py-3 text-sm text-[#7E0C33]"
        >
          {error}
        </div>
      )}

      <div className="flex items-center justify-between border-b border-[#D9D3CD] pb-3">
        <h2 className="font-serif text-xl">Existing letters</h2>
        <span className="font-mono text-[10px] uppercase tracking-wider text-[#89827B]">
          {letters.length} records
        </span>
      </div>

      {letters.length === 0 ? (
        <p className="py-12 text-sm text-[#89827B]">
          No letters found. Existing records have not been modified.
        </p>
      ) : (
        <div>
          {letters.map((letter) => {
            const editHref =
              letter.kind === "issue"
                ? `/admin/flow-issues/${letter.id}`
                : `/admin/letters/edit/${letter.id}`;

            return (
            <article
              key={letter.id}
              className="grid grid-cols-1 gap-4 border-b border-[#EAE6E1] py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  <span
                    className={
                      letter.published
                        ? "text-[10px] uppercase tracking-wider text-[#356B4D]"
                        : "text-[10px] uppercase tracking-wider text-[#89827B]"
                    }
                  >
                    {letter.published ? "Published" : "Draft"}
                  </span>
                  {letter.sentAt && (
                    <span className="text-[10px] uppercase tracking-wider text-[#89827B]">
                      Sent {new Date(letter.sentAt).toLocaleDateString("en-GB")}
                    </span>
                  )}
                </div>

                <Link
                  href={editHref}
                  className="block truncate font-serif text-xl hover:text-[#990F3D]"
                >
                  {letter.title || "Untitled letter"}
                </Link>

                <p className="mt-1 truncate font-mono text-[10px] text-[#89827B]">
                  /{letter.slug} · {letter.author?.name || "Unknown author"}
                </p>
              </div>

              <div className="flex items-center gap-4 text-xs">
                <span className="text-[#89827B]">
                  {letter.createdAt
                    ? new Date(letter.createdAt).toLocaleDateString("en-GB")
                    : "—"}
                </span>
                <Link
                  href={editHref}
                  className="text-[#990F3D] hover:underline"
                >
                  {letter.kind === "issue" ? "Редактировать выпуск" : "Edit"} ↗
                </Link>
                <form action={deleteLetter}>
                  <input type="hidden" name="id" value={letter.id} />
                  <button
                    type="submit"
                    className="text-[#89827B] hover:text-red-700"
                  >
                    Delete
                  </button>
                </form>
              </div>
            </article>
            );
          })}
        </div>
      )}
    </div>
  );
}