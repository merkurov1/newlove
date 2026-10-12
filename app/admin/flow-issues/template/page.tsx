
import FlowIssueTemplateAdmin from "@/components/admin/FlowIssueTemplateAdmin";

export const metadata = {
  title: "Flow Issue Template — Admin",
  robots: {
    index: false,
    follow: false,
  },
};

export default function FlowIssueTemplatePage() {
  return <FlowIssueTemplateAdmin />;
}
