#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

mode="${1:-}"
hour="$(TZ=Asia/Seoul date +%H)"
slot="$(TZ=Asia/Seoul date +%Y%m%d-%H)"
state_dir="$ROOT/.vercel/batch-state"
attempt_file="$state_dir/last-attempt"
success_file="$state_dir/last-success"

if [[ "$mode" != "--check" && "$mode" != "--force" && "$hour" != "09" && "$hour" != "21" ]]; then
  printf 'Outside the 09:00/21:00 KST deployment windows.\n'
  exit 0
fi

mkdir -p "$state_dir"

if [[ "$mode" != "--check" && "$mode" != "--force" && -f "$attempt_file" ]] &&
   [[ "$(cat "$attempt_file")" == "$slot" ]]; then
  printf 'Deployment already attempted for KST slot %s.\n' "$slot"
  exit 0
fi

required=(
  index.html
  archive.html
  book-archive.html
  posts
  .vercel/project.json
  vercel.json
)

for item in "${required[@]}"; do
  if [[ ! -e "$item" ]]; then
    printf 'Missing required source: %s\n' "$item" >&2
    exit 2
  fi
done

post_count="$(find posts -maxdepth 1 -type f -name '*.html' | wc -l | tr -d ' ')"
if (( post_count < 500 )); then
  printf 'Refusing partial deployment: only %s post files found.\n' "$post_count" >&2
  exit 2
fi

node - <<'NODE'
const fs = require('fs');
const vm = require('vm');

const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
if (config.git?.deploymentEnabled !== false) {
  throw new Error('vercel.json must keep git.deploymentEnabled=false');
}

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync('assets/book-archive-data.js', 'utf8'), context);
const latest = context.window.PAUL_BOOK_ARCHIVE?.dailyPicks?.[0];
if (!latest?.reviewUrl || !fs.existsSync(latest.reviewUrl)) {
  throw new Error('Latest Book Archive review is missing');
}
if (!latest?.imageUrl || !fs.existsSync(latest.imageUrl)) {
  throw new Error('Latest Book Archive cover is missing');
}
console.log(`Latest review guard: ${latest.title} -> ${latest.reviewUrl}`);
NODE

rg -q 'Issue 55' index.html
rg -q 'posts/morisot-woman-at-her-toilette.html' index.html

if [[ -n "$(git status --porcelain)" ]]; then
  printf 'Working tree is not clean; batch deployment deferred.\n' >&2
  exit 3
fi

printf 'Full-source guard passed: %s post files.\n' "$post_count"

if [[ "$mode" == "--check" ]]; then
  exit 0
fi

printf '%s\n' "$slot" > "$attempt_file"

deployment_url="$(npx vercel deploy --prod --yes)"
printf '%s %s\n' "$slot" "$deployment_url" > "$success_file"
printf 'Production deployment ready: %s\n' "$deployment_url"
