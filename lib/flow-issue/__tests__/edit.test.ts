import { applyIssueEdits } from "../edit";
import type { IssueEntry, IssuePayload } from "../types";

function entry(overrides: Partial<IssueEntry> = {}): IssueEntry {
  return {
    id: "item-1",
    type: "note",
    title: "Title",
    body: "Body",
    url: null,
    publishedAt: "2026-10-01T00:00:00.000Z",
    createdAt: "2026-10-01T00:00:00.000Z",
    metadata: {},
    lang: "en",
    kind: "other",
    own: true,
    ...overrides,
  };
}

function payload(): IssuePayload {
  return {
    schemaVersion: 2,
    lang: "ru",
    period: {
      start: "2026-09-01T00:00:00.000Z",
      end: "2026-10-01T00:00:00.000Z",
      timezone: "UTC",
    },
    stats: {
      total: 0,
      published: 0,
      drafts: 0,
      days: 30,
      medianDelaySeconds: null,
      byType: {},
      byKind: { about_flow: 0, world: 0, other: 0 },
      own: 0,
      external: 0,
      byUtcHour: [],
      perDay: [],
      delays: [],
      quality: {
        langFieldMismatch: 0,
        photoAltEqualsFilename: 0,
        emptyDrafts: 0,
      },
    },
    lead: entry({ id: "lead" }),
    latest: [
      entry({ id: "latest-a", title: "A" }),
      entry({ id: "latest-b", title: "B" }),
    ],
    links: [
      {
        ...entry({
          id: "link",
          type: "link",
          title: "Link",
          body: "",
          url: "https://example.com/story",
          metadata: {
            link_previews: [
              {
                url: "https://example.com/story",
                title: "Link",
                description: "Old description",
                site_name: "Example",
              },
            ],
          },
        }),
        description: "Old description",
        siteName: "Example",
        author: "",
        image: "",
        originalDate: null,
        ageDays: null,
      },
    ],
    videos: [],
    photos: [],
    sourceIndex: [
      {
        id: "link",
        source: "Example",
        title: "Link",
        url: "https://example.com/story",
        originalDate: null,
        addedAt: "2026-10-01T00:00:00.000Z",
      },
    ],
    templateVersion: 0,
    template: {
      theme: {
        accent: "#990F3D",
        paper: "#FFFFFF",
        ink: "#1C1A1B",
        muted: "#6B6568",
        rule: "#DDD6D8",
        maxWidth: 760,
        serifFont: "Georgia",
        sansFont: "Inter",
      },
      limits: { latest: 6, links: 5, videos: 4, photos: 4 },
      sections: {
        order: [
          "lead",
          "latest",
          "links",
          "videos",
          "photos",
          "metrics",
          "sources",
          "subscribe",
        ],
        enabled: {
          lead: true,
          latest: true,
          links: true,
          videos: true,
          photos: true,
          metrics: true,
          sources: true,
          subscribe: true,
        },
      },
      labels: {
        ru: {
          masthead: "Поток",
          lead: "Главное",
          latest: "Последнее",
          links: "Читать",
          videos: "Смотреть",
          photos: "Кадр",
          metrics: "Цифры",
          sources: "Источники",
          subscribe: "Подписка",
          subscribeCopy: "",
        },
        en: {
          masthead: "Flow",
          lead: "Lead",
          latest: "Latest",
          links: "Read",
          videos: "Watch",
          photos: "Frame",
          metrics: "Numbers",
          sources: "Sources",
          subscribe: "Subscribe",
          subscribeCopy: "",
        },
      },
    },
    design: {
      template: "classic",
      tokens: {
        accent: "#990F3D",
        paper: "#FFFFFF",
        ink: "#1C1A1B",
      },
    },
  };
}

describe("manual Flow issue edits", () => {
  it("edits copy without changing source identity", () => {
    const source = payload();
    const edited = applyIssueEdits(source, {
      lead: { id: "lead", title: "New lead", body: "New body" },
      links: [
        {
          id: "link",
          title: "New link title",
          description: "New link description",
        },
      ],
    });

    expect(edited.lead?.id).toBe("lead");
    expect(edited.lead?.title).toBe("New lead");
    expect(edited.lead?.body).toBe("New body");
    expect(edited.links[0].id).toBe("link");
    expect(edited.links[0].title).toBe("New link title");
    expect(edited.links[0].url).toBe("https://example.com/story");
    expect(source.lead?.title).toBe("Title");
  });

  it("reorders and removes entries", () => {
    const edited = applyIssueEdits(payload(), {
      latest: [
        { id: "latest-b", title: "B" },
        { id: "latest-a", title: "A" },
      ],
    });

    expect(edited.latest.map((item) => item.id)).toEqual([
      "latest-b",
      "latest-a",
    ]);

    const removed = applyIssueEdits(payload(), {
      latest: [{ id: "latest-a", title: "A" }],
      links: [],
    });

    expect(removed.latest).toHaveLength(1);
    expect(removed.links).toHaveLength(0);
    expect(removed.sourceIndex).toHaveLength(0);
  });

  it("can remove the lead and rebuild the source index", () => {
    const edited = applyIssueEdits(payload(), {
      lead: null,
      links: [
        {
          id: "link",
          title: "Edited link",
          description: "Edited description",
        },
      ],
    });

    expect(edited.lead).toBeNull();
    expect(edited.sourceIndex[0].title).toBe("Edited link");
    expect(edited.sourceIndex[0].source).toBe("Example");
  });

  it("rejects entries that are not part of the issue", () => {
    expect(() =>
      applyIssueEdits(payload(), {
        latest: [{ id: "foreign-id", title: "Injected" }],
      }),
    ).toThrow(/not part of this issue/);
  });

  it("rejects duplicate ids", () => {
    expect(() =>
      applyIssueEdits(payload(), {
        latest: [
          { id: "latest-a", title: "A" },
          { id: "latest-a", title: "A again" },
        ],
      }),
    ).toThrow(/duplicate/);
  });
});
