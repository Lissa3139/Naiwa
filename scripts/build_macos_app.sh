#!/bin/bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
app_source="$repo_root/特制版/macOS/app"
arch="${1:-$(uname -m)}"
case "$arch" in
  arm64|x64) ;;
  *) echo "Unsupported macOS architecture: $arch" >&2; exit 2 ;;
esac
if [[ ! -f "$app_source/package.json" ]]; then
  echo "macOS app source not found: $app_source" >&2
  exit 2
fi

work="$(mktemp -d "${TMPDIR:-/tmp/}naiwa-macos-build.XXXXXX")"
trap 'rm -rf -- "$work"' EXIT
mkdir -p "$repo_root/dist"

/usr/bin/curl --fail --location --retry 3 --proto '=https' --tlsv1.2 \
  'https://api.github.com/repos/electron/electron/releases/latest' \
  -o "$work/release.json"
version="$(python3 - "$work/release.json" <<'PY'
import json, re, sys
with open(sys.argv[1], encoding="utf-8") as stream:
    version = json.load(stream).get("tag_name", "")
if not re.fullmatch(r"v\d+\.\d+\.\d+", version):
    raise SystemExit("Electron release tag was not a stable version")
print(version)
PY
)"

archive="electron-${version}-darwin-${arch}.zip"
base="https://github.com/electron/electron/releases/download/${version}"
/usr/bin/curl --fail --location --retry 3 --proto '=https' --tlsv1.2 \
  "$base/$archive" -o "$work/$archive"
/usr/bin/curl --fail --location --retry 3 --proto '=https' --tlsv1.2 \
  "$base/SHASUMS256.txt" -o "$work/SHASUMS256.txt"
expected="$(awk -v name="$archive" '$2==name || $2=="*"name {print $1; exit}' "$work/SHASUMS256.txt")"
actual="$(/usr/bin/shasum -a 256 "$work/$archive" | awk '{print $1}')"
if [[ -z "$expected" || "$actual" != "$expected" ]]; then
  echo "Electron archive SHA-256 verification failed" >&2
  exit 1
fi

/usr/bin/ditto -x -k "$work/$archive" "$work/runtime"
bundle="$(/usr/bin/find "$work/runtime" -type d -name Electron.app -print -quit)"
if [[ -z "$bundle" ]]; then
  echo "Electron.app was not present in the verified archive" >&2
  exit 1
fi
/usr/bin/ditto "$app_source" "$bundle/Contents/Resources/app"

python3 - "$bundle/Contents/Info.plist" <<'PY'
import plistlib, sys
path = sys.argv[1]
with open(path, "rb") as stream:
    info = plistlib.load(stream)
info["CFBundleDisplayName"] = "奶蛙桌宠特制版"
info["CFBundleName"] = "奶蛙桌宠特制版"
info["CFBundleIdentifier"] = "org.naiwa.special"
with open(path, "wb") as stream:
    plistlib.dump(info, stream, fmt=plistlib.FMT_XML, sort_keys=False)
PY

app_bundle="$repo_root/dist/奶蛙桌宠特制版-${arch}.app"
archive_out="$repo_root/dist/奶蛙桌宠特制版-macOS-${arch}.zip"
rm -rf -- "$app_bundle" "$archive_out"
/usr/bin/ditto "$bundle" "$app_bundle"
/usr/bin/codesign --force --deep --sign - "$app_bundle"
/usr/bin/codesign --verify --deep --strict "$app_bundle"
/usr/bin/ditto -c -k --sequesterRsrc --keepParent "$app_bundle" "$archive_out"
echo "Built $app_bundle"
echo "Packaged $archive_out"
