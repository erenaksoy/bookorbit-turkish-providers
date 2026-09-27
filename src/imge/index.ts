import type { MetadataProviderCandidate, MetadataProviderHost, MetadataProviderPlugin, MetadataProviderQuery } from '../vendor/plugin-api';
import { getOk } from '../shared/http';
import { BROWSER_HEADERS, buildTitleQueries, cleanText, filterResultsByTitle, preferAuthor, toIsbn13 } from '../shared/turkish-bookstore';
import {
  buildImgeProductUrl,
  buildImgeSearchUrl,
  extractImgeSlug,
  IMGE_MERCHANT_ID,
  isbnFromImgeSlug,
  parseImgeSearchResults,
  toNamedResults,
  type ImgeBookData,
} from './scraper';
import icon from './icon.png';

const PROVIDER = 'imge';
const MAX_RESULTS = 5;
/** Enough rows to find the right edition among books that only mention the title words. */
const SEARCH_PAGE_SIZE = 20;
const API_HEADERS: Record<string, string> = {
  ...BROWSER_HEADERS,
  accept: 'application/json, text/plain, */*',
  origin: 'https://www.imge.com.tr',
  referer: 'https://www.imge.com.tr/',
  'x-mentis-app-lang': 'tr',
  'x-mentis-b2b-merchant-id': IMGE_MERCHANT_ID,
};

async function search(text: string, host: MetadataProviderHost): Promise<ImgeBookData[]> {
  // The API answers a search that found nothing with a 404.
  const response = await getOk(host, PROVIDER, 'search', buildImgeSearchUrl(text, SEARCH_PAGE_SIZE), { headers: API_HEADERS }, [404]);
  if (!response) return [];
  try {
    return parseImgeSearchResults(await response.json());
  } catch {
    host.logger.warn(`[${PROVIDER}] [fail] op=search - response was not JSON`);
    return [];
  }
}

function toCandidate(book: ImgeBookData): MetadataProviderCandidate {
  return {
    providerId: book.providerId,
    title: book.title,
    subtitle: book.subtitle,
    authors: book.authors,
    publisher: book.publisher,
    description: book.description,
    publishedDate: book.publishedDate,
    language: book.language,
    pageCount: book.pageCount,
    isbn13: book.isbn13,
    genres: book.genres,
    coverUrl: book.coverUrl,
    sourceUrl: buildImgeProductUrl(book.providerId),
  };
}

// The search matches the title, author and publisher together, so the author narrows a title to its
// editions; the title alone is the fallback for an author spelled differently.
async function searchByTitle(query: MetadataProviderQuery, host: MetadataProviderHost, signal: AbortSignal, limit: number): Promise<ImgeBookData[]> {
  const author = cleanText(query.author);
  for (const title of buildTitleQueries(query.title, query.author)) {
    for (const text of author ? [`${title} ${author}`, title] : [title]) {
      if (signal.aborted) return [];
      const books = preferAuthor(await search(text, host), author);
      const slugs = filterResultsByTitle(toNamedResults(books), title, limit);
      if (slugs.length > 0) return slugs.map((slug) => books.find((book) => book.providerId === slug)!);
    }
  }
  return [];
}

const plugin = {
  apiVersion: 1,
  version: '1.0.0',
  type: 'imge',
  label: 'İmge Kitabevi',
  icon,
  description: 'Turkish bookstore (imge.com.tr). Uses its public catalogue API.',
  idLinkTemplate: 'https://www.imge.com.tr/urun/{id}',

  async search(query: MetadataProviderQuery, host: MetadataProviderHost, signal: AbortSignal) {
    const limit = Math.min(query.limit, MAX_RESULTS);

    if (query.isbn) {
      const isbn13 = toIsbn13(query.isbn);
      const exact = isbn13 ? (await search(isbn13, host)).filter((book) => book.isbn13 === isbn13) : [];
      if (exact.length || !query.title) return exact.slice(0, limit).map(toCandidate);
    }

    return (await searchByTitle(query, host, signal, limit)).map(toCandidate);
  },

  async lookupById(providerId: string, host: MetadataProviderHost) {
    const slug = extractImgeSlug(providerId);
    const isbn13 = slug ? isbnFromImgeSlug(slug) : undefined;
    if (!slug || !isbn13) return null;
    const book = (await search(isbn13, host)).find((entry) => entry.providerId === slug);
    return book ? toCandidate(book) : null;
  },
} satisfies MetadataProviderPlugin;

export default plugin;
