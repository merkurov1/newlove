
import FlowIssueAdmin from "@/components/admin/FlowIssueAdmin";

export const metadata = {
  title: "Flow Issues — Admin",
  robots: {
    index: false,
    follow: false,
  },
};

export default function FlowIssuesAdminPage() {
  return <FlowIssueAdmin />;
}
