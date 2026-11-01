#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
source_dir="$PWD"
work="$(mktemp -d "${TMPDIR:-/tmp/}naiwa-install.XXXXXX")"
trap 'case "$work" in */naiwa-install.*) rm -rf -- "$work";; esac' EXIT
destination="$(/usr/bin/osascript -e 'POSIX path of (choose folder with prompt "选择奶蛙的安装文件夹")')"
target="${destination%/}/奶蛙桌宠特制版.app"
if [ -e "$target" ]; then echo '目标文件夹已有奶蛙，请先退出并移走旧版本后重新安装。'; exit 1; fi
choice="$(/usr/bin/osascript -e 'button returned of (display dialog "启用远程控制后，奶蛙会连接网络，并允许已配对的控制端远程控制奶蛙动作" with title "奶蛙安装" buttons {"取消", "仅本机使用", "启用远程控制"} default button "仅本机使用" cancel button "取消")')"
case "$(uname -m)" in arm64) arch=arm64;; x86_64) arch=x64;; *) echo '不支持此处理器'; exit 1;; esac
echo '正在获取 Electron 官方运行环境版本……'
release_url="$(/usr/bin/curl --fail --silent --show-error --location --retry 3 --proto '=https' --tlsv1.2 --output /dev/null --write-out '%{url_effective}' 'https://github.com/electron/electron/releases/latest')"
version="${release_url%/}"
version="${version##*/}"
if [[ ! "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then echo '无效的运行环境版本'; exit 1; fi
archive="electron-${version}-darwin-${arch}.zip"
base="https://github.com/electron/electron/releases/download/${version}"
echo '正在下载官方 macOS 运行环境，请保持联网……'
/usr/bin/curl --fail --location --retry 3 --proto '=https' --tlsv1.2 "$base/$archive" -o "$work/$archive"
/usr/bin/curl --fail --location --retry 3 --proto '=https' --tlsv1.2 "$base/SHASUMS256.txt" -o "$work/SHASUMS256.txt"
expected="$(awk -v name="$archive" '$2==name || $2=="*"name {print $1}' "$work/SHASUMS256.txt")"
actual="$(/usr/bin/shasum -a 256 "$work/$archive" | awk '{print $1}')"
if [ -z "$expected" ] || [ "$actual" != "$expected" ]; then echo '下载校验失败，安装已停止'; exit 1; fi
/usr/bin/ditto -x -k "$work/$archive" "$work/runtime"
bundle="$work/runtime/Electron.app"
/usr/bin/ditto "$source_dir/app" "$bundle/Contents/Resources/app"
/usr/libexec/PlistBuddy -c 'Set :CFBundleDisplayName 奶蛙桌宠特制版' "$bundle/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleName 奶蛙桌宠特制版' "$bundle/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleIdentifier org.naiwa.special' "$bundle/Contents/Info.plist"
# Re-sign the locally assembled bundle. No system security settings are changed.
/usr/bin/codesign --force --deep --sign - "$bundle"
/usr/bin/ditto "$bundle" "$target"
switch="${destination%/}/remote-control.ini"
if [ "$choice" = '启用远程控制' ]; then printf 'enabled=true\n' > "$switch"; else printf 'enabled=false\n' > "$switch"; fi
/usr/bin/ditto "$source_dir/连接设置.command" "${destination%/}/连接设置.command"
/bin/chmod +x "${destination%/}/连接设置.command"
echo "安装完成：$target"
/usr/bin/open "$target"
