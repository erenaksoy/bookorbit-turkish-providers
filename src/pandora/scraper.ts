import { cleanText, descriptionFromHtml, mapTurkishLanguage, normalizeIsbn13, scalarText, trTitle } from '../shared/turkish-bookstore';

export interface PandoraBookData {
  providerId?: string;
  title?: string;
  authors?: string[];
  publisher?: string;
  seriesName?: string;
  description?: string;
  publishedDate?: string;
  language?: string;
  pageCount?: number;
  isbn13?: string;
  genres?: string[];
  coverUrl?: string;
}

export const PANDORA_BASE_URL = 'https://www.pandora.com.tr';
const AUTHOR_ROLE = 'Yazar';
const ID_PATTERN = /pandora\.com\.tr\/(?:en\/)?kitap\/(?:[^/?#]*-)?(\d+)(?:[/?#]|$)/i;

export function buildPandoraProductApiUrl(id: string): string {
  return `${PANDORA_BASE_URL}/api/urun/${encodeURIComponent(id)}`;
}

export function buildPandoraProductUrl(id: string): string {
  return `${PANDORA_BASE_URL}/kitap/${encodeURIComponent(id)}`;
}

export function buildPandoraKeywordSearchUrl(query: string): string {
  return `${PANDORA_BASE_URL}/api/arama/keyword?sozcuk=${encodeURIComponent(query)}`;
}

export const PANDORA_DETAILED_SEARCH_URL = `${PANDORA_BASE_URL}/api/arama/detayli`;

export function buildPandoraDetailedSearchBody(title: string, author: string): string {
  return new URLSearchParams({ kitapadi: title, yazaradi: author, yayinevi: '', dil: '0' }).toString();
}

export function extractPandoraId(value: string): string | undefined {
  const fromUrl = ID_PATTERN.exec(value);
  if (fromUrl) return fromUrl[1];
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? trimmed : undefined;
}

export function extractPandoraSearchIds(data: unknown, limit: number): string[] {
  const ids: string[] = [];
  for (const item of asArray(asRecord(data).Urunler)) {
    const id = scalarText(asRecord(item).id);
    if (/^\d+$/.test(id) && !ids.includes(id)) ids.push(id);
  }
  return ids.slice(0, limit);
}

export function extractPandoraIsbnMatches(data: unknown, isbn: string): string[] {
  return asArray(asRecord(data).Urunler)
    .map(asRecord)
    .filter((item) => item.id && normalizeIsbn13(scalarText(item.ean)) === isbn)
    .map((item) => scalarText(item.id));
}

export function parsePandoraProduct(data: unknown, fallbackId: string): PandoraBookData | null {
  const root = asRecord(data);
  const book = asRecord(root.Kitap);
  if (Object.keys(book).length === 0) return null;

  const title = cleanTitle(asString(book.adi) ?? asString(root.Baslik));
  const publishedDate = /^(\d{4}-\d{2}-\d{2})/.exec(asString(book.yayintarih) ?? '')?.[1];

  return {
    providerId: scalarText(book.id) || fallbackId,
    title: title || undefined,
    authors: extractAuthors(root, book),
    publisher: cleanText(asString(book.Yayinci) ?? asString(book.yayinci)) || undefined,
    seriesName: cleanText(asString(book.dizi)) || undefined,
    description: extractDescription(book),
    publishedDate,
    language: mapTurkishLanguage(asString(book.dili)),
    pageCount: positiveInt(book.sayfa),
    isbn13: normalizeIsbn13(asString(book.ean)),
    genres: extractGenres(root),
    coverUrl: asString(root.gorselUrl) ?? asString(book.gorselUrl) ?? fallbackCoverUrl(scalarText(book.id) || fallbackId),
  };
}

// The site separates subtitles with " : ".
function cleanTitle(value: string | undefined): string {
  return cleanText(value).replace(/\s+:\s+/g, ': ');
}

// The site writes people as "Surname, Name".
function personName(value: string | undefined): string {
  const name = cleanText(value)
    .replace(/^,+|,+$/g, '')
    .trim();
  const parts = name.split(',').map((part) => part.trim());
  return parts.length === 2 && parts[0] && parts[1] ? `${parts[1]} ${parts[0]}` : name;
}

function extractAuthors(root: Record<string, unknown>, book: Record<string, unknown>): string[] | undefined {
  const authors: string[] = [];
  const people = asArray(root.Yazarlar)
    .map(asRecord)
    .sort((a, b) => Number(b.asil ?? 0) - Number(a.asil ?? 0));
  for (const person of people) {
    const name = personName(asString(person.yazar));
    if (name && cleanText(asString(person.tip)) === AUTHOR_ROLE && !authors.includes(name)) authors.push(name);
  }
  if (authors.length === 0 && asString(book.yazar)) authors.push(personName(asString(book.yazar)));
  return authors.length ? authors : undefined;
}

function extractDescription(book: Record<string, unknown>): string | undefined {
  const parts = ['tanitim', 'tanitim2', 'tanitim3'].map((key) => descriptionFromHtml(asString(book[key]))).filter((part): part is string => !!part);
  return parts.length ? parts.join('\n\n') : undefined;
}

function extractGenres(root: Record<string, unknown>): string[] | undefined {
  const genres: string[] = [];
  for (const genre of asArray(root.Turler).map(asRecord)) {
    const name = cleanText(asString(genre.turadi));
    if (!name) continue;
    // "ROMAN- ÖYKÜ" -> "Roman-Öykü"
    const title = trTitle(name)
      .split(/\s*-\s*/)
      .map((part) => (part[0] === 'i' ? 'İ' : (part[0]?.toUpperCase() ?? '')) + part.slice(1))
      .join('-');
    if (!genres.includes(title)) genres.push(title);
  }
  return genres.length ? genres : undefined;
}

function fallbackCoverUrl(id: string): string | undefined {
  return /^\d+$/.test(id) ? `https://cdn.pandora.com.tr/images/urun/${Math.floor(Number(id) / 1000)}/${id}b.jpg` : undefined;
}

function positiveInt(value: unknown): number | undefined {
  const parsed = Number.parseInt(scalarText(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
