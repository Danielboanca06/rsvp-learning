// Plain-text projection of the conservative markdown we let the LLM emit in
// module content and chat replies. Used wherever the text is consumed as raw
// words rather than rendered: the RSVP word stream, word counts, and grading
// comparisons. Not a general-purpose markdown parser — it only strips the
// constructs our prompts allow (emphasis, inline code, headings, lists,
// blockquotes, links).

export function stripMarkdown(text: string): string {
  return (
    text
      // Fenced code blocks: keep the code, drop the fences.
      .replace(/```[^\n]*\n?/g, "")
      // Headings and blockquote markers at line start.
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/^\s{0,3}>\s?/gm, "")
      // List bullets and ordered-list markers at line start.
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+[.)]\s+/gm, "")
      // Emphasis / strong / strikethrough / inline code, innermost first.
      .replace(/(\*\*\*|___)(.+?)\1/g, "$2")
      .replace(/(\*\*|__)(.+?)\1/g, "$2")
      .replace(/([*_])(.+?)\1/g, "$2")
      .replace(/~~(.+?)~~/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      // Links and images: keep the label, drop the URL.
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      // Horizontal rules.
      .replace(/^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/gm, "")
      .replace(/[ \t]+\n/g, "\n")
      .trim()
  );
}

/** Word list for RSVP playback / lookup, computed from the plain-text projection. */
export function markdownToWords(text: string): string[] {
  return stripMarkdown(text).split(/\s+/).filter(Boolean);
}
