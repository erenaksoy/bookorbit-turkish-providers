import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';

import {
  cleanText,
  descriptionFromHtml,
  IGNORED_CATEGORIES,
  mapTurkishLanguage,
  normalizeIsbn13,
  scalarText,
  trTitle,
} from '../shared/turkish-bookstore';

export interface KitapyurduBookData {
  providerId?: string;
  title?: string;
  authors?: string[];
  publisher?: string;
  description?: string;
  publishedDate?: string;
  language?: string;
  pageCount?: number;
  isbn13?: string;
  genres?: string[];
  coverUrl?: string;
}

const KITAPYURDU_BASE_URL = 'https://www.kitapyurdu.com';
const SITE_PAGE_SIZES = [20, 25, 50] as const;
const COVER_PATTERN = /\/fn:(\d+)(?:\/wi:\d+)?\/wh:([0-9a-fA-F]+)/;
const IGNORED_CATEGORY_ROOTS: ReadonlySet<string> = new Set(['Orijinal Dil']);

export function buildKitapyurduSearchUrl(query: string, limit: number): string {
  const pageSize = SITE_PAGE_SIZES.find((size) => size >= limit) ?? SITE_PAGE_SIZES[SITE_PAGE_SIZES.length - 1];
  return `${KITAPYURDU_BASE_URL}/index.php?route=product/list&filter_name=${encodeURIComponent(query)}&limit=${pageSize}`;
}

// The site finds nothing for "Author - Title" or for an ISBN, but matches plain title and author
// words. A title carrying its author is reduced to its remaining segments (the last first, since
// "Author - Title" is the usual form), then widened with the author, then the author alone.
export function buildKitapyurduSearchQueries(title: string | undefined, author: string | undefined): string[] {
  const authorName = cleanText(author).replace(/\s+[-\u2013\u2014]\s+/g, ' ');
  const authorKey = authorName.toLocaleLowerCase('tr');
  const segments = cleanText(title)
    .split(/\s+[-\u2013\u2014]\s+/)
    .map(cleanText)
    .filter(Boolean);
  const titles = segments.filter((segment) => segments.length < 2 || !authorKey || segment.toLocaleLowerCase('tr') !== authorKey).reverse();

  const queries = [...titles];
  if (authorName) queries.push(...titles.map((name) => `${name} ${authorName}`), authorName);
  else if (segments.length > 1) queries.push(segments.join(' '));
  return [...new Set(queries)];
}

export function buildKitapyurduProductUrl(id: string): string {
  return `${KITAPYURDU_BASE_URL}/kitap/-/${encodeURIComponent(id)}.html`;
}

export function extractKitapyurduId(value: string): string | undefined {
  const fromUrl = /\/(\d+)\.html/.exec(value);
  if (fromUrl) return fromUrl[1];
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? trimmed : undefined;
}

export function extractKitapyurduSearchResults(html: string, limit: number): string[] {
  const $ = cheerio.load(html);
  const ids: string[] = [];
  $('div.ky-product[data-product-id]').each((_, el) => {
    if (ids.length >= limit) return;
    const node = $(el);
    const href = node.find('a.ky-product-cover[href]').attr('href') ?? node.find('a[href]').first().attr('href');
    // Skips non-book products such as stationery and e-readers.
    if (href && !href.includes('/kitap/')) return;
    const id = (node.attr('data-product-id') ?? '').trim();
    if (id && !ids.includes(id)) ids.push(id);
  });
  return ids;
}

