import type { MetadataProviderCandidate, MetadataProviderHost, MetadataProviderPlugin, MetadataProviderQuery } from '../vendor/plugin-api';
import { fetchEach, getOk } from '../shared/http';
import { BROWSER_HEADERS, buildTitleQueries, filterResultsByTitle, normalizeName, toIsbn13 } from '../shared/turkish-bookstore';
import {
  buildDoganKitapAuthorUrl,
  buildDoganKitapBookUrl,
  buildDoganKitapSearchBody,
  DOGAN_KITAP_SEARCH_URL,
  extractDoganKitapAuthorBooks,
  extractDoganKitapSlug,
  parseDoganKitapBookPage,
  parseDoganKitapSearchResults,
  type DoganKitapSearchResults,
} from './scraper';
import icon from './icon.png';

const PROVIDER = 'dogankitap';
const MAX_RESULTS = 5;
const DELAY_BETWEEN_REQUESTS_MS = 600;
const SEARCH_HEADERS: Record<string, string> = {
  ...BROWSER_HEADERS,
  accept: 'application/json, text/javascript, */*; q=0.01',
  'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'x-requested-with': 'XMLHttpRequest',
};

async function search(text: string, host: MetadataProviderHost): Promise<DoganKitapSearchResults> {
  const response = await getOk(host, PROVIDER, 'search', DOGAN_KITAP_SEARCH_URL, {
    method: 'POST',
    body: buildDoganKitapSearchBody(text),
    headers: SEARCH_HEADERS,
  });
  if (!response) return { books: [], authors: [] };
  try {
    return parseDoganKitapSearchResults(await response.json());
  } catch {
    host.logger.warn(`[${PROVIDER}] [fail] op=search - response was not JSON`);
    return { books: [], authors: [] };
  }
}

async function fetchBySlug(slug: string, host: MetadataProviderHost): Promise<MetadataProviderCandidate | null> {
  const url = buildDoganKitapBookUrl(slug);
  const response = await getOk(host, PROVIDER, 'lookup', url, { headers: BROWSER_HEADERS });
  if (!response) return null;

  const data = parseDoganKitapBookPage(await response.text(), slug);
  if (!data.title || !data.providerId) return null;
  return {
    providerId: data.providerId,
    title: data.title,
    authors: data.authors,
    publisher: data.publisher,
    description: data.description,
    publishedDate: data.publishedYear === undefined ? undefined : String(data.publishedYear),
    pageCount: data.pageCount,
    isbn13: data.isbn13,
    genres: data.genres,
    coverUrl: data.coverUrl,
    sourceUrl: url,
  };
}

async function searchByIsbn(isbn: string, host: MetadataProviderHost, signal: AbortSignal, limit: number): Promise<MetadataProviderCandidate[]> {
  const isbn13 = toIsbn13(isbn);
  if (!isbn13) return [];
  const slugs = (await search(isbn13, host)).books.slice(0, limit).map((book) => book.slug);
  const found = await fetchEach(slugs, host, signal, DELAY_BETWEEN_REQUESTS_MS, (slug) => fetchBySlug(slug, host));
  return found.filter((candidate) => candidate.isbn13 === isbn13);
}

// The search matches words in book titles, not the books an author wrote, so an author is found by
// name and the book picked from their page.
async function searchByAuthor(query: MetadataProviderQuery, host: MetadataProviderHost, limit: number): Promise<string[]> {
  const author = normalizeName(query.author ?? '');
  if (!author) return [];
  const match = (await search(query.author!, host)).authors.find((entry) => normalizeName(entry.name) === author);
  if (!match) return [];

  const response = await getOk(host, PROVIDER, 'author', buildDoganKitapAuthorUrl(match.slug), { headers: BROWSER_HEADERS });
  const books = response ? extractDoganKitapAuthorBooks(await response.text()) : [];
  const titles = buildTitleQueries(query.title, query.author);
  if (titles.length === 0) return books.slice(0, limit).map((book) => book.slug);
  for (const title of titles) {
    const slugs = filterResultsByTitle(books, title, limit);
    if (slugs.length > 0) return slugs;
  }
  return [];
}

const plugin = {
  apiVersion: 1,
  version: '1.0.0',
  type: 'dogankitap',
  label: 'Doğan Kitap',
  icon,
  description: 'Turkish publisher (dogankitap.com.tr). Covers its own catalogue. Reads public pages.',
  idLinkTemplate: 'https://www.dogankitap.com.tr/kitap/{id}',

  async search(query: MetadataProviderQuery, host: MetadataProviderHost, signal: AbortSignal) {
    const limit = Math.min(query.limit, MAX_RESULTS);

    if (query.isbn) {
      const exact = await searchByIsbn(query.isbn, host, signal, limit);
      if (exact.length || (!query.title && !query.author)) return exact;
    }

    let slugs: string[] = [];
    for (const title of buildTitleQueries(query.title, query.author)) {
      if (signal.aborted) break;
      slugs = filterResultsByTitle((await search(title, host)).books, title, limit);
      if (slugs.length > 0) break;
    }
    if (slugs.length === 0 && !signal.aborted) slugs = await searchByAuthor(query, host, limit);
    return fetchEach(slugs, host, signal, DELAY_BETWEEN_REQUESTS_MS, (slug) => fetchBySlug(slug, host));
  },

  async lookupById(providerId: string, host: MetadataProviderHost) {
    const slug = extractDoganKitapSlug(providerId);
    return slug ? fetchBySlug(slug, host) : null;
  },
} satisfies MetadataProviderPlugin;

export default plugin;
