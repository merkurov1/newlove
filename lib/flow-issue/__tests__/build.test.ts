/**
 * @jest-environment node
 */

import {
  ANALYSIS_VERSION,
  buildAnalysisInput,
  contentHash,
} from "../analysis";
import { buildIssuePayload, calculateMetrics } from "../build";
import { renderIssue } from "../render";
import type { FlowItem, IssueAI, IssuePayload } from "../types";

function item(overrides: Partial<FlowItem> = {}): FlowItem {
  return {
    id: "item-1",
    type: "note",
    status: "published",
    visibility: "public",
    lang: "en",
    slug: "item-1",
    title: "A note",
    body_md:
      "A concrete note with a specific observation, a number such as 42, and enough detail to be useful to a reader.",
    source_url: null,
    ai_allowed: true,
    metadata: {},
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    published_at: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

function analysis(overrides: Partial<IssueAI> = {}): IssueAI {
  return {
    lang: "en",
    kind: "world",
    model: "test-model",
    at: "2026-10-02T00:00:00.000Z",
    schemaVersion: ANALYSIS_VERSION,
    topic: "technology",
    subtopic: "",
    summary: "A summary.",
    thesis: "A thesis.",
    editorialValue: 4,
    originality: 4,
    specificity: 4,
    readerValue: 4,
    contextRequired: "",
    confidence: 0.85,
    role: "supporting",
    rationale: "Test analysis.",
    ...overrides,
  };
}

function withAnalysis(
  source: FlowItem,
  overrides: Partial<IssueAI> = {},
): FlowItem {
  const cached = {
    ...analysis(overrides),
    contentHash: contentHash(buildAnalysisInput(source)),
  };

  return {
    ...source,
    metadata: {
      ...(source.metadata || {}),
      issue_ai: cached,
    },
  };
}

function query(result: { data: unknown; error: null }) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    lte: () => chain,
    in: () => chain,
    order: () => chain,
    maybeSingle: async () => result,
    then: (resolve: any, reject: any) =>
      Promise.resolve(result).then(resolve, reject),
  };

  return chain;
}

function fakeSupabase(items: FlowItem[]) {
  return {
    from(table: string) {
      if (table === "flow_issue_template_versions") {
        return query({ data: null, error: null });
      }

      return query({ data: items, error: null });
    },
  };
}

const start = new Date("2026-09-01T00:00:00.000Z");
const end = new Date("2026-10-28T00:00:00.000Z");

function payloadIds(payload: IssuePayload): string[] {
  return [
    payload.lead?.id,
    ...payload.latest.map((entry) => entry.id),
    ...payload.links.map((entry) => entry.id),
    ...payload.videos.map((entry) => entry.id),
    ...payload.photos.map((entry) => entry.id),
  ].filter((id): id is string => Boolean(id));
}

describe("buildIssuePayload", () => {
  const originalKey = process.env.DEEPSEEK_API_KEY;

  beforeAll(() => {
    // No network calls: cached analyses cover every item in these tests.
    delete process.env.DEEPSEEK_API_KEY;
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
  });

  it("builds Russian and English issues from the same source records", async () => {
    const items = [
      withAnalysis(
        item({
          id: "older-strong",
          title: "An older strong argument",
          published_at: "2026-09-20T10:00:00.000Z",
        }),
        {
          editorialValue: 5,
          originality: 5,
          specificity: 5,
          readerValue: 5,
          role: "lead",
          confidence: 0.9,
        },
      ),
      withAnalysis(
        item({
          id: "newer-supporting",
          title: "A newer supporting note",
          published_at: "2026-10-20T10:00:00.000Z",
        }),
        {
          editorialValue: 4,
          originality: 3,
          specificity: 4,
          readerValue: 4,
          confidence: 0.85,
        },
      ),
    ];

    const supabase = fakeSupabase(items);
    const ru = await buildIssuePayload(supabase as any, "ru", start, end);
    const en = await buildIssuePayload(supabase as any, "en", start, end);

    expect(payloadIds(ru)).toEqual(payloadIds(en));
    expect(ru.lead?.id).toBe("older-strong");
    expect(en.lead?.id).toBe("older-strong");
  });

  it("still generates a payload when AI is unavailable", async () => {
    const items = [
      item({
        id: "heuristic-note",
        title: "A long note",
        body_md: Array.from({ length: 80 }, (_, index) => `word${index}`).join(
          " ",
        ),
      }),
    ];

    const payload = await buildIssuePayload(
      fakeSupabase(items) as any,
      "ru",
      start,
      end,
    );

    expect(payload.schemaVersion).toBe(2);
    expect(Array.isArray(payload.latest)).toBe(true);
    // Regression: a heuristic-only run used to leave the issue empty.
    expect(payload.latest.map((entry) => entry.id)).toContain(
      "heuristic-note",
    );
    expect(payload.analysis).toEqual({
      model: 0,
      heuristic: 1,
    });

    const rendered = renderIssue(payload, {
      title: "Fallback issue",
      slug: "fallback-issue",
      number: 1,
    });

    expect(rendered.htmlWeb).toContain("A long note");
    expect(rendered.textEmail).toContain("A long note");
  });

  it("uses composer link_previews for issue cards and the source index", async () => {
    const link = withAnalysis(
      item({
        id: "link-preview",
        type: "link",
        title: "Why archives matter",
        body_md: "",
        source_url: "https://example.com/archives",
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
      }),
      {
        role: "link",
        editorialValue: 4,
        originality: 3,
        specificity: 4,
        readerValue: 4,
        confidence: 0.85,
      },
    );

    const payload = await buildIssuePayload(
      fakeSupabase([link]) as any,
      "ru",
      start,
      end,
    );

    expect(payload.links).toHaveLength(1);
    expect(payload.links[0].description).toContain("public memory");
    expect(payload.links[0].siteName).toBe("Example Journal");
    expect(payload.links[0].image).toBe(
      "https://example.com/cover.jpg",
    );
    expect(payload.sourceIndex).toEqual([
      expect.objectContaining({
        id: "link-preview",
        source: "Example Journal",
        title: "Why archives matter",
        url: "https://example.com/archives",
      }),
    ]);
  });

  it("keeps old payloads rendering through the existing HTML/email contract", async () => {
    const items = [
      withAnalysis(
        item({
          id: "render-note",
          title: "Render me",
          body_md: "A body that should appear in both web and email output.",
        }),
        { role: "lead" },
      ),
    ];

    const payload = await buildIssuePayload(
      fakeSupabase(items) as any,
      "ru",
      start,
      end,
    );
    const rendered = renderIssue(payload, {
      title: "Test issue",
      slug: "test-issue",
      number: 1,
    });

    expect(rendered.htmlWeb).toContain("<!doctype html>");
    expect(rendered.htmlWeb).toContain("Render me");
    expect(rendered.htmlEmail).toContain("Render me");
    expect(rendered.textEmail).toContain("Render me");
  });
});

describe("calculateMetrics", () => {
  it("counts published records only and leaves drafts at zero", () => {
    const published = [item({ id: "one" }), item({ id: "two" })];
    const stats = calculateMetrics(published, start, end);

    expect(stats.published).toBe(2);
    expect(stats.total).toBe(2);
    expect(stats.drafts).toBe(0);
  });
});
