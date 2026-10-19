#!/usr/bin/env bash
# Builds the Chrome and Firefox packages of extension/ into dist/.
#   scripts/build.sh
# The Firefox add-on ID comes from $GECKO_ID or a local, untracked .gecko-id file.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/extension"
DIST="$ROOT/dist"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

VER="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['version'])" "$SRC/manifest.json")"
GECKO_ID="${GECKO_ID:-}"
if [[ -z "$GECKO_ID" && -f "$ROOT/.gecko-id" ]]; then GECKO_ID="$(tr -d '[:space:]' < "$ROOT/.gecko-id")"; fi
if [[ -z "$GECKO_ID" ]]; then
  GECKO_ID="{0d5d8605-92a0-4912-b7a3-8831663ed6ae}"
  echo "note: no GECKO_ID set, using the default Firefox ID $GECKO_ID" >&2
fi

mkdir -p "$TMP/chrome" "$DIST"
(cd "$SRC" && tar cf - --exclude='.DS_Store' .) | (cd "$TMP/chrome" && tar xf -)
cp -R "$TMP/chrome" "$TMP/firefox"

# The "key" only pins the extension id for "Load unpacked", so the Touch Grass
# app can recognise a development copy. The stores assign their own id.
for f in "$TMP/chrome/manifest.json" "$TMP/firefox/manifest.json"; do
  python3 - "$f" <<'PY'
import json, sys
m = json.load(open(sys.argv[1]))
m.pop("key", None)
json.dump(m, open(sys.argv[1], "w"), indent=2, ensure_ascii=False)
PY
done

python3 - "$TMP/firefox/manifest.json" "$GECKO_ID" <<'PY'
import json, sys
path, gecko_id = sys.argv[1], sys.argv[2]
m = json.load(open(path))
m["background"] = {"scripts": ["background.js"], "type": "module"}
m["browser_specific_settings"] = {
    "gecko": {
        "id": gecko_id,
        "strict_min_version": "140.0",
        # nothing is collected or sent anywhere
        "data_collection_permissions": {"required": ["none"]},
    },
    "gecko_android": {"strict_min_version": "142.0"},
}
json.dump(m, open(path, "w"), indent=2, ensure_ascii=False)
PY

rm -f "$DIST"/tab-guard_v"$VER"-*.zip
(cd "$TMP/chrome" && zip -qr "$DIST/tab-guard_v$VER-chrome.zip" . -x '.*')
(cd "$TMP/firefox" && zip -qr "$DIST/tab-guard_v$VER-firefox.zip" . -x '.*')
echo "built $VER:"
ls -1 "$DIST"/tab-guard_v"$VER"-*.zip