export function parseKitapyurduBookPage(html: string, providerId: string): KitapyurduBookData {
  const $ = cheerio.load(html);
  const ld = parseJsonLdBook($);
  const attrs = parseAttributes(html);

  const publisher = cleanText($('div.pr_producers__publisher').first().text()) || cleanText(asString(asRecord(ld.publisher).name));

  return {
    providerId,
    title: cleanText($('h1.pr_header__heading').first().text()) || cleanText(asString(ld.name)) || undefined,
    authors: extractAuthors($, ld),
    publisher: publisher ? trTitle(publisher) : undefined,
    description: extractDescription($, ld),
    publishedDate: parseSiteDate(attrs['Yayın Tarihi']),
    language: mapTurkishLanguage(attrs['Dil']),
    pageCount: positiveInt(attrs['Sayfa Sayısı'] ?? ld.numberOfPages),
    isbn13: normalizeIsbn13(attrs['ISBN'] ?? asString(ld.isbn)) ?? normalizeIsbn13(attrs['Barkod']),
    genres: extractGenres($),
    coverUrl: extractCoverUrl($, ld),
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

// The attributes table is malformed (unclosed rows), so cells are paired with a regex instead of the parsed tree.
function parseAttributes(html: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const start = html.indexOf('class="attributes"');
  if (start < 0) return attrs;
  const end = html.indexOf('</table>', start);
  const table = html.slice(start, end > 0 ? end : undefined);
  const cell = '((?:(?!<t[dr][\\s>])[\\s\\S])*?)';
  const pattern = new RegExp(`<td>\\s*([^<]+?)\\s*</td>\\s*<td>${cell}(?=</td>|<t[dr][\\s>]|$)`, 'g');
  for (const match of table.matchAll(pattern)) {
    const key = match[1].trim().replace(/:$/, '').trim();
    const value = cleanText(cheerio.load(match[2]).root().text());
    if (!key || !value) continue;
    attrs[key] = key in attrs ? `${attrs[key]}, ${value}` : value;
  }
  return attrs;
}

function extractAuthors($: CheerioAPI, ld: Record<string, unknown>): string[] | undefined {
  const authors: string[] = [];
  $('div.pr_producers__manufacturer div.pr_producers__item').each((_, el) => {
    const name = cleanText($(el).text())
      .replace(/^,+|,+$/g, '')
      .trim();
    if (name && !authors.includes(name)) authors.push(name);
  });
  if (authors.length === 0) {
    const raw = ld.author;
    for (const entry of Array.isArray(raw) ? raw : raw ? [raw] : []) {
      const name = cleanText(asString(asRecord(entry).name));
      if (name && !authors.includes(name)) authors.push(name);
    }
  }
  return authors.length ? authors : undefined;
}

function extractDescription($: CheerioAPI, ld: Record<string, unknown>): string | undefined {
  const node = $('#description_text span.info__text').first();
  const fromPage = node.length ? descriptionFromHtml(node.html()) : undefined;
  return fromPage ?? descriptionFromHtml(asString(ld.description));
}

function extractGenres($: CheerioAPI): string[] | undefined {
  const genres: string[] = [];
  $('ul.rel-cats__list a.rel-cats__link').each((_, el) => {
    const path = $(el)
      .find('span')
      .toArray()
      .map((span) => cleanText($(span).text()));
    if (path.some((name) => IGNORED_CATEGORY_ROOTS.has(name))) return;
    for (const name of path) {
      if (name && !IGNORED_CATEGORIES.has(name) && !genres.includes(name)) genres.push(name);
    }
  });
  return genres.length ? genres : undefined;
}

function extractCoverUrl($: CheerioAPI, ld: Record<string, unknown>): string | undefined {
  const sources = $('div.pr_images a[href], div.pr_images img[src]')
    .toArray()
    .map((el) => $(el).attr('href') ?? $(el).attr('src') ?? '');
  for (const source of [...sources, asString(ld.image) ?? '']) {
    const match = COVER_PATTERN.exec(source);
    // Images are only served without a watermark when the "wh" hash is present.
    if (match) return `https://img.kitapyurdu.com/v1/getImage/fn:${match[1]}/wi:800/wh:${match[2]}`;
  }
  return undefined;
}

function parseSiteDate(raw: string | undefined): string | undefined {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw ?? '');
  if (!match) return undefined;
  const [, day, month, year] = match;
  return Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= 31 ? `${year}-${month}-${day}` : undefined;
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
