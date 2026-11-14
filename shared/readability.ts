// Reading level, measured in code (spec, principle 2: aim for grade 8 or lower).
// Flesch-Kincaid grade = 0.39 × words per sentence + 11.8 × syllables per word − 15.59
// (Kincaid et al., 1975). Syllables are counted with a common vowel-group heuristic:
// good to about ±0.5 grade on ordinary prose, which is enough to show a trend.

/** Estimated syllables in one word. Numbers count as 2 ("twenty-five", "$4.2 million" read long). */
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return /\d/.test(word) ? 2 : 0;
  if (w.length <= 3) return 1;
  const trimmed = w
    .replace(/(?:[^laeiouy]es|[^laeiouy]e)$/, (m) => m[0]) // silent final e / es: "make", "rates"
    .replace(/([^td])ed$/, "$1") // "planned" (but "funded" keeps its syllable)
    .replace(/^y/, "");
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 0);
}

function sentencesOf(text: string): string[][] {
  return text
    .split(/[.!?]+(?=\s|$)|[\n;:]+/) // a decimal point ("4.2") is not followed by a space
    .map((s) => s.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)))
    .filter((words) => words.length > 0);
}

export interface Readability {
  grade: number;
  words: number;
  sentences: number;
  syllables: number;
}

export function readability(text: string): Readability {
  const sentences = sentencesOf(text);
  const words = sentences.flat();
  if (words.length === 0) return { grade: 0, words: 0, sentences: 0, syllables: 0 };
  const syllables = words.reduce((n, w) => n + countSyllables(w), 0);
  const grade = 0.39 * (words.length / sentences.length) + 11.8 * (syllables / words.length) - 15.59;
  return { grade: Math.round(grade * 10) / 10, words: words.length, sentences: sentences.length, syllables };
}

/** Flesch-Kincaid grade of a passage. */
export function fleschKincaidGrade(text: string): number {
  return readability(text).grade;
}

/** Grade over several short texts (e.g. a brief's statements), each read as its own sentence. */
export function readingGrade(texts: string[]): number {
  return fleschKincaidGrade(texts.map((t) => t.trim().replace(/([^.!?])$/, "$1.")).join(" "));
}
