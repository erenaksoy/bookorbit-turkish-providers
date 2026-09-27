import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';

import {
  cleanText,
  descriptionFromHtml,
  IGNORED_CATEGORIES,
  mapTurkishLanguage,
  normalizeIsbn13,
  scalarText,
  yearOf,
} from '../shared/turkish-bookstore';

export interface DrBookData {
  providerId?: string;
  title?: string;
  authors?: string[];
  publisher?: string;
  seriesName?: string;
  description?: string;
  publishedYear?: number;
  language?: string;
  pageCount?: number;
  isbn13?: string;
  genres?: string[];
  coverUrl?: string;
}

export const DR_BASE_URL = 'https://www.dr.com.tr';
const COVER_ORIGINAL_URL = 'https://i.dr.com.tr/originals/';
const COVER_FILE_PATTERN = /\/originals\/([\w.-]+\.(?:jpe?g|png|webp))/i;
const PRODUCT_ID_PATTERN = /urunno=(\d+)/i;
const SERIES_SUFFIX_PATTERN = /\s+-\s+(.+?\s(?:dizisi|serisi))\s*$/i;

export function buildDrSearchUrl(query: string): string {
  return `${DR_BASE_URL}/search?q=${encodeURIComponent(query)}`;
}

export function buildDrProductUrl(id: string): string {
  return `${DR_BASE_URL}/kitap/-/urunno=${encodeURIComponent(id)}`;
}

export function extractDrProductId(value: string): string | undefined {
  const fromUrl = PRODUCT_ID_PATTERN.exec(value);
  if (fromUrl) return fromUrl[1];
  const trimmed = value.trim();
  return /^\d{6,}$/.test(trimmed) ? trimmed : undefined;
}

export function extractDrSearchResults(html: string, limit: number): string[] {
  const $ = cheerio.load(html);
  const ids: string[] = [];
  $('div.js-prd-item[data-id]').each((_, el) => {
    if (ids.length >= limit) return;
    const node = $(el);
    if ((node.attr('data-ebook') ?? '').toLowerCase() === 'true') return;
    if (!(node.attr('data-category') ?? '').startsWith('/kitap/')) return;
    const id = (node.attr('data-id') ?? '').trim();
    if (id && !ids.includes(id)) ids.push(id);
  });
  return ids;
}

export function parseDrBookPage(html: string, providerId: string): DrBookData {
  const $ = cheerio.load(html);
  const { book, crumbs } = parseJsonLd($);
  const props = parseProperties($);

  const title = cleanText($('h1.js-text-prd-name').first().text()) || props['Kitap Adı'] || cleanText(asString(book.name));
  const publisherProp = props['Yayınevi'];

  return {
    providerId,
    title: title || undefined,
    authors: extractAuthors(book, props),
    publisher:
      gtmPublisher($) || cleanText(asString(asRecord(book.publisher).name)) || publisherProp?.replace(SERIES_SUFFIX_PATTERN, '') || undefined,
    seriesName: publisherProp ? SERIES_SUFFIX_PATTERN.exec(publisherProp)?.[1] : undefined,
    description: extractDescription($, title),
    publishedYear: yearOf(props['İlk Baskı Yılı'] ?? asString(book.datePublished)),
    language: mapTurkishLanguage(props['Dil'] ?? asString(book.inLanguage)),
    pageCount: positiveInt(props['Sayfa Sayısı'] ?? book.numberOfPages),
    isbn13: normalizeIsbn13(props['Barkod'] ?? asString(book.gtin13) ?? asString(book.isbn)),
    genres: crumbs.filter((name) => !IGNORED_CATEGORIES.has(name)),
    coverUrl: extractCoverUrl(book) ?? extractCoverUrlFromPage(html, providerId),
  };
}

function parseJsonLd($: CheerioAPI): { book: Record<string, unknown>; crumbs: string[] } {
  let book: Record<string, unknown> = {};
  let crumbs: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    let data: unknown;
    try {
      data = JSON.parse(escapeControlCharsInStrings($(el).contents().text()));
    } catch {
      return;
    }
    for (const item of Array.isArray(data) ? data : [data]) {
      const record = asRecord(item);
      const types = ([] as unknown[]).concat(record['@type'] ?? []);
      if (types.includes('Book') && Object.keys(book).length === 0) book = record;
      else if (types.includes('BreadcrumbList') && crumbs.length === 0) {
        const elements = Array.isArray(record.itemListElement) ? record.itemListElement : [];
        crumbs = elements.map((entry) => cleanText(asString(asRecord(asRecord(entry).item).name))).filter(Boolean);
      }
    }
  });
  return { book, crumbs };
}

// D&R writes raw line breaks inside JSON-LD description strings, which strict JSON rejects.
function escapeControlCharsInStrings(json: string): string {
  return json.replace(/"(?:[^"\\]|\\.)*"/g, (literal) =>
    // eslint-disable-next-line no-control-regex
    literal.replace(/[\u0000-\u001f]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`),
  );
}

function parseProperties($: CheerioAPI): Record<string, string> {
  const props: Record<string, string> = {};
  $('ul.js-list-prd-property li').each((_, el) => {
    const key = cleanText($(el).find('strong').first().text()).replace(/:$/, '').trim();
    const value = cleanText($(el).find('span').first().text());
    if (key && value && !(key in props)) props[key] = value;
  });
  return props;
}

function gtmPublisher($: CheerioAPI): string | undefined {
  const raw = $('div.prd-detail-body[data-gtm]').first().attr('data-gtm') ?? '';
  const match = /"publisher"\s*:\s*"([^"]*)"/.exec(raw);
  return match ? cleanText(match[1]) || undefined : undefined;
}

function extractAuthors(book: Record<string, unknown>, props: Record<string, string>): string[] | undefined {
  const raw = book.author;
  const entries = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const authors: string[] = [];
  for (const entry of entries) {
    const name = cleanText(typeof entry === 'string' ? entry : asString(asRecord(entry).name));
    if (name && !authors.includes(name)) authors.push(name);
  }
  if (authors.length === 0 && props['Yazar']) {
    for (const name of props['Yazar'].split(',').map((part) => part.trim())) {
      if (name && !authors.includes(name)) authors.push(name);
    }
  }
  return authors.length ? authors : undefined;
}

function extractDescription($: CheerioAPI, title: string): string | undefined {
  const node = $('div.js-detail-product').first();
  if (!node.length) return undefined;
  const text = descriptionFromHtml(node.html());
  // Some editions only repeat the title as their description.
  return text && text !== title ? text : undefined;
}

function extractCoverUrl(book: Record<string, unknown>): string | undefined {
  const images = ([] as unknown[]).concat(book.image ?? []);
  for (const image of images) {
    const match = COVER_FILE_PATTERN.exec(asString(image) ?? '');
    if (match) return `${COVER_ORIGINAL_URL}${match[1]}`;
  }
  return undefined;
}

// Last resort when the structured data is unusable: the page still links the cover file, named after the product.
function extractCoverUrlFromPage(html: string, providerId: string): string | undefined {
  const files = [...html.matchAll(new RegExp(COVER_FILE_PATTERN.source, 'gi'))].map((match) => match[1]);
  const file = files.find((name) => name.startsWith(`${providerId}-`)) ?? files[0];
  return file ? `${COVER_ORIGINAL_URL}${file}` : undefined;
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
