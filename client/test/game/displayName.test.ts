import { describe, expect, it } from "vitest";
import { getFirstName } from "../../src/game/displayName";

describe("getFirstName", () => {
  it("takes the first word of a multi-word nickname", () => {
    expect(getFirstName({ nickname: "John Michael Smith", uniqueId: "jms" })).toBe("John");
  });

  it("keeps a single-word nickname as-is", () => {
    expect(getFirstName({ nickname: "  maria_luna99  ", uniqueId: "maria_luna99" })).toBe("maria_luna99");
  });

  it("truncates a long single word with a grapheme-safe ellipsis", () => {
    expect(getFirstName({ nickname: "Christopher-Alexander-Montgomery", uniqueId: "cam" })).toBe("Christopher-…");
  });

  it("falls back to the @handle when the nickname is emoji/symbol-only", () => {
    expect(getFirstName({ nickname: "🔥🔥🔥", uniqueId: "handle123" })).toBe("handle123");
  });

  it("falls back to 'Viewer' when both nickname and handle are empty", () => {
    expect(getFirstName({ nickname: "", uniqueId: "" })).toBe("Viewer");
  });

  it("collapses internal whitespace before splitting", () => {
    expect(getFirstName({ nickname: "  Jane   Doe  ", uniqueId: "jd" })).toBe("Jane");
  });

  it("keeps non-Latin names intact when short enough", () => {
    expect(getFirstName({ nickname: "山田太郎", uniqueId: "yamada" })).toBe("山田太郎");
  });

  it("does not split a grapheme cluster (emoji + name) mid-character when truncating", () => {
    const name = "👨‍👩‍👧‍👦" + "abcdefghijklmno"; // family emoji (1 grapheme) + 15 letters
    const result = getFirstName({ nickname: name, uniqueId: "family" });
    expect(result.endsWith("…")).toBe(true);
    expect([...result].join("")).not.toContain("�");
  });
});
