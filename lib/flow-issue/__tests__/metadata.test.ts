import { buildAnalysisInput } from "../analysis";
import {
  buildSourceIndex,
  getLinkPresentation,
  getLinkPreviews,
} from "../metadata";
import type { FlowItem, IssueEntry } from "../types";

function item(overrides: Partial<FlowItem> = {}): FlowItem {
  return {
    id: "link-1",
    type: "link",
    status: "published",
    visibility: "public",
    lang: "en",
    slug: "link-1",
    title: "Why archives matter",
    body_md: "A short note about archives.",
    source_url: "https://example.com/archives",
    ai_allowed: true,
    metadata: {
      link_previews: [
        {
          url: "https://example.com/archives",
          title: "Why archives matter",
          description: "A detailed argument about public memory.",
          site_name: "Example Journal",
          image: "https://example.com/cover.jpg",
        },
      ],
    },
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    published_at: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

function entry(overrides: Partial<IssueEntry> = {}): IssueEntry {
  return {
    id: "link-1",
    type: "link",
    title: "Why archives matter",
    body: "",
    url: "https://example.com/archives",
    publishedAt: "2026-10-01T00:00:00.000Z",
    createdAt: "2026-10-01T00:00:00.000Z",
    metadata: {
      link_previews: [
        {
          url: "https://example.com/archives",
          title: "Why archives matter",
          description: "A detailed argument about public memory.",
          site_name: "Example Journal",
          image: "https://example.com/cover.jpg",
        },
      ],
    },
    lang: "en",
    kind: "world",
    own: false,
    ...overrides,
  };
}

describe("Flow issue link metadata", () => {
  it("reads the composer's link_previews array", () => {
    const presentation = getLinkPresentation(item().metadata);

    expect(presentation.title).toBe("Why archives matter");
    expect(presentation.description).toContain("public memory");
    expect(presentation.siteName).toBe("Example Journal");
    expect(presentation.image).toBe("https://example.com/cover.jpg");
    expect(getLinkPreviews(item().metadata)).toHaveLength(1);
  });

  it("falls back to legacy link_preview and top-level fields", () => {
    const presentation = getLinkPresentation({
      link_preview: {
        url: "https://example.org/story",
        title: "Legacy story",
        description: "Legacy description",
        site_name: "Legacy Site",
      },
    });

    expect(presentation.title).toBe("Legacy story");
    expect(presentation.description).toBe("Legacy description");
    expect(presentation.siteName).toBe("Legacy Site");
  });

  it("includes link preview text in the AI analysis input", () => {
    const input = buildAnalysisInput(item());

    expect(input).toContain("A detailed argument about public memory.");
    expect(input).toContain("Example Journal");
  });

  it("builds the source index from normalized link metadata", () => {
    const index = buildSourceIndex([entry()]);

    expect(index).toEqual([
      {
        id: "link-1",
        source: "Example Journal",
        title: "Why archives matter",
        url: "https://example.com/archives",
        originalDate: null,
        addedAt: "2026-10-01T00:00:00.000Z",
      },
    ]);
  });
});
