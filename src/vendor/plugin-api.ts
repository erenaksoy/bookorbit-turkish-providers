/**
 * A copy of the metadata provider section of BookOrbit's `@bookorbit/plugin-api`, so this project
 * type-checks on its own. It has no runtime code, so nothing here ends up in a built plugin. Re-copy
 * it from the BookOrbit repository when the contract's API version changes.
 */

export type PluginMediaKind = "ebook" | "audiobook" | "comic";

/* -------------------------------------------------------------------------------------------------
 * Metadata provider plugins
 *
 * A second kind of plugin, independent of the indexer contract above: it adds a source to the
 * metadata search and refresh flows. It shares this package, the "trusted in-process module"
 * trade-off and the install rules, and nothing else, so either contract can change without the
 * other.
 * ------------------------------------------------------------------------------------------------ */

/** Bumped when a change to the metadata provider contract would break a plugin written against it. */
export const METADATA_PROVIDER_PLUGIN_API_VERSION = 1;

/** Why a provider stopped, distinct enough that a throttle is not reported as "nothing found". */
export type MetadataProviderFailure = "throttled" | "timeout" | "unreachable" | "error";

/** What a metadata search is looking for, already normalised by BookOrbit. */
export interface MetadataProviderQuery {
  title?: string;
  author?: string;
  /** Digits only, either an ISBN-10 or an ISBN-13. */
  isbn?: string;
  seriesName?: string;
  mediaKind: PluginMediaKind;
  /** The most candidates worth returning. A hint that keeps background refreshes cheap. */
  limit: number;
}

/** One book as a source describes it. Everything past `providerId` and `title` is optional. */
export interface MetadataProviderCandidate {
  /** Stable within this source. Stored on the book and handed back to `lookupById` on refresh. */
  providerId: string;
  title: string;
  subtitle?: string;
  authors?: string[];
  description?: string;
  publisher?: string;
  /** `YYYY-MM-DD`, or a bare year such as `2021` when the source states nothing more precise. */
  publishedDate?: string;
  /** BCP 47 language code such as `tr` or `en`. */
  language?: string;
  pageCount?: number;
  isbn10?: string;
  isbn13?: string;
  seriesName?: string;
  seriesIndex?: string;
  genres?: string[];
  coverUrl?: string;
  /** The page a person can open to check the match. */
  sourceUrl?: string;
  narrators?: string[];
  durationSeconds?: number;
  communityRating?: number;
  communityRatingCount?: number;
}

export interface MetadataProviderRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Defaults to following redirects, each hop checked. */
  redirect?: "follow" | "manual";
}

/**
 * Everything BookOrbit lends a metadata provider plugin. Reach for these instead of Node's own
 * globals: `host.fetch` is the only path that refuses private addresses, bounds the response size
 * and applies a per-request deadline.
 */
export interface MetadataProviderHost {
  fetch(url: string, init?: MetadataProviderRequestInit): Promise<Response>;
  logger: {
    log(message: string): void;
    warn(message: string): void;
  };
  /** Waits, and rejects as soon as the search is cancelled. Use it to pace requests to one site. */
  sleep(ms: number): Promise<void>;
  /**
   * Build the error a plugin should throw. A function rather than an exported class because a
   * plugin imported at runtime holds a different copy of any class, so `instanceof` would not
   * survive the boundary and the failure kind would be lost. A `throttled` failure pauses the
   * provider for `retryAfterSeconds` (default: a short cooldown).
   */
  fail(failure: MetadataProviderFailure, message: string, retryAfterSeconds?: number): Error;
}

/** What a metadata provider plugin module's default export must look like. */
export interface MetadataProviderPlugin {
  /** Must equal `METADATA_PROVIDER_PLUGIN_API_VERSION`; the loader refuses a mismatch and says so. */
  apiVersion: number;
  /** The plugin release as a semantic version, without a leading `v`. */
  version?: string;
  /**
   * A slug matching `^[a-z0-9][a-z0-9-]{0,29}$`. BookOrbit keys the provider as `plugin:<type>`, so
   * it can never collide with a built-in provider.
   */
  type: string;
  /** Untranslated English, shown in the provider list and next to every candidate. */
  label: string;
  description?: string;
  /** The media this source is worth asking about. Omit to be asked for everything. */
  mediaKinds?: readonly PluginMediaKind[];
  /** Ceiling for one search or lookup, in milliseconds. Defaults to 15 seconds. */
  timeoutMs?: number;
  /**
   * Where a stored id opens in a browser, with `{id}` standing in for it, for example
   * `https://example.com/book/{id}`. Must be an https URL.
   */
  idLinkTemplate?: string;

  search(query: MetadataProviderQuery, host: MetadataProviderHost, signal: AbortSignal): Promise<MetadataProviderCandidate[]>;
  /** Declare this to let a stored id refresh a book without searching again. */
  lookupById?(providerId: string, host: MetadataProviderHost, signal: AbortSignal): Promise<MetadataProviderCandidate | null>;
}
