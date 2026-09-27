import type { MetadataProviderCandidate, MetadataProviderHost, MetadataProviderPlugin, MetadataProviderQuery } from '../vendor/plugin-api';
import { fetchEach, getOk } from '../shared/http';
import { BROWSER_HEADERS } from '../shared/turkish-bookstore';
import { buildDrProductUrl, buildDrSearchUrl, extractDrProductId, extractDrSearchResults, parseDrBookPage, type DrBookData } from './scraper';

const PROVIDER = 'dr';
const MAX_RESULTS = 5;
const DELAY_BETWEEN_REQUESTS_MS = 600;

function toCandidate(data: DrBookData, sourceUrl: string): MetadataProviderCandidate | null {
  if (!data.title || !data.providerId) return null;
  return {
    providerId: data.providerId,
    title: data.title,
    authors: data.authors,
    publisher: data.publisher,
    seriesName: data.seriesName,
    description: data.description,
    publishedDate: data.publishedYear === undefined ? undefined : String(data.publishedYear),
    language: data.language,
    pageCount: data.pageCount,
    isbn13: data.isbn13,
    genres: data.genres?.length ? data.genres : undefined,
    coverUrl: data.coverUrl,
    sourceUrl,
  };
}

async function fetchById(id: string, host: MetadataProviderHost): Promise<MetadataProviderCandidate | null> {
  const url = buildDrProductUrl(id);
  const response = await getOk(host, PROVIDER, 'lookup', url, { headers: BROWSER_HEADERS });
  return response ? toCandidate(parseDrBookPage(await response.text(), id), response.url || url) : null;
}

const plugin = {
  apiVersion: 1,
  version: '1.0.0',
  type: 'dr',
  label: 'D&R',
  description: 'Turkish bookstore (dr.com.tr). Reads public pages.',
  idLinkTemplate: 'https://www.dr.com.tr/kitap/-/urunno={id}',

  async search(query: MetadataProviderQuery, host: MetadataProviderHost, signal: AbortSignal) {
    const text = query.isbn || [query.title, query.author].filter(Boolean).join(' ');
    if (!text) return [];

    const response = await getOk(host, PROVIDER, 'search', buildDrSearchUrl(text), { headers: BROWSER_HEADERS });
    if (!response) return [];
    const html = await response.text();

    // An exact match such as an ISBN redirects straight to the product page.
    const redirectedId = extractDrProductId(response.url);
    if (redirectedId) {
      const candidate = toCandidate(parseDrBookPage(html, redirectedId), response.url);
      return candidate ? [candidate] : [];
    }

    return fetchEach(extractDrSearchResults(html, Math.min(query.limit, MAX_RESULTS)), host, signal, DELAY_BETWEEN_REQUESTS_MS, (id) =>
      fetchById(id, host),
    );
  },

  async lookupById(providerId: string, host: MetadataProviderHost) {
    const id = extractDrProductId(providerId);
    return id ? fetchById(id, host) : null;
  },
} satisfies MetadataProviderPlugin;

export default plugin;
