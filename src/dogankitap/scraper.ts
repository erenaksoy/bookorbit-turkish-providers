import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';

import { cleanText, descriptionFromHtml, normalizeIsbn13, scalarText, yearOf, type NamedResult } from '../shared/turkish-bookstore';

export interface DoganKitapBookData {
  providerId?: string;
  title?: string;
  authors?: string[];
  publisher?: string;
  description?: string;
  publishedYear?: number;
  pageCount?: number;
  isbn13?: string;
  genres?: string[];
  coverUrl?: string;
}

export interface DoganKitapSearchResults {
  books: NamedResult[];
  /** Author pages, by slug, which list every book of that author. */
  authors: NamedResult[];
}

const DOGAN_KITAP_BASE_URL = 'https://www.dogankitap.com.tr';
export const DOGAN_KITAP_SEARCH_URL = `${DOGAN_KITAP_BASE_URL}/ajax`;
const PUBLISHER_NAME = 'Doğan Kitap';
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function buildDoganKitapSearchBody(query: string): string {
  return new URLSearchParams({ type: 'aramasonuclari', kelime: query }).toString();
}

export function buildDoganKitapBookUrl(slug: string): string {
  return `${DOGAN_KITAP_BASE_URL}/kitap/${encodeURIComponent(slug)}`;
}

export function buildDoganKitapAuthorUrl(slug: string): string {
  return `${DOGAN_KITAP_BASE_URL}/yazar/${encodeURIComponent(slug)}`;
}

export function extractDoganKitapSlug(value: string): string | undefined {
  const trimmed = value.trim();
  const fromUrl = /\/kitap\/([^/?#]+)/.exec(trimmed)?.[1] ?? trimmed;
  return SLUG_PATTERN.test(fromUrl) ? fromUrl : undefined;
}

// The search answers with books, authors and events alike, told apart by their type.
export function parseDoganKitapSearchResults(data: unknown): DoganKitapSearchResults {
  const results: DoganKitapSearchResults = { books: [], authors: [] };
  for (const item of Array.isArray(data) ? data : []) {
    const record = asRecord(item);
    const name = cleanText(asString(record.baslik));
    const match = /^\/(kitap|yazar)\/([^/?#]+)$/.exec(asString(record.link) ?? '');
    if (!name || !match || !SLUG_PATTERN.test(match[2])) continue;
    const list = match[1] === 'kitap' && record.tip === 'Kitap' ? results.books : match[1] === 'yazar' && record.tip === 'Yazar' ? results.authors : null;
    if (list && !list.some((entry) => entry.slug === match[2])) list.push({ slug: match[2], name });
  }
  return results;
}

export function extractDoganKitapAuthorBooks(html: string): NamedResult[] {
  const $ = cheerio.load(html);
  const books: NamedResult[] = [];
  $('.kitapitem a[href]').each((_, el) => {
    const slug = /^(?:https?:\/\/(?:www\.)?dogankitap\.com\.tr)?\/kitap\/([^/?#]+)$/.exec($(el).attr('href') ?? '')?.[1];
    const name = cleanText($(el).find('img').attr('alt'));
    if (slug && name && SLUG_PATTERN.test(slug) && !books.some((book) => book.slug === slug)) books.push({ slug, name });
  });
  return books;
}

export function parseDoganKitapBookPage(html: string, slug: string): DoganKitapBookData {
  const $ = cheerio.load(html);
  const book = parseJsonLdBook($);
  const facts = parseFacts($);

  return {
    providerId: slug,
    title: cleanText($('.kd-detay .kd-baslik').first().clone().children().remove().end().text()) || cleanText(asString(book.name)) || undefined,
    authors: extractAuthors($, book),
    publisher: extractPublisher(book),
    description: descriptionFromHtml($('.kd-aciklama').first().html()),
    publishedYear: yearOf(facts['Yayın Tarihi']) ?? yearOf(scalarText(book.datePublished)),
    pageCount: positiveInt(facts['Sayfa Sayısı'] ?? book.numberOfPages),
    isbn13: normalizeIsbn13(facts['Barkod']) ?? normalizeIsbn13(asString(book.isbn)),
    genres: splitList(facts['Kategori'] ?? asString(book.genre)),
    coverUrl: extractCoverUrl(book),
  };
}

function parseJsonLdBook($: CheerioAPI): Record<string, unknown> {
  let book: Record<string, unknown> = {};
  $('script[type="application/ld+json"]').each((_, el) => {
    if (Object.keys(book).length > 0) return;
    try {
      const data: unknown = JSON.parse($(el).contents().text());
      book = (Array.isArray(data) ? data : [data]).map(asRecord).find((item) => item['@type'] === 'Book') ?? {};
    } catch {
      // A malformed block only means this source contributes nothing.
    }
  });
  return book;
}

// "Kitap Künyesi" lines such as "Sayfa Sayısı: 484". The hidden "Orijinal Dili" line says Turkish
// even for translations, so it is not read.
function parseFacts($: CheerioAPI): Record<string, string> {
  const facts: Record<string, string> = {};
  $('.kd-kunye p').each((_, el) => {
    if ($(el).hasClass('hidden')) return;
    const match = /^([^:]+):\s*(.+)$/.exec(cleanText($(el).text()));
    if (match && !(match[1] in facts)) facts[match[1].trim()] = match[2].trim();
  });
  return facts;
}

function extractAuthors($: CheerioAPI, book: Record<string, unknown>): string[] | undefined {
  const authors: string[] = [];
  $('.kd-detay .kd-yazar a').each((_, el) => {
    const name = cleanText($(el).text());
    if (name && !authors.includes(name)) authors.push(name);
  });
  if (authors.length === 0) {
    for (const entry of ([] as unknown[]).concat(book.author ?? [])) {
      const name = cleanText(asString(asRecord(entry).name));
      if (name && !authors.includes(name)) authors.push(name);
    }
  }
  return authors.length ? authors : undefined;
}

// The site names itself "DK" or leaves the publisher blank.
function extractPublisher(book: Record<string, unknown>): string {
  const name = cleanText(asString(asRecord(book.publisher).name));
  return name && name !== 'DK' ? name : PUBLISHER_NAME;
}

function extractCoverUrl(book: Record<string, unknown>): string | undefined {
  const url = asString(book.image);
  return url && /^https:\/\//.test(url) ? url : undefined;
}

function splitList(raw: string | undefined): string[] | undefined {
  const items = [...new Set((raw ?? '').split(',').map(cleanText).filter(Boolean))];
  return items.length ? items : undefined;
}

function positiveInt(value: unknown): number | undefined {
  const parsed = Number.parseInt(scalarText(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
