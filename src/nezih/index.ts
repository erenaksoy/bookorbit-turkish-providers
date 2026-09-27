import type { MetadataProviderCandidate, MetadataProviderHost, MetadataProviderPlugin, MetadataProviderQuery } from '../vendor/plugin-api';
import { fetchEach, getOk } from '../shared/http';
import { BROWSER_HEADERS, normalizeIsbn13 } from '../shared/turkish-bookstore';
import {
  buildNezihProductUrl,
  buildNezihSearchUrl,
  buildNezihTitleQueries,
  extractNezihSearchResults,
  extractNezihSlug,
  filterNezihResultsByTitle,
  parseNezihBookPage,
  type NezihSearchResult,
} from './scraper';
import icon from './icon.png';

const PROVIDER = 'nezih';
const MAX_RESULTS = 5;
const DELAY_BETWEEN_REQUESTS_MS = 600;

async function searchResults(text: string, host: MetadataProviderHost): Promise<NezihSearchResult[]> {
  const response = await getOk(host, PROVIDER, 'search', buildNezihSearchUrl(text), { headers: BROWSER_HEADERS });
  return response ? extractNezihSearchResults(await response.text()) : [];
}

async function fetchBySlug(slug: string, host: MetadataProviderHost): Promise<MetadataProviderCandidate | null> {
  const url = buildNezihProductUrl(slug);
  const response = await getOk(host, PROVIDER, 'lookup', url, { headers: BROWSER_HEADERS });
  if (!response) return null;

  const data = parseNezihBookPage(await response.text(), slug);
  if (!data.title || !data.providerId) return null;
  return {
    providerId: data.providerId,
    title: data.title,
    authors: data.authors,
    publisher: data.publisher,
    description: data.description,
    language: data.language,
    isbn13: data.isbn13,
    genres: data.genres,
    coverUrl: data.coverUrl,
    sourceUrl: url,
  };
}

function toIsbn13(isbn: string): string | undefined {
  if (isbn.length === 13) return normalizeIsbn13(isbn);
  if (isbn.length !== 10) return undefined;
  const stem = `978${isbn.slice(0, 9)}`;
  const sum = [...stem].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return `${stem}${(10 - (sum % 10)) % 10}`;
}

async function searchByIsbn(
  isbn: string,
  host: MetadataProviderHost,
  signal: AbortSignal,
  limit: number,
): Promise<MetadataProviderCandidate[]> {
  const isbn13 = toIsbn13(isbn);
  if (!isbn13) return [];
  const slugs = (await searchResults(isbn13, host)).slice(0, limit).map((result) => result.slug);
  const found = await fetchEach(slugs, host, signal, DELAY_BETWEEN_REQUESTS_MS, (slug) => fetchBySlug(slug, host));
  return found.filter((candidate) => candidate.isbn13 === isbn13);
}

const plugin = {
  apiVersion: 1,
  version: '1.0.0',
  type: 'nezih',
  label: 'Nezih',
  icon,
  description: 'Turkish bookstore (nezih.com.tr). Reads public pages.',
  idLinkTemplate: 'https://www.nezih.com.tr/{id}',

  async search(query: MetadataProviderQuery, host: MetadataProviderHost, signal: AbortSignal) {
    const limit = Math.min(query.limit, MAX_RESULTS);

    if (query.isbn) {
      const exact = await searchByIsbn(query.isbn, host, signal, limit);
      if (exact.length || !query.title) return exact;
    }

    let slugs: string[] = [];
    for (const title of buildNezihTitleQueries(query.title, query.author)) {
      if (signal.aborted) break;
      slugs = filterNezihResultsByTitle(await searchResults(title, host), title, limit);
      if (slugs.length > 0) break;
    }
    return fetchEach(slugs, host, signal, DELAY_BETWEEN_REQUESTS_MS, (slug) => fetchBySlug(slug, host));
  },

  async lookupById(providerId: string, host: MetadataProviderHost) {
    const slug = extractNezihSlug(providerId);
    return slug ? fetchBySlug(slug, host) : null;
  },
} satisfies MetadataProviderPlugin;

export default plugin;
