import {
  HEURISTIC_MODEL,
  heuristicAnalysis,
} from "../analysis";
import {
  MIN_LEAD_SCORE,
  buildCandidate,
  selectIssueContent,
} from "../editorial";
import type { FlowItem, IssueAI, IssueEntry } from "../types";

const windowEnd = new Date("2026-10-28T12:00:00.000Z");

function analysis(overrides: Partial<IssueAI> = {}): IssueAI {
  return {
    lang: "en",
    kind: "world",
    model: "test-model",
    at: "2026-10-01T00:00:00.000Z",
    schemaVersion: 2,
    contentHash: "test",
    topic: "general",
    subtopic: "",
    summary: "A summary.",
    thesis: "A thesis.",
    editorialValue: 3,
    originality: 3,
    specificity: 3,
    readerValue: 3,
    contextRequired: "",
    confidence: 0.8,
    role: "supporting",
    rationale: "Test analysis.",
    ...overrides,
  };
}

function entry(overrides: Partial<IssueEntry> = {}): IssueEntry {
  return {
    id: "item-1",
    type: "note",
    title: "A note",
    body: "A substantial note with enough words to be meaningful.",
    url: null,
    publishedAt: "2026-10-20T10:00:00.000Z",
    createdAt: "2026-10-20T10:00:00.000Z",
    metadata: {},
    lang: "en",
    kind: "other",
    own: true,
    ...overrides,
  };
}

function candidate(
  id: string,
  options: {
    type?: string;
    topic?: string;
    role?: IssueAI["role"];
    publishedAt?: string;
    title?: string;
    body?: string;
    scores?: Partial<IssueAI>;
  } = {},
) {
  const item = entry({
    id,
    type: options.type || "note",
    title: options.title || `Note ${id}`,
    body:
      options.body ||
      `Body for ${id}. It contains a concrete observation and enough detail to be useful.`,
    publishedAt: options.publishedAt || "2026-10-20T10:00:00.000Z",
  });

  return buildCandidate(
    item,
    analysis({
      topic: options.topic || "general",
      role: options.role || "supporting",
      ...options.scores,
    }),
    windowEnd,
  );
}

const limits = { latest: 3, links: 3, videos: 2, photos: 2 };

/**
 * Build a candidate whose analysis comes from the deterministic fallback,
 * i.e. the situation where DeepSeek is unavailable or the item is not
 * ai_allowed.
 */
function heuristicCandidate(
  id: string,
  overrides: Partial<IssueEntry> = {},
) {
  const source = entry({ id, ...overrides });

  const item: FlowItem = {
    id,
    type: source.type,
    status: "published",
    visibility: "public",
    lang: source.lang === "other" ? null : source.lang,
    slug: id,
    title: source.title || null,
    body_md: source.body || null,
    source_url: source.url,
    ai_allowed: false,
    metadata: source.metadata,
    created_at: source.createdAt,
    updated_at: source.createdAt,
    published_at: source.publishedAt,
  };

  return buildCandidate(source, heuristicAnalysis(item), windowEnd);
}

