import { metadata as rootMetadata } from "@/app/layout";
import { requireAdmin } from "@/lib/serverAuth";
import { redirect } from "next/navigation";
import AdminNav from "./AdminNav";
import { sanitizeMetadata } from "@/lib/metadataSanitize";

const rootTitleDefault =
  typeof rootMetadata?.title === "object" &&
  rootMetadata?.title &&
  "default" in rootMetadata.title
    ? String(rootMetadata.title.default || "Anton Merkurov")
    : typeof rootMetadata?.title === "string"
      ? rootMetadata.title
      : "Site";

export const metadata = sanitizeMetadata({
  robots: { index: false, follow: false },
  title: {
    default: `Admin — ${rootTitleDefault}`,
    template: "%s | Admin",
  },
});

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireAdmin();
  } catch {
    redirect("/403");
  }

  return (
    <div
      className="min-h-screen bg-[#FAF9F7] text-[#211F1F]"
      style={{
        fontFamily: "Inter, Helvetica, Arial, sans-serif",
        fontSize: 15,
        lineHeight: 1.55,
      }}
    >
      <div className="mx-auto grid max-w-[1680px] grid-cols-1 gap-6 px-4 pb-12 pt-24 sm:px-6 lg:grid-cols-[224px_minmax(0,1fr)] lg:gap-10 lg:px-10 lg:pt-10">
        <AdminNav />
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}