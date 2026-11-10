/**
 * Rewrites the irrigation planner's server text into words a farmer uses.
 * Pure and SSR-safe: no DOM, no browser globals.
 */

type Replacer = string | ((match: string, ...groups: string[]) => string);

/** A matched capital is carried over only at the start of the text or of a sentence ("Kc" mid-sentence stays lower case). */
const keepCase = (match: string, word: string, before: string): string =>
  /^[A-Z]/.test(match) && /^[a-z]/.test(word) && (before.trim() === '' || /[.!?:]\s*$/.test(before))
    ? word.charAt(0).toUpperCase() + word.slice(1)
    : word;

/** Replace `re` with `word`, carrying a leading capital over when the match starts a sentence. */
const swap = (text: string, re: RegExp, word: Replacer): string =>
  text.replace(re, (m: string, ...rest: unknown[]) => {
    const offset = rest.find((g): g is number => typeof g === 'number') ?? 0;
    const groups = rest.filter((g): g is string => typeof g === 'string' && g !== text);
    const out = typeof word === 'function' ? word(m, ...groups) : word;
    return keepCase(m, out, text.slice(0, offset));
  });

const UNIT = '(?:mm|m³|m3|litres?|liters?|l)';
const NUMBER = '[\\d.,]+';
/** A bracket that only restates a quantity, e.g. "(25 mm)", "(about 12 m³)", "(5-8 litres per plant)". */
const UNIT_BRACKET = new RegExp(
  `\\s*\\(\\s*(?:about\\s+|around\\s+|approx\\.?\\s+|~\\s*)?${NUMBER}(?:\\s*(?:-|–|to)\\s*${NUMBER})?\\s*${UNIT}(?:\\s*(?:per|/|a)\\s*[a-z]+)?\\s*\\)`,
  'gi',
);

const dropAgronomistSentences = (text: string): string => {
  const sentences = text.match(/[^.!?]+(?:[.!?]+|$)\s*/g);
  if (!sentences) return text;
  return sentences.filter((s) => !/agronomist/i.test(s)).join('');
};

/** Ordered: specific phrases first so the generic ones do not break them. */
const RULES: [RegExp, Replacer][] = [
  [/\bstress (?:mark|line|level)\b/gi, 'dry mark'],
  [/\b(feel|feels|feeling)\s+(?:water\s+)?stress\b/gi, (_m, v) => (v.toLowerCase() === 'feels' ? 'gets too dry' : v.toLowerCase() === 'feeling' ? 'getting too dry' : 'get too dry')],
  [/\b(reach|reaches|reached|reaching)\s+(?:water\s+)?stress\b/gi, (_m, v) => (v.toLowerCase() === 'reaches' ? 'gets too dry' : v.toLowerCase() === 'reached' ? 'got too dry' : v.toLowerCase() === 'reaching' ? 'getting too dry' : 'get too dry')],
  [/\bwater stress\b/gi, 'dry soil'],
  [/\bstressed\b/gi, 'too dry'],
  [/\bstruggles\b/gi, 'gets too dry'],
  [/\bstruggling\b/gi, 'too dry'],
  [/\bstruggle\b/gi, 'get too dry'],
  [/\bstress\b/gi, 'dryness'],

  [/\busable water(?: reserve)?\b/gi, 'soil water'],
  [/\bwater reserve\b/gi, 'soil water'],
  [/\breserve\b/gi, 'soil water'],
  [/\bfield capacity\b/gi, 'full'],
  [/\b(?:the\s+)?(?:permanent\s+)?wilting point\b/gi, 'the level where plants wilt'],
  [/\bevapotranspiration\b/gi, 'water use'],
  [/\bET[oc]?\b/g, 'water use'],
  [/\bKc\b/gi, 'crop water need'],
  [/\broot[ -]zone\b/gi, 'soil around the roots'],
  [/\bdepletion\b/gi, 'drying out'],
  [/\bdepleted\b/gi, 'dried out'],

  [/\birrigating\b/gi, 'watering'],
  [/\birrigation\b/gi, 'watering'],
  [/\birrigated\b/gi, 'watered'],
  [/\birrigates\b/gi, 'waters'],
  [/\birrigate\b/gi, 'water'],
];

export function plainWords(text: string): string {
  if (!text) return '';
  let out = dropAgronomistSentences(String(text));
  out = out.replace(UNIT_BRACKET, '');
  for (const [re, word] of RULES) out = swap(out, re, word);
  return out
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}