describe("Flow issue editorial selection", () => {
  it("lets a strong older entry outrank a weak recent entry", () => {
    const strongOld = candidate("strong-old", {
      publishedAt: "2026-09-20T10:00:00.000Z",
      role: "lead",
      scores: {
        editorialValue: 5,
        originality: 5,
        specificity: 4,
        readerValue: 5,
        confidence: 0.9,
      },
    });
    const weakRecent = candidate("weak-recent", {
      publishedAt: "2026-10-27T10:00:00.000Z",
      role: "supporting",
      scores: {
        editorialValue: 1,
        originality: 1,
        specificity: 1,
        readerValue: 1,
        confidence: 0.9,
      },
    });

    expect(strongOld.score).toBeGreaterThan(weakRecent.score);

    const selection = selectIssueContent(
      [weakRecent, strongOld],
      limits,
      windowEnd,
    );

    expect(selection.lead?.id).toBe("strong-old");
    expect(selection.selected.map((item) => item.entry.id)).not.toContain(
      "weak-recent",
    );
  });

  it("selects the lead by editorial value rather than source order", () => {
    const weakFirst = candidate("weak-first", {
      publishedAt: "2026-10-27T10:00:00.000Z",
      scores: {
        editorialValue: 2,
        originality: 2,
        specificity: 2,
        readerValue: 2,
      },
    });
    const strongSecond = candidate("strong-second", {
      publishedAt: "2026-10-21T10:00:00.000Z",
      role: "lead",
      scores: {
        editorialValue: 4,
        originality: 5,
        specificity: 4,
        readerValue: 4,
        confidence: 0.9,
      },
    });

    const selection = selectIssueContent(
      [weakFirst, strongSecond],
      limits,
      windowEnd,
    );

    expect(selection.lead?.id).toBe("strong-second");
    expect(selection.lead?.id).not.toBe("weak-first");
  });

  it("does not let near-duplicate entries occupy several slots", () => {
    const body =
      "The same concrete observation about attention and software, repeated with identical wording.";
    const first = candidate("duplicate-a", {
      title: "Attention and software",
      body,
      scores: { editorialValue: 4, originality: 4, specificity: 4 },
    });
    const second = candidate("duplicate-b", {
      title: "Attention and software",
      body,
      publishedAt: "2026-10-19T10:00:00.000Z",
      scores: { editorialValue: 4, originality: 4, specificity: 4 },
    });
    const different = candidate("different-topic", {
      topic: "architecture",
      title: "A civic building",
      body: "A different subject with its own concrete details and claims.",
    });

    const selection = selectIssueContent(
      [first, second, different],
      { ...limits, latest: 3 },
      windowEnd,
    );

    const ids = selection.selected.map((item) => item.entry.id);

    expect(ids.includes("duplicate-a") && ids.includes("duplicate-b")).toBe(
      false,
    );
    expect(
      ids.includes("duplicate-a") || ids.includes("duplicate-b"),
    ).toBe(true);
    expect(ids).toContain("different-topic");
  });

  it("uses topic diversity when relevance is comparable", () => {
    const sameTopicA = candidate("ai-a", {
      type: "link",
      topic: "artificial intelligence",
      title: "AI and labour",
      body: "",
      scores: {
        editorialValue: 4.5,
        originality: 4,
        specificity: 4,
        readerValue: 4.5,
      },
    });
    const sameTopicB = candidate("ai-b", {
      type: "link",
      topic: "artificial intelligence",
      title: "AI and regulation",
      body: "",
      scores: {
        editorialValue: 4.4,
        originality: 4,
        specificity: 4,
        readerValue: 4.4,
      },
    });
    const otherTopic = candidate("art-c", {
      type: "link",
      topic: "contemporary art",
      title: "A museum reopens",
      body: "",
      scores: {
        editorialValue: 4.2,
        originality: 4,
        specificity: 4,
        readerValue: 4.2,
      },
    });

    const selection = selectIssueContent(
      [sameTopicA, sameTopicB, otherTopic],
      { ...limits, links: 2 },
      windowEnd,
    );

    const ids = selection.links.map((item) => item.id);

    expect(ids).toHaveLength(2);
    expect(ids).toContain("art-c");
  });

  it("keeps short links and notes when only heuristic analysis exists", () => {
    const items = [
      heuristicCandidate("note-short", {
        title: "Короткая заметка",
        body: "Мысль на два предложения.",
      }),
      heuristicCandidate("link-a", {
        type: "link",
        title: "Why archives matter",
        body: "",
        url: "https://example.com/archives",
      }),
      heuristicCandidate("link-b", {
        type: "link",
        title: "Новая книга о памяти",
        body: "",
        url: "https://example.org/book",
      }),
      heuristicCandidate("photo-a", {
        type: "photo",
        title: "",
        body: "",
        metadata: {
          public_url: "https://example.com/sea.jpg",
          alt: "Вид на море",
        },
      }),
    ];

    const selection = selectIssueContent(items, limits, windowEnd);
    const ids = selection.selected.map((item) => item.entry.id);

    // Regression: the deterministic fallback used to score every short item
    // below the selection threshold, so an issue assembled without AI
    // contained at most one long text.
    expect(ids).toContain("note-short");
    expect(ids).toContain("link-a");
    expect(ids).toContain("link-b");
    expect(ids).toContain("photo-a");
  });

  it("does not let a heuristic omit role remove an item", () => {
    const shortNote = heuristicCandidate("short-omit", {
      title: "Короткая мысль",
      body: "Два слова.",
    });

    expect(shortNote.analysis.model).toBe(HEURISTIC_MODEL);
    expect(shortNote.analysis.role).toBe("omit");

    const selection = selectIssueContent(
      [shortNote],
      limits,
      windowEnd,
    );

    expect(selection.latest.map((item) => item.id)).toContain(
      "short-omit",
    );
    // Without a real analysis the fallback must not invent a lead.
    expect(selection.lead).toBeNull();
  });

  it("omits weak material instead of padding the issue", () => {
    const weakOne = candidate("weak-1", {
      scores: {
        editorialValue: 1,
        originality: 1,
        specificity: 1,
        readerValue: 1,
        confidence: 0.9,
      },
    });
    const weakTwo = candidate("weak-2", {
      topic: "other",
      scores: {
        editorialValue: 1,
        originality: 1,
        specificity: 1,
        readerValue: 1,
        confidence: 0.9,
      },
    });

    const selection = selectIssueContent(
      [weakOne, weakTwo],
      limits,
      windowEnd,
    );

    expect(selection.lead).toBeNull();
    expect(selection.selected).toHaveLength(0);
  });

  it("requires a genuinely strong lead instead of promoting a mediocre item", () => {
    const mediocre = candidate("mediocre", {
      scores: {
        editorialValue: 2,
        originality: 2,
        specificity: 2,
        readerValue: 2,
        confidence: 0.9,
      },
    });

    expect(mediocre.score).toBeLessThan(MIN_LEAD_SCORE);

    const selection = selectIssueContent([mediocre], limits, windowEnd);

    expect(selection.lead).toBeNull();
  });

  it("is deterministic for identical inputs and analyses", () => {
    const items = [
      candidate("alpha", { topic: "one" }),
      candidate("beta", { topic: "two" }),
      candidate("gamma", { topic: "one" }),
      candidate("delta", { topic: "three" }),
    ];

    const first = selectIssueContent(items, limits, windowEnd);
    const second = selectIssueContent(
      [...items].reverse(),
      limits,
      windowEnd,
    );

    expect(first.lead?.id).toBe(second.lead?.id);
    expect(first.selected.map((item) => item.entry.id)).toEqual(
      second.selected.map((item) => item.entry.id),
    );
  });
});
