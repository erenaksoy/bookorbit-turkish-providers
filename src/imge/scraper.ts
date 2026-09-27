import { cleanText, mapTurkishLanguage, normalizeIsbn13, scalarText, type NamedResult } from '../shared/turkish-bookstore';

export interface ImgeBookData {
  providerId: string;
  title: string;
  subtitle?: string;
  authors?: string[];
  publisher?: string;
  description?: string;
  publishedDate?: string;
  language?: string;
  pageCount?: number;
  isbn13: string;
  genres?: string[];
  coverUrl?: string;
}

const IMGE_BASE_URL = 'https://www.imge.com.tr';
const API_SEARCH_URL = 'https://b2bapi.onsocloud.com/api/public/product/search';
/** Imge's store on the Kibo platform, the public id its own site sends with every request. */
export const IMGE_MERCHANT_ID = 'eaf65a337c09985a1631c62df537b20d';
const AUTHOR_ROLE = 0;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function buildImgeSearchUrl(query: string, limit: number): string {
  const params = new URLSearchParams({ search_text: query, sort_type: '0', limit: String(limit), page: '1' });
  return `${API_SEARCH_URL}?${params.toString()}`;
}

export function buildImgeProductUrl(slug: string): string {
  return `${IMGE_BASE_URL}/urun/${encodeURIComponent(slug)}`;
}

export function extractImgeSlug(value: string): string | undefined {
  const trimmed = value.trim();
  const fromUrl = /\/urun\/([^/?#]+)/.exec(trimmed)?.[1] ?? trimmed;
  return SLUG_PATTERN.test(fromUrl) ? fromUrl : undefined;
}

/** Product links end with the ISBN, which is also the one thing the search finds exactly. */
export function isbnFromImgeSlug(slug: string): string | undefined {
  return normalizeIsbn13(/-(97[89]\d{10})$/.exec(slug)?.[1]);
}

/**
 * The search answers with every detail a candidate needs, so no product page is fetched. Only rows
 * whose barcode is a valid ISBN are books: magazines and hobby items are sold alongside them.
 */
export function parseImgeSearchResults(data: unknown): ImgeBookData[] {
  const list = asRecord(asRecord(asRecord(asRecord(data).KiboApp).Response).data).list;
  const books: ImgeBookData[] = [];
  for (const row of Array.isArray(list) ? list : []) {
    const book = parseRow(asRecord(row));
    if (book && !books.some((existing) => existing.providerId === book.providerId)) books.push(book);
  }
  return books;
}

export function toNamedResults(books: readonly ImgeBookData[]): NamedResult[] {
  return books.map((book) => ({ slug: book.providerId, name: book.title }));
}

function parseRow(row: Record<string, unknown>): ImgeBookData | undefined {
  const product = asRecord(row.product_json);
  const isbn13 = normalizeIsbn13(scalarText(product.barkod ?? row.barkod));
  const slug = scalarText(product.seo_link ?? row.seo_link);
  // The site separates a subtitle with ";".
  const [title, ...rest] = scalarText(product.stokcins ?? row.stokcins)
    .split(';')
    .map(cleanText);
  if (!isbn13 || !title || !SLUG_PATTERN.test(slug)) return undefined;

  return {
    providerId: slug,
    title,
    subtitle: rest.filter(Boolean).join(': ') || undefined,
    authors: extractAuthors(product.authors),
    publisher: tidyName(scalarText(row.uretici_ad)),
    description: cleanDescription(scalarText(product.ozet)),
    publishedDate: extractPublishedDate(product),
    language: mapTurkishLanguage(scalarText(asRecord(product.yayin_dili).ln_name)),
    pageCount: positiveInt(product.sayfasayisi),
    isbn13,
    genres: cleanText(scalarText(row.kategori_ad)) ? [cleanText(scalarText(row.kategori_ad))] : undefined,
    coverUrl: extractCoverUrl(product.files),
  };
}

// Translators, editors and illustrators are listed with the authors under other roles.
function extractAuthors(raw: unknown): string[] | undefined {
  const authors: string[] = [];
  for (const entry of Array.isArray(raw) ? raw.map(asRecord) : []) {
    const name = cleanText(scalarText(entry.at_name));
    if (Number(entry.at_who) === AUTHOR_ROLE && name && !authors.includes(name)) authors.push(name);
  }
  return authors.length ? authors : undefined;
}

// The date is when the current printing was made, so it only dates the edition on a first printing:
// a 54th printing would otherwise pass for a new book.
function extractPublishedDate(product: Record<string, unknown>): string | undefined {
  const printing = Number(product.baskino);
  if (printing > 1) return undefined;
  const date = /^(\d{4}-\d{2}-\d{2})/.exec(scalarText(product.stk_date_print))?.[1];
  return date && !date.startsWith('0000') ? date : undefined;
}

function extractCoverUrl(raw: unknown): string | undefined {
  const files = (Array.isArray(raw) ? raw.map(asRecord) : [])
    .filter((file) => Number(file.fl_type) === 1)
    .sort((a, b) => Number(a.fl_sort) - Number(b.fl_sort));
  const url = scalarText(files[0]?.fl_url);
  return /^https:\/\//.test(url) ? url : undefined;
}

function cleanDescription(raw: string): string | undefined {
  const text = raw
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || undefined;
}

// "Yapı Kredi Yayınları ( YKY )" -> "Yapı Kredi Yayınları (YKY)"
function tidyName(raw: string): string | undefined {
  const name = cleanText(raw).replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
  return name || undefined;
}

function positiveInt(value: unknown): number | undefined {
  const parsed = Number.parseInt(scalarText(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
