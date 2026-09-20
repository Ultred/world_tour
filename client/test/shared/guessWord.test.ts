import { describe, expect, it } from "vitest";
import { cleanGuessWord } from "../../../shared/guessWord";

describe("cleanGuessWord", () => {
  it("uppercases a plain word", () => {
    expect(cleanGuessWord("cat")).toBe("CAT");
  });

  it("strips emoji from a decorated guess", () => {
    expect(cleanGuessWord("CAT🔥")).toBe("CAT");
  });

  it("reduces an emoji-only comment to nothing", () => {
    expect(cleanGuessWord("🔥🔥🔥")).toBe("");
  });

  it("strips punctuation, digits and whitespace", () => {
    expect(cleanGuessWord("  c-a-t123!  ")).toBe("CAT");
  });

  it("returns empty for an empty string", () => {
    expect(cleanGuessWord("")).toBe("");
  });
});
