# BookOrbit Turkish providers

Three metadata providers for [BookOrbit](https://github.com/erenaksoy/bookorbit), packaged as
metadata provider plugins:

| Plugin       | Source                                | Provider key         |
| ------------ | ------------------------------------- | -------------------- |
| `dr`         | D&R (dr.com.tr), reads public pages   | `plugin:dr`          |
| `kitapyurdu` | Kitapyurdu, reads public pages        | `plugin:kitapyurdu`  |
| `pandora`    | Pandora (pandora.com.tr), JSON API    | `plugin:pandora`     |

## Install

In BookOrbit: **Settings > Metadata > Providers > Provider plugins > Install plugin**, then choose
`dist/dr.zip`, `dist/kitapyurdu.zip` or `dist/pandora.zip`. Read the source the review step shows you,
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
