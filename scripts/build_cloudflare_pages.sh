#!/usr/bin/env bash
# Enable the invitation-gated chat only on its dedicated test branch.
set -eu
export RUBYOPT='-EUTF-8'

if [ "${CF_PAGES_BRANCH:-}" = 'codex/ece685-chat-preview' ]; then
  bundle exec jekyll build --strict_front_matter --config _config.yml,services/course-chat/cloudflare.yml
else
  bundle exec jekyll build --strict_front_matter
fi

cp services/course-chat/routes.json _site/_routes.json
