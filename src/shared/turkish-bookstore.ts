import { htmlToPlainText } from './html-to-text';

const LANGUAGE_CODES: Record<string, string> = {
  türkçe: 'tr',
  ingilizce: 'en',
  ispanyolca: 'es',
  italyanca: 'it',
  korece: 'ko',
  rusça: 'ru',
  almanca: 'de',
  fransızca: 'fr',
  arapça: 'ar',
  osmanlıca: 'ota',
  japonca: 'ja',
  çince: 'zh',
  farsça: 'fa',
  kürtçe: 'ku',
  yunanca: 'el',
  latince: 'la',
  turkish: 'tr',
  english: 'en',
};

export function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

export function scalarText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

export function trLower(value: string): string {
  return value.replace(/I/g, 'ı').replace(/İ/g, 'i').toLowerCase();
}

export function trTitle(value: string): string {
  return trLower(value)
    .split(' ')
    .map((word) => (word ? (word[0] === 'i' ? 'İ' : word[0].toUpperCase()) + word.slice(1) : word))
    .join(' ');
}

export function mapTurkishLanguage(raw: string | null | undefined): string | undefined {
  const name = trLower(cleanText(raw));
  return name ? (LANGUAGE_CODES[name] ?? undefined) : undefined;
}

export function normalizeIsbn13(raw: string | null | undefined): string | undefined {
  const digits = (raw ?? '').replace(/[^0-9]/g, '');
  if (!/^97[89]\d{10}$/.test(digits)) return undefined;
  const sum = [...digits].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return sum % 10 === 0 ? digits : undefined;
}

/** Turns an ISBN-10 into its ISBN-13, the form bookstore barcodes use. */
export function toIsbn13(isbn: string): string | undefined {
  if (isbn.length === 13) return normalizeIsbn13(isbn);
  if (!/^\d{9}[\dX]$/i.test(isbn)) return undefined;
  const stem = `978${isbn.slice(0, 9)}`;
  const sum = [...stem].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return `${stem}${(10 - (sum % 10)) % 10}`;
}

export interface NamedResult {
  slug: string;
  name: string;
}

/** A name with Turkish letters folded to plain ones, so "Oguz Atay" still matches "Oğuz Atay". */
export function foldName(value: string): string {
  return normalizeName(value)
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/**
 * A title also turns up books about it ("Tutunamayanlar" finds a study of it), so when some results
 * are by the requested author, only those are kept. None matching means the name is spelled
 * differently there, and the title alone decides.
 */
export function preferAuthor<T extends { authors?: readonly string[] }>(items: readonly T[], author: string | undefined): T[] {
  const wanted = foldName(author ?? '');
  if (!wanted) return [...items];
  const matching = items.filter((item) => item.authors?.some((name) => foldName(name) === wanted));
  return matching.length > 0 ? matching : [...items];
}

export function normalizeName(value: string): string {
  return trLower(cleanText(value))
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Keeps the results whose name holds every word of the title, exact names first. For sites whose
 * search matches any one word, or matches inside other titles.
 */
export function filterResultsByTitle(results: readonly NamedResult[], title: string, limit: number): string[] {
  const wanted = normalizeName(title);
  const words = wanted.split(' ').filter((word) => word.length > 1);
  if (words.length === 0) return [];
  return results
    .map((result) => ({ result, name: normalizeName(result.name) }))
    .filter(({ name }) => words.every((word) => name.includes(word)))
    .sort((a, b) => Number(b.name === wanted) - Number(a.name === wanted) || a.name.length - b.name.length)
    .slice(0, limit)
    .map(({ result }) => result.slug);
}

/**
 * The titles to search for, without the author: a title carrying its author ("Author - Title") is
 * tried by its remaining segments, the last first since that is the usual form.
 */
export function buildTitleQueries(title: string | undefined, author: string | undefined): string[] {
  const authorKey = normalizeName(author ?? '');
  const segments = cleanText(title)
    .split(/\s+[-\u2013\u2014]\s+/)
    .map(cleanText)
    .filter(Boolean);
  const titles = segments.filter((segment) => segments.length < 2 || !authorKey || normalizeName(segment) !== authorKey).reverse();
  return [...new Set(titles)];
}

export function descriptionFromHtml(html: string | null | undefined): string | undefined {
  if (!html) return undefined;
  const text = htmlToPlainText(html, { preserveLineBreaks: true });
  return text || undefined;
}

export function yearOf(raw: string | null | undefined): number | undefined {
  const match = /\b(1[5-9]\d\d|20\d\d)\b/.exec(raw ?? '');
  return match ? Number(match[1]) : undefined;
}

export const IGNORED_CATEGORIES: ReadonlySet<string> = new Set(['Kitap', 'Diğer']);

export const BROWSER_HEADERS: Record<string, string> = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'tr-TR,tr;q=0.9,en;q=0.8',
};
