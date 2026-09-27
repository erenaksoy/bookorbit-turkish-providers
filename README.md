# BookOrbit Turkish providers

Five metadata providers for [BookOrbit](https://github.com/erenaksoy/bookorbit), packaged as
metadata provider plugins:

| Plugin       | Source                                                     | Provider key        |
| ------------ | ---------------------------------------------------------- | ------------------- |
| `dr`         | D&R (dr.com.tr), reads public pages                        | `plugin:dr`         |
| `kitapyurdu` | Kitapyurdu, reads public pages                             | `plugin:kitapyurdu` |
| `pandora`    | Pandora (pandora.com.tr), JSON API                         | `plugin:pandora`    |
| `nezih`      | Nezih (nezih.com.tr), reads public pages                   | `plugin:nezih`      |
| `dogankitap` | Doğan Kitap (dogankitap.com.tr), publisher's own catalogue | `plugin:dogankitap` |

## Install

These plugins need a BookOrbit build with metadata provider plugin support. Upstream BookOrbit does not
have it yet; it lives on the `v3.1.1-dev` branch of [erenaksoy/bookorbit](https://github.com/erenaksoy/bookorbit).

Download `dr.zip`, `kitapyurdu.zip`, `pandora.zip`, `nezih.zip` or `dogankitap.zip` from the
[latest release](https://github.com/erenaksoy/bookorbit-turkish-providers/releases/latest), or build
them yourself (see below).

In BookOrbit: **Settings > Metadata > Providers > Provider plugins > Install plugin**, then choose the
zip. Read the source the review step shows you,
because a plugin runs inside the server with full access to it.

Then switch the plugin on and add it to a field rule under **Settings > Metadata > Field Rules**.

## Build

```sh
npm install
npm test
npm run build
```

`npm run build` bundles each provider (with its HTML parser) into one `index.mjs` and zips it with
this file. BookOrbit only accepts an archive with `index.mjs` at its root.
