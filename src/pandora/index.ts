import type { MetadataProviderCandidate, MetadataProviderHost, MetadataProviderPlugin, MetadataProviderQuery } from '../vendor/plugin-api';
import { fetchEach, getOk } from '../shared/http';
import { BROWSER_HEADERS } from '../shared/turkish-bookstore';
import {
  buildPandoraDetailedSearchBody,
  buildPandoraKeywordSearchUrl,
  buildPandoraProductApiUrl,
  buildPandoraProductUrl,
  extractPandoraId,
  extractPandoraIsbnMatches,
  extractPandoraSearchIds,
  PANDORA_DETAILED_SEARCH_URL,
  parsePandoraProduct,
} from './scraper';
import icon from './icon.png';

const PROVIDER = 'pandora';
const MAX_RESULTS = 5;
const DELAY_BETWEEN_REQUESTS_MS = 300;
const JSON_HEADERS: Record<string, string> = { ...BROWSER_HEADERS, accept: 'application/json, text/plain, */*' };

async function getJson(
  host: MetadataProviderHost,
  op: string,
  url: string,
  init?: { method: string; body: string; headers: Record<string, string> },
): Promise<unknown> {
  const response = await getOk(host, PROVIDER, op, url, {
    method: init?.method,
    body: init?.body,
    headers: { ...JSON_HEADERS, ...init?.headers },
  });
  if (!response) return null;
  try {
    return (await response.json()) as unknown;
  } catch {
    host.logger.warn(`[${PROVIDER}] [fail] op=${op} - response was not JSON`);
    return null;
  }
}

async function searchIds(query: MetadataProviderQuery, host: MetadataProviderHost, limit: number): Promise<string[]> {
  if (query.isbn) {
    const data = await getJson(host, 'search', buildPandoraKeywordSearchUrl(query.isbn));
    const exact = extractPandoraIsbnMatches(data, query.isbn);
    if (exact.length) return exact.slice(0, limit);
    if (!query.title && !query.author) return extractPandoraSearchIds(data, limit);
  }

  const title = query.title ?? '';
  const author = query.author ?? '';
  if (!title && !author) return [];

  const detailed = await getJson(host, 'search', PANDORA_DETAILED_SEARCH_URL, {
    method: 'POST',
    body: buildPandoraDetailedSearchBody(title, author),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });
  const detailedIds = extractPandoraSearchIds(detailed, limit);
  if (detailedIds.length || !title) return detailedIds;

  const keyword = [title, author].filter(Boolean).join(' ');
  return extractPandoraSearchIds(await getJson(host, 'search', buildPandoraKeywordSearchUrl(keyword)), limit);
}

async function fetchById(id: string, host: MetadataProviderHost): Promise<MetadataProviderCandidate | null> {
  const data = await getJson(host, 'lookup', buildPandoraProductApiUrl(id));
  const parsed = data ? parsePandoraProduct(data, id) : null;
  if (!parsed?.title || !parsed.providerId) return null;
  return {
    providerId: parsed.providerId,
    title: parsed.title,
    authors: parsed.authors,
    publisher: parsed.publisher,
    seriesName: parsed.seriesName,
    description: parsed.description,
    publishedDate: parsed.publishedDate,
    language: parsed.language,
    pageCount: parsed.pageCount,
    isbn13: parsed.isbn13,
    genres: parsed.genres,
    coverUrl: parsed.coverUrl,
    sourceUrl: buildPandoraProductUrl(parsed.providerId),
  };
}

const plugin = {
  apiVersion: 1,
  version: '1.0.0',
  type: 'pandora',
  label: 'Pandora',
  icon,
  description: 'Turkish bookstore (pandora.com.tr). Uses its public JSON API.',
  idLinkTemplate: 'https://www.pandora.com.tr/kitap/{id}',

  async search(query: MetadataProviderQuery, host: MetadataProviderHost, signal: AbortSignal) {
    const ids = await searchIds(query, host, Math.min(query.limit, MAX_RESULTS));
    return fetchEach(ids, host, signal, DELAY_BETWEEN_REQUESTS_MS, (id) => fetchById(id, host));
  },

  async lookupById(providerId: string, host: MetadataProviderHost) {
    const id = extractPandoraId(providerId);
    return id ? fetchById(id, host) : null;
  },
} satisfies MetadataProviderPlugin;

export default plugin;
