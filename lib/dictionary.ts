const DICTIONARY_API_URL = "https://api.dictionaryapi.dev/api/v2/entries/en";

export type DictionaryLookup = {
  word: string;
  definition: string | null;
};

export async function lookupDefinition(word: string): Promise<DictionaryLookup> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${DICTIONARY_API_URL}/${encodeURIComponent(word.toLowerCase())}`, {
      signal: controller.signal,
    });

    if (!response.ok) {
      return { word, definition: null };
    }

    const data = await response.json();
    const entry = Array.isArray(data) ? data[0] : null;
    const meaning = entry?.meanings?.[0];
    const definitionText = meaning?.definitions?.[0]?.definition;

    if (typeof definitionText !== "string" || definitionText.trim().length === 0) {
      return { word, definition: null };
    }

    const partOfSpeech = typeof meaning?.partOfSpeech === "string" ? meaning.partOfSpeech : null;
    return {
      word,
      definition: partOfSpeech ? `(${partOfSpeech}) ${definitionText.trim()}` : definitionText.trim(),
    };
  } catch {
    return { word, definition: null };
  } finally {
    clearTimeout(timeout);
  }
}
