# Buxin She Personal Website

This repository contains the source for [shebuxin.github.io](https://shebuxin.github.io), a personal academic website built with Jekyll and GitHub Pages.

## Prerequisites

- Ruby 3.3.11 (see `.ruby-version`)
- Bundler 2.6.9
- Node.js 24.17.0 (see `.node-version`)
- npm 11.13.0
- Python 3.10 or newer (only for the visitor-map updater)

A version manager such as `rbenv`, `asdf`, or `mise` can install the versions declared by the two version files.

## Install dependencies

Install the locked Ruby and JavaScript dependencies from the repository root:

```sh
gem install bundler -v 2.6.9
bundle _2.6.9_ config set --local path vendor/bundle
bundle _2.6.9_ install
npm ci
python -m pip install -r scripts/requirements-visitor-map.txt
```

## Build and preview

Rebuild the committed JavaScript bundle, then start Jekyll with the development configuration:

```sh
npm run build:js
bundle exec jekyll serve --host 127.0.0.1 --config _config.yml,_config.dev.yml
```

The site will be available at <http://localhost:4000>.

GitHub Pages 232 currently requires WEBrick 1.9.2, which has no released fix for CVE-2026-38969. WEBrick is used by the local preview server and is not included in the generated static site. Keep previews bound to `127.0.0.1` and do not expose them to an untrusted network until an updated dependency is available.

For a production build, run:

```sh
JEKYLL_ENV=production bundle exec jekyll build --strict_front_matter
```

## Checks

Run the same deterministic JavaScript checks used by CI:

```sh
npm ci
npm audit
npm run check:js
```

CI also builds the site with the locked GitHub Pages dependency set, checks for duplicate HTML IDs, and verifies generated internal links. External URLs are intentionally excluded from CI because third-party availability is outside this repository's control.

## Website visitor map

GoatCounter continues to collect site analytics through the existing Jekyll analytics include. The `Update visitor map` workflow reads aggregate visitor countries across the website each day and updates `_data/visitor_countries.json` only when the public data changes.

One-time setup:

1. In the `buxin.goatcounter.com` account, keep country-level location collection enabled. For a cumulative map, set data retention to never delete, then create an API token with read-statistics access for this site only. The workflow assumes the GoatCounter account timezone is `America/Chicago`; if it differs, set an Actions repository variable named `GOATCOUNTER_TIMEZONE` to the account's IANA timezone.
2. In this GitHub repository, add that token as an Actions repository secret named `GOATCOUNTER_API_TOKEN`.
3. Run the `Update visitor map` workflow once from the Actions tab.

To seed the map from a GoatCounter JSON export without committing the raw archive, install the dependencies above and run:

```sh
python scripts/import_goatcounter_export.py /path/to/goatcounter-export.zip
```

The importer validates the export version and site, combines all page paths into country-level totals, and applies the same public minimum as the daily updater. The API updater then re-queries the complete date range and replaces this snapshot; it never adds new totals to the export, which would double-count visits. It also refuses a different scope, a later start date, or a lower cumulative total so retention and filter changes cannot silently erase the imported history.

Public country records contain only names, ISO codes, coarse country centroids, and aggregate visitor counts; the file also carries update dates and summary totals. It omits countries below two website visitors by default; set the optional Actions repository variable `VISITOR_MAP_MIN_COUNT` to another positive integer to change that threshold. Do not commit the GoatCounter token or expose it in browser-side JavaScript.

## Updating dependencies

Dependabot opens monthly npm, Bundler, and GitHub Actions updates. After accepting an npm dependency update, commit both `package-lock.json` and any regenerated `assets/js/main.min.js`. After accepting a Ruby dependency update, commit `Gemfile.lock`.
