import { describe, expect, it } from "vitest";
import { markdownToWords, stripMarkdown } from "@/lib/markdown";

describe("stripMarkdown", () => {
  it("returns plain text unchanged", () => {
    expect(stripMarkdown("Just a plain sentence.")).toBe("Just a plain sentence.");
  });

  it("removes emphasis markers but keeps the words", () => {
    expect(stripMarkdown("The **mitochondria** is the *powerhouse* of the ___cell___.")).toBe(
      "The mitochondria is the powerhouse of the cell."
    );
  });

  it("removes inline code and strikethrough markers", () => {
    expect(stripMarkdown("Use `map()` and ~~forEach~~ here.")).toBe("Use map() and forEach here.");
  });

  it("removes heading and blockquote markers", () => {
    expect(stripMarkdown("## Photosynthesis\n> Light becomes sugar.")).toBe("Photosynthesis\nLight becomes sugar.");
  });

  it("removes list bullets and ordered markers", () => {
    expect(stripMarkdown("- one idea\n* another\n2. third")).toBe("one idea\nanother\nthird");
  });

  it("keeps link labels and drops URLs", () => {
    expect(stripMarkdown("See [the docs](https://example.com) for more.")).toBe("See the docs for more.");
  });

  it("drops code fences but keeps code content", () => {
    expect(stripMarkdown("```js\nconst x = 1\n```")).toBe("const x = 1");
  });

  it("preserves paragraph structure", () => {
    expect(stripMarkdown("First paragraph.\n\nSecond **bold** paragraph.")).toBe(
      "First paragraph.\n\nSecond bold paragraph."
    );
  });

  it("does not mangle arithmetic that looks like emphasis", () => {
    // A single asterisk pair around multiple words is treated as emphasis;
    // isolated asterisks with spaces around them survive.
    expect(stripMarkdown("2 * 3 = 6")).toBe("2 * 3 = 6");
  });
});

describe("markdownToWords", () => {
  it("counts words without markdown markers", () => {
    expect(markdownToWords("- **Alpha** beta\n- *Gamma*")).toEqual(["Alpha", "beta", "Gamma"]);
  });

  it("handles empty content", () => {
    expect(markdownToWords("")).toEqual([]);
  });
});
