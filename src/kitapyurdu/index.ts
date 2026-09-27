import type { MetadataProviderCandidate, MetadataProviderHost, MetadataProviderPlugin, MetadataProviderQuery } from '../vendor/plugin-api';
import { fetchEach, getOk } from '../shared/http';
import { BROWSER_HEADERS } from '../shared/turkish-bookstore';
import {
  buildKitapyurduProductUrl,
  buildKitapyurduSearchQueries,
  buildKitapyurduSearchUrl,
  extractKitapyurduId,
  extractKitapyurduSearchResults,
  parseKitapyurduBookPage,
} from './scraper';

const PROVIDER = 'kitapyurdu';
const MAX_RESULTS = 5;
const DELAY_BETWEEN_REQUESTS_MS = 600;

async function fetchById(id: string, host: MetadataProviderHost): Promise<MetadataProviderCandidate | null> {
  const url = buildKitapyurduProductUrl(id);
  const response = await getOk(host, PROVIDER, 'lookup', url, { headers: BROWSER_HEADERS });
  if (!response) return null;

  const data = parseKitapyurduBookPage(await response.text(), id);
  if (!data.title || !data.providerId) return null;
  return {
    providerId: data.providerId,
    title: data.title,
    authors: data.authors,
    publisher: data.publisher,
    description: data.description,
    publishedDate: data.publishedDate,
    language: data.language,
    pageCount: data.pageCount,
    isbn13: data.isbn13,
    genres: data.genres,
    coverUrl: data.coverUrl,
    sourceUrl: url,
  };
}

const plugin = {
  apiVersion: 1,
  version: '1.0.0',
  type: 'kitapyurdu',
  label: 'Kitapyurdu',
  description: 'Turkish bookstore (kitapyurdu.com). Reads public pages.',
  idLinkTemplate: 'https://www.kitapyurdu.com/kitap/-/{id}.html',

  async search(query: MetadataProviderQuery, host: MetadataProviderHost, signal: AbortSignal) {
    const limit = Math.min(query.limit, MAX_RESULTS);
    let ids: string[] = [];
    for (const text of buildKitapyurduSearchQueries(query.title, query.author)) {
      const response = await getOk(host, PROVIDER, 'search', buildKitapyurduSearchUrl(text, limit), { headers: BROWSER_HEADERS });
      ids = response ? extractKitapyurduSearchResults(await response.text(), limit) : [];
      if (ids.length > 0) break;
    }
    return fetchEach(ids, host, signal, DELAY_BETWEEN_REQUESTS_MS, (id) => fetchById(id, host));
  },

  async lookupById(providerId: string, host: MetadataProviderHost) {
    const id = extractKitapyurduId(providerId);
    return id ? fetchById(id, host) : null;
  },
} satisfies MetadataProviderPlugin;

export default plugin;
