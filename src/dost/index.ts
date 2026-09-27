import type { MetadataProviderCandidate, MetadataProviderHost, MetadataProviderPlugin, MetadataProviderQuery } from '../vendor/plugin-api';
import { fetchEach, getOk } from '../shared/http';
import { BROWSER_HEADERS, buildTitleQueries, cleanText, filterResultsByTitle, preferAuthor, toIsbn13 } from '../shared/turkish-bookstore';
import { buildDostProductUrl, buildDostSearchUrl, extractDostSlug, parseDostBookPage, parseDostSearchResults, type DostSearchResult } from './scraper';
import icon from './icon.png';

const PROVIDER = 'dost';
const MAX_RESULTS = 5;
const DELAY_BETWEEN_REQUESTS_MS = 600;
const JSON_HEADERS: Record<string, string> = {
  ...BROWSER_HEADERS,
  accept: 'application/json, text/javascript, */*; q=0.01',
  'x-requested-with': 'XMLHttpRequest',
};

async function search(term: string, host: MetadataProviderHost): Promise<DostSearchResult[]> {
  const response = await getOk(host, PROVIDER, 'search', buildDostSearchUrl(term), { headers: JSON_HEADERS });
  if (!response) return [];
  try {
    return parseDostSearchResults(await response.json());
  } catch {
    host.logger.warn(`[${PROVIDER}] [fail] op=search - response was not JSON`);
    return [];
  }
}

async function fetchBySlug(slug: string, host: MetadataProviderHost): Promise<MetadataProviderCandidate | null> {
  const url = buildDostProductUrl(slug);
  const response = await getOk(host, PROVIDER, 'lookup', url, { headers: BROWSER_HEADERS });
  if (!response) return null;

  const data = parseDostBookPage(await response.text(), slug);
  if (!data.title || !data.providerId) return null;
  return {
    providerId: data.providerId,
    title: data.title,
    authors: data.authors,
    publisher: data.publisher,
    description: data.description,
    publishedDate: data.publishedYear === undefined ? undefined : String(data.publishedYear),
    language: data.language,
    pageCount: data.pageCount,
    isbn13: data.isbn13,
    genres: data.genres,
    coverUrl: data.coverUrl,
    sourceUrl: url,
  };
}

// The autocomplete matches title and author words together, so the author narrows a title to its
// editions; the title alone is the fallback for an author spelled differently.
async function searchTitleSlugs(query: MetadataProviderQuery, host: MetadataProviderHost, signal: AbortSignal, limit: number): Promise<string[]> {
  const author = cleanText(query.author);
  for (const title of buildTitleQueries(query.title, query.author)) {
    for (const term of author ? [`${title} ${author}`, title] : [title]) {
      if (signal.aborted) return [];
      const slugs = filterResultsByTitle(await search(term, host), title, limit);
      if (slugs.length > 0) return slugs;
    }
  }
  return [];
}

const plugin = {
  apiVersion: 1,
  version: '1.0.0',
  type: 'dost',
  label: 'Dost Kitabevi',
  icon,
  description: 'Turkish bookstore (dostkitabevi.com). Reads public pages.',
  idLinkTemplate: 'https://dostkitabevi.com/{id}',

  async search(query: MetadataProviderQuery, host: MetadataProviderHost, signal: AbortSignal) {
    const limit = Math.min(query.limit, MAX_RESULTS);

    if (query.isbn) {
      const isbn13 = toIsbn13(query.isbn);
      const slugs = isbn13 ? (await search(isbn13, host)).filter((result) => result.isbn13 === isbn13).map((result) => result.slug) : [];
      if (slugs.length || !query.title) {
        return fetchEach(slugs.slice(0, limit), host, signal, DELAY_BETWEEN_REQUESTS_MS, (slug) => fetchBySlug(slug, host));
      }
    }

    const slugs = await searchTitleSlugs(query, host, signal, limit);
    const found = await fetchEach(slugs, host, signal, DELAY_BETWEEN_REQUESTS_MS, (slug) => fetchBySlug(slug, host));
    return preferAuthor(found, query.author);
  },

  async lookupById(providerId: string, host: MetadataProviderHost) {
    const slug = extractDostSlug(providerId);
    return slug ? fetchBySlug(slug, host) : null;
  },
} satisfies MetadataProviderPlugin;

export default plugin;
