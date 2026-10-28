import {
  getPayloadItemIds,
  samePayloadComposition,
} from "../draft";

describe("existing issue draft detection", () => {
  it("treats the same source records as the same draft even if order changed", () => {
    const first = {
      lead: { id: "a" },
      latest: [{ id: "b" }, { id: "c" }],
      links: [],
      videos: [],
      photos: [],
    };
    const second = {
      lead: { id: "b" },
      latest: [{ id: "a" }, { id: "c" }],
      links: [],
      videos: [],
      photos: [],
    };

    expect(samePayloadComposition(first, second)).toBe(true);
    expect(getPayloadItemIds(first)).toEqual(["a", "b", "c"]);
  });

  it("does not reuse a draft with different records", () => {
    const first = {
      lead: { id: "a" },
      latest: [{ id: "b" }],
    };
    const second = {
      lead: { id: "a" },
      latest: [{ id: "c" }],
    };

    expect(samePayloadComposition(first, second)).toBe(false);
  });

  it("does not treat an empty payload as a reusable draft", () => {
    expect(
      samePayloadComposition(
        { lead: null, latest: [] },
        { lead: null, latest: [] },
      ),
    ).toBe(false);
  });
});
