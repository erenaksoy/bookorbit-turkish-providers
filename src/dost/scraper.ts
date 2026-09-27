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
  type NamedResult,
} from '../shared/turkish-bookstore';

export interface DostBookData {
  providerId?: string;
  title?: string;
  authors?: string[];
  publisher?: string;
  description?: string;
  publishedYear?: number;
  language?: string;
  pageCount?: number;
  isbn13?: string;
  genres?: string[];
  coverUrl?: string;
}

export interface DostSearchResult extends NamedResult {
  isbn13: string;
}

const DOST_BASE_URL = 'https://dostkitabevi.com';
const IGNORED_CRUMBS: ReadonlySet<string> = new Set(['Anasayfa']);
// Product links are lowercase words that may carry Turkish letters, such as "engereğin-gözü-2".
const SLUG_PATTERN = /^[\p{Ll}\p{N}]+(?:-[\p{Ll}\p{N}]+)*$/u;

export function buildDostSearchUrl(term: string): string {
  return `${DOST_BASE_URL}/catalog/searchtermautocomplete?term=${encodeURIComponent(term)}`;
}

export function buildDostProductUrl(slug: string): string {
  return `${DOST_BASE_URL}/${encodeURIComponent(slug)}`;
}

export function extractDostSlug(value: string): string | undefined {
  const trimmed = value.trim();
  const path = /dostkitabevi\.com\/([^/?#]+)/.exec(trimmed)?.[1] ?? trimmed.replace(/^\//, '');
  let slug: string;
  try {
    slug = decodeURIComponent(path);
  } catch {
    return undefined;
  }
  return SLUG_PATTERN.test(slug) ? slug : undefined;
}

/**
 * The autocomplete answers title, author and ISBN searches with each product's barcode. The store
 * also sells music, puzzles and stationery, so only products whose barcode is a valid ISBN are kept.
 */
export function parseDostSearchResults(data: unknown): DostSearchResult[] {
  const results: DostSearchResult[] = [];
  for (const item of Array.isArray(data) ? data.map(asRecord) : []) {
    const isbn13 = normalizeIsbn13(scalarText(item.sku));
    const slug = extractDostSlug(scalarText(item.producturl));
    const name = cleanText(scalarText(item.label));
    if (isbn13 && slug && name && !results.some((result) => result.slug === slug)) results.push({ slug, name, isbn13 });
  }
  return results;
}

export function parseDostBookPage(html: string, slug: string): DostBookData {
  const $ = cheerio.load(html);
  const specs = parseSpecs($);
  const crumbs = $('ol.breadcrumb li')
    .toArray()
    .map((el) => cleanText($(el).text()))
    .filter(Boolean);

  return {
    providerId: slug,
    title: cleanText($('meta[property="og:title"]').attr('content')) || cleanText($('ol.breadcrumb .current-item').text()) || undefined,
    authors: extractAuthors($),
    publisher: cleanText($('.product-vendor .value').first().text()) || undefined,
    description: descriptionFromHtml($('#pills-tab-8').closest('.mb-8').children('.border').first().html()),
    publishedYear: isFirstPrinting(specs['Baskı Sayısı']) ? yearOf(specs['Basım Tarihi']) : undefined,
    language: mapTurkishLanguage(specs['Basım Dili']),
    pageCount: positiveInt(specs['Sayfa Sayısı']),
    isbn13: normalizeIsbn13($('.additional-details .sku .value').first().text()),
    // The last crumb is the book itself.
    genres: uniqueList(crumbs.slice(0, -1).filter((name) => !IGNORED_CRUMBS.has(name) && !IGNORED_CATEGORIES.has(name))),
    coverUrl: extractCoverUrl($),
  };
}

// "<strong>Sayfa Sayısı:</strong> 416 Sayfa<br>" lines.
function parseSpecs($: CheerioAPI): Record<string, string> {
  const specs: Record<string, string> = {};
  $('.urun-ozellikler strong').each((_, el) => {
    const key = cleanText($(el).text()).replace(/:$/, '');
    let value = '';
    for (let node = el.nextSibling; node && !(node.type === 'tag' && (node.name === 'br' || node.name === 'strong')); node = node.nextSibling) {
      value += $(node).text();
    }
    if (key && cleanText(value) && !(key in specs)) specs[key] = cleanText(value);
  });
  return specs;
}

// The same slot names a musician or a puzzle's piece count on other products.
function extractAuthors($: CheerioAPI): string[] | undefined {
  const block = $('.manufacturers').first();
  if (cleanText(block.find('.yazaradidiv').text()).replace(/:$/, '') !== 'Yazar') return undefined;
  const authors: string[] = [];
  block.find('.value a').each((_, el) => {
    const name = cleanText($(el).text());
    if (name && !authors.includes(name)) authors.push(name);
  });
  return authors.length ? authors : undefined;
}

// The date belongs to the current printing, so it only dates the edition on a first printing.
function isFirstPrinting(raw: string | undefined): boolean {
  const printing = Number.parseInt(raw ?? '', 10);
  return !Number.isFinite(printing) || printing <= 1;
}

function extractCoverUrl($: CheerioAPI): string | undefined {
  const url = cleanText($('meta[property="og:image"]').attr('content'));
  return /^https:\/\//.test(url) && !url.includes('default-image') ? url : undefined;
}

function uniqueList(items: string[]): string[] | undefined {
  const unique = [...new Set(items)];
  return unique.length ? unique : undefined;
}

function positiveInt(value: unknown): number | undefined {
  const parsed = Number.parseInt(scalarText(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
