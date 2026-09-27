import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';

import {
  cleanText,
  descriptionFromHtml,
  IGNORED_CATEGORIES,
  mapTurkishLanguage,
  normalizeIsbn13,
  type NamedResult,
} from '../shared/turkish-bookstore';

export interface NezihBookData {
  providerId?: string;
  title?: string;
  authors?: string[];
  publisher?: string;
  description?: string;
  language?: string;
  isbn13?: string;
  genres?: string[];
  coverUrl?: string;
}

const NEZIH_BASE_URL = 'https://www.nezih.com.tr';
const BOOK_CATEGORY_ROOT = 'Kitap';
const IGNORED_CRUMBS: ReadonlySet<string> = new Set(['Anasayfa']);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function buildNezihSearchUrl(query: string): string {
  return `${NEZIH_BASE_URL}/arama?q=${encodeURIComponent(query)}`;
}

export function buildNezihProductUrl(slug: string): string {
  return `${NEZIH_BASE_URL}/${encodeURIComponent(slug)}`;
}

export function extractNezihSlug(value: string): string | undefined {
  const trimmed = value.trim();
  const fromUrl = /nezih\.com\.tr\/([^/?#]+)/i.exec(trimmed)?.[1] ?? trimmed;
  return SLUG_PATTERN.test(fromUrl) ? fromUrl : undefined;
}

// The site writes one PRODUCT_DATA entry per result, and only it says which catalogue a product
// belongs to: a title search also returns toys and stationery.
export function extractNezihSearchResults(html: string): NamedResult[] {
  const results: NamedResult[] = [];
  for (const match of html.matchAll(/PRODUCT_DATA\.push\(JSON\.parse\('((?:[^'\\]|\\.)*)'\)\);/g)) {
    const item = parseProductData(match[1]);
    if (!item) continue;
    const slug = typeof item.url === 'string' ? item.url : '';
    const name = cleanText(typeof item.name === 'string' ? item.name : '');
    const root = cleanText((typeof item.category_path === 'string' ? item.category_path : '').split('>')[0]);
    if (root !== BOOK_CATEGORY_ROOT || !name || !SLUG_PATTERN.test(slug)) continue;
    if (!results.some((result) => result.slug === slug)) results.push({ slug, name });
  }
  return results;
}

export function parseNezihBookPage(html: string, slug: string): NezihBookData {
  const $ = cheerio.load(html);
  const book = parseJsonLdBook($);
  const title = cleanText($('h1#productName').first().text()) || cleanText(asString(book.name));
  const publisher = cleanText(asString(asRecord(book.publisher).name));
  const description = extractDescription($) ?? descriptionFromHtml(asString(book.description));

  return {
    providerId: slug,
    title: title || undefined,
    authors: extractAuthors($),
    publisher: publisher || undefined,
    // Some editions only repeat the title or the publisher as their description.
    description: description && description !== title && description !== publisher ? description : undefined,
    language: mapTurkishLanguage(asString(book.inLanguage)),
    isbn13: normalizeIsbn13(asString(book.isbn)) ?? normalizeIsbn13(/Ürün barkodu:\s*(\d+)/.exec($('#productCode').text())?.[1]),
    genres: extractGenres($),
    coverUrl: extractCoverUrl(book),
  };
}

function parseProductData(literal: string): Record<string, unknown> | undefined {
  // The payload is a single-quoted JavaScript string holding JSON, so undo the string escapes first.
  const json = literal.replace(/\\(.)/gs, (_escape, char: string) => ({ n: '\\n', r: '\\r', t: '\\t' })[char] ?? char);
  try {
    return asRecord(JSON.parse(json));
  } catch {
    return undefined;
  }
}

function parseJsonLdBook($: CheerioAPI): Record<string, unknown> {
  let book: Record<string, unknown> = {};
  $('script[type="application/ld+json"]').each((_, el) => {
    if (Object.keys(book).length > 0) return;
    try {
      const data: unknown = JSON.parse($(el).contents().text());
      book =
        (Array.isArray(data) ? data : [data]).map(asRecord).find((item) => ([] as unknown[]).concat(item['@type'] ?? []).includes('Book')) ?? {};
    } catch {
      // A malformed block only means this source contributes nothing.
    }
  });
  return book;
}

// The structured data names a placeholder ("GENEL") as the author; the page states the real one.
function extractAuthors($: CheerioAPI): string[] | undefined {
  const authors: string[] = [];
  $('#productText .authorText p').each((_, el) => {
    const label = cleanText($(el).children('strong').first().text()).replace(/:$/, '');
    if (label !== 'Yazar') return;
    const names = cleanText($(el).text()).replace(/^Yazar:\s*/, '');
    for (const name of names.split(',').map(cleanText)) {
      if (name && !authors.includes(name)) authors.push(name);
    }
  });
  return authors.length ? authors : undefined;
}

function extractDescription($: CheerioAPI): string | undefined {
  const node = $('#productDetailTab').first().clone();
  if (!node.length) return undefined;
  node.children('h2').first().remove();
  return descriptionFromHtml(node.html());
}

function extractGenres($: CheerioAPI): string[] | undefined {
  const genres: string[] = [];
  $('ul.breadcrumb [itemprop="name"]').each((_, el) => {
    const name = cleanText($(el).text());
    if (name && !IGNORED_CRUMBS.has(name) && !IGNORED_CATEGORIES.has(name) && !genres.includes(name)) genres.push(name);
  });
  return genres.length ? genres : undefined;
}

function extractCoverUrl(book: Record<string, unknown>): string | undefined {
  const image = ([] as unknown[]).concat(book.image ?? [])[0];
  const url = asString(image);
  return url && /^https:\/\//.test(url) ? url : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
