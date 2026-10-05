#!/usr/bin/env bash
set -eu
export RUBYOPT='-EUTF-8'
bundle exec jekyll build --strict_front_matter --config _config.yml,services/course-chat/shebuxin.yml
# This mirror calls the existing API; only static assets are served here.
printf '%s\n' '{"version":1,"include":["/*"],"exclude":["/*"]}' > _site/_routes.json
