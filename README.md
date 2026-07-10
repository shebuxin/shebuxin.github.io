# Buxin She Personal Website

This repository contains the source for [shebuxin.github.io](https://shebuxin.github.io), a personal academic website built with Jekyll and GitHub Pages.

## Prerequisites

- Ruby 3.3.11 (see `.ruby-version`)
- Bundler 2.6.9
- Node.js 24.17.0 (see `.node-version`)
- npm 11.13.0

A version manager such as `rbenv`, `asdf`, or `mise` can install the versions declared by the two version files.

## Install dependencies

Install the locked Ruby and JavaScript dependencies from the repository root:

```sh
gem install bundler -v 2.6.9
bundle _2.6.9_ config set --local path vendor/bundle
bundle _2.6.9_ install
npm ci
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

## Updating dependencies

Dependabot opens monthly npm, Bundler, and GitHub Actions updates. After accepting an npm dependency update, commit both `package-lock.json` and any regenerated `assets/js/main.min.js`. After accepting a Ruby dependency update, commit `Gemfile.lock`.
