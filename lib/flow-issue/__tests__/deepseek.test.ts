const mockCreate = jest.fn();

jest.mock("openai", () => ({
  __esModule: true,
  default: jest.fn(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}));

import {
  ANALYSIS_VERSION,
  HEURISTIC_MODEL,
  buildAnalysisInput,
  contentHash,
} from "../analysis";
import {
  classifyNewItems,
  translateIssueEntries,
} from "../deepseek";
import type { FlowItem } from "../types";

function item(overrides: Partial<FlowItem> = {}): FlowItem {
  return {
    id: "item-1",
    type: "note",
    status: "published",
    visibility: "public",
    lang: "en",
    slug: "item-1",
    title: "A concrete observation",
    body_md:
      "This note contains a specific claim, a number such as 42, and enough detail to be useful.",
    source_url: null,
    ai_allowed: true,
    metadata: {},
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    published_at: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

function validAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    lang: "en",
    kind: "world",
    topic: "technology",
    subtopic: "",
    summary: "A summary of the item.",
    thesis: "A central claim.",
    editorialValue: 4,
    originality: 4,
    specificity: 4,
    readerValue: 4,
    contextRequired: "",
    confidence: 0.8,
    role: "supporting",
    rationale: "Grounded in the supplied material.",
    ...overrides,
  };
}

function aiResponse(payload: unknown) {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify(payload),
        },
      },
    ],
  };
}

function fakeSupabase() {
  const updates: { id: string; metadata: any }[] = [];

  return {
    updates,
    client: {
      from: () => ({
        update: (payload: any) => ({
          eq: async (_column: string, id: string) => {
            updates.push({ id, metadata: payload.metadata });
            return { error: null };
          },
        }),
      }),
    },
  };
}

