#!/usr/bin/env bash
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${HOME}/.config/opencode"

mkdir -p "${DEST}/plugins" "${DEST}/commands"

cp "${SRC}/plugin/index.js" "${SRC}/plugin/store.js" "${SRC}/plugin/rules.js" "${SRC}/plugin/rules.json" "${DEST}/plugins/"
cp "${SRC}/command/key.md" "${DEST}/commands/"

# Install plugin runtime dep next to the installed plugin so opencode can load it.
if command -v npm >/dev/null 2>&1; then
  (cd "${DEST}" && npm install --no-audit --no-fund @opencode-ai/plugin@1.17.1)
else
  echo "npm not found — install @opencode-ai/plugin manually in ${DEST}" >&2
fi

echo "Installed key plugin to ${DEST}/plugins + /key command."
echo "Restart opencode."
