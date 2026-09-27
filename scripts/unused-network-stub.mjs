/**
 * Stands in for `undici` and `encoding-sniffer` inside a bundle.
 *
 * cheerio imports both at the top of its entry, but only `cheerio.fromURL` and `cheerio.fromBuffer`
 * use them, and neither is called here: every request goes through BookOrbit's `host.fetch`, and the
 * HTML arrives as a string. Bundling them anyway costs about a megabyte, which is over BookOrbit's
 * per-file plugin limit.
 */
const unavailable = () => {
  throw new Error('not available in a BookOrbit plugin: fetch through host.fetch instead');
};

export const decodeBuffer = unavailable;
export class DecodeStream {
  constructor() {
    unavailable();
  }
}