describe("Flow issue AI analysis", () => {
  const originalKey = process.env.DEEPSEEK_API_KEY;

  beforeEach(() => {
    mockCreate.mockReset();
    delete process.env.GEMINI_API_KEY;
    process.env.DEEPSEEK_API_KEY = "test-key";
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
  });

  it("never sends an item with ai_allowed === false to the model", async () => {
    const allowed = item({ id: "allowed", body_md: "Allowed item content." });
    const forbidden = item({
      id: "forbidden",
      body_md: "Forbidden private content that must stay local.",
      ai_allowed: false,
    });

    mockCreate.mockResolvedValue(aiResponse(validAnalysis()));

    const supabase = fakeSupabase();
    const result = await classifyNewItems(supabase.client, [
      allowed,
      forbidden,
    ]);

    expect(mockCreate).toHaveBeenCalledTimes(1);

    const request = mockCreate.mock.calls[0][0];
    const payload = JSON.parse(request.messages[1].content);

    expect(payload.material).toContain("Allowed item content");
    expect(payload.material).not.toContain("Forbidden private content");
    expect(result.get("allowed")?.model).not.toBe(HEURISTIC_MODEL);
    expect(result.get("forbidden")?.model).toBe(HEURISTIC_MODEL);
    expect(supabase.updates).toHaveLength(1);
    expect(supabase.updates[0].id).toBe("allowed");
  });

  it("ignores cached model analysis after an item is marked ai_allowed === false", async () => {
    const forbidden = item({
      id: "forbidden-cached",
      ai_allowed: false,
    });
    const cached = {
      ...validAnalysis(),
      schemaVersion: ANALYSIS_VERSION,
      contentHash: contentHash(buildAnalysisInput(forbidden)),
      model: "cached-model",
      at: "2026-10-02T00:00:00.000Z",
    };

    const result = await classifyNewItems(fakeSupabase().client, [
      item({
        id: "forbidden-cached",
        ai_allowed: false,
        metadata: { issue_ai: cached },
      }),
    ]);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.get("forbidden-cached")?.model).toBe(HEURISTIC_MODEL);
  });

  it("rejects malformed model output safely and uses heuristics", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '{"lang":"en"}' } }],
    });

    const supabase = fakeSupabase();
    const result = await classifyNewItems(supabase.client, [item()]);

    expect(result.get("item-1")?.model).toBe(HEURISTIC_MODEL);
    expect(supabase.updates).toHaveLength(0);
  });

  it("does not fail issue generation when the AI service is unavailable", async () => {
    mockCreate.mockRejectedValue(new Error("service unavailable"));

    const supabase = fakeSupabase();
    const result = await classifyNewItems(supabase.client, [item()]);

    expect(result.get("item-1")?.model).toBe(HEURISTIC_MODEL);
    expect(supabase.updates).toHaveLength(0);
  });

  it("uses deterministic heuristics without attempting a request when no key is configured", async () => {
    delete process.env.DEEPSEEK_API_KEY;

    const supabase = fakeSupabase();
    const result = await classifyNewItems(supabase.client, [item()]);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.get("item-1")?.model).toBe(HEURISTIC_MODEL);
    expect(result.get("item-1")?.schemaVersion).toBe(ANALYSIS_VERSION);
  });

  it("reuses a valid cached analysis for the same source material", async () => {
    const source = item();
    const cached = {
      ...validAnalysis(),
      schemaVersion: ANALYSIS_VERSION,
      contentHash: contentHash(buildAnalysisInput(source)),
      model: "cached-model",
      at: "2026-10-02T00:00:00.000Z",
    };

    const result = await classifyNewItems(fakeSupabase().client, [
      item({ metadata: { issue_ai: cached } }),
    ]);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.get("item-1")?.model).toBe("cached-model");
  });

  it("reanalyzes when the source content changed", async () => {
    const original = item();
    const cached = {
      ...validAnalysis(),
      schemaVersion: ANALYSIS_VERSION,
      contentHash: contentHash(buildAnalysisInput(original)),
      model: "cached-model",
      at: "2026-10-02T00:00:00.000Z",
    };

    mockCreate.mockResolvedValue(aiResponse(validAnalysis()));

    await classifyNewItems(fakeSupabase().client, [
      item({
        body_md: `${original.body_md} Changed.`,
        metadata: { issue_ai: cached },
      }),
    ]);

    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

describe("Flow issue Gemini primary and DeepSeek fallback", () => {
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalFetch = global.fetch;

  function geminiResponse(payload: unknown) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify(payload) }],
            },
          },
        ],
      }),
    } as Response;
  }

  beforeEach(() => {
    mockCreate.mockReset();
    process.env.GEMINI_API_KEY = "test-gemini";
    process.env.DEEPSEEK_API_KEY = "test-deepseek";
    process.env.OPS_CIRCUIT_FAILURE_THRESHOLD = "5";
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
    if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGeminiKey;
  });

  it("uses Gemini and writes the actual model into the cache", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      geminiResponse(validAnalysis({ topic: "gemini-topic" })),
    );

    const supabase = fakeSupabase();
    const result = await classifyNewItems(supabase.client, [item()]);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.get("item-1")?.model).toBe("gemini-3.5-flash");
    expect(result.get("item-1")?.provider).toBe("gemini");
    expect(result.get("item-1")?.fallbackUsed).toBe(false);
    expect(result.get("item-1")?.topic).toBe("gemini-topic");
    expect(supabase.updates).toHaveLength(1);
  });

  it("falls back to DeepSeek when Gemini returns invalid schema data", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      geminiResponse({ lang: "en" }),
    );
    mockCreate.mockResolvedValueOnce(aiResponse(validAnalysis({ topic: "deepseek-topic" })));

    const supabase = fakeSupabase();
    const result = await classifyNewItems(supabase.client, [item()]);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result.get("item-1")?.model).toBe("deepseek-chat");
    expect(result.get("item-1")?.provider).toBe("deepseek");
    expect(result.get("item-1")?.fallbackUsed).toBe(true);
    expect(result.get("item-1")?.topic).toBe("deepseek-topic");
    expect(supabase.updates).toHaveLength(1);
  });

  it("falls back to DeepSeek on Gemini 429 without retrying Gemini", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: "quota exceeded" } }),
    } as Response);
    mockCreate.mockResolvedValueOnce(aiResponse(validAnalysis()));

    const result = await classifyNewItems(fakeSupabase().client, [item()]);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result.get("item-1")?.model).toBe("deepseek-chat");
  });
});

describe("Flow issue translation privacy", () => {
  const originalKey = process.env.DEEPSEEK_API_KEY;

  beforeEach(() => {
    mockCreate.mockReset();
    delete process.env.GEMINI_API_KEY;
    process.env.DEEPSEEK_API_KEY = "test-key";
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
  });

  it("does not translate ai_allowed === false content", async () => {
    const entries = [
      {
        key: "lead",
        title: "Приватная заметка",
        body: "Это очень личный текст, который не должен покидать сервер.",
        description: "",
        alt: "",
        caption: "",
        aiAllowed: false,
      },
    ];

    const translated = await translateIssueEntries(entries);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(translated[0].body).toBe(entries[0].body);
  });

  it("translates AI-allowed Russian content and preserves it on success", async () => {
    mockCreate.mockResolvedValue(
      aiResponse({
        title: "A private note",
        body: "This is translated English text.",
        description: "",
        alt: "",
        caption: "",
      }),
    );

    const translated = await translateIssueEntries([
      {
        key: "lead",
        title: "Приватная заметка",
        body: "Это очень личный текст, который должен быть переведен.",
        description: "",
        alt: "",
        caption: "",
        aiAllowed: true,
      },
    ]);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(translated[0].title).toBe("A private note");
    expect(translated[0].body).toBe("This is translated English text.");
  });
});
