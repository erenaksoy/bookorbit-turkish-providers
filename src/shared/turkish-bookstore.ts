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
