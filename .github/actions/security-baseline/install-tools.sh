#!/usr/bin/env bash
# Installs actionlint and zizmor, sha256-verified against tools.sha256 (the only
# place that lists versions, assets and hashes). Used by action.yml and runnable
# locally on Linux and macOS:
#   bash install-tools.sh <dest-dir>
#   ACTIONLINT_BIN=<dest-dir>/actionlint ZIZMOR_BIN=<dest-dir>/zizmor bash run.sh ...
# Platform: RUNNER_OS (Linux|macOS) and RUNNER_ARCH (X64|ARM64) when set (GitHub
# Actions), else uname -s and uname -m.
#   --print-plan   print "<tool> <asset> <sha256> <url>" per tool and exit (no download)
#   --manifest <f> read another manifest (tests)
# Compatible with bash 3.2 (macOS).
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
manifest="$here/tools.sha256"
print_plan=0
dest=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --print-plan) print_plan=1 ;;
    --manifest) shift; manifest="${1:?--manifest needs a file}" ;;
    -*) echo "install-tools.sh: unknown option $1" >&2; exit 2 ;;
    *) dest="$1" ;;
  esac
  shift
done
if [ "$print_plan" -eq 0 ] && [ -z "$dest" ]; then
  echo "usage: install-tools.sh [--print-plan] <dest-dir>" >&2
  exit 2
fi

os_name="${RUNNER_OS:-$(uname -s)}"
arch_name="${RUNNER_ARCH:-$(uname -m)}"
case "$os_name" in
  Linux) os=linux ;;
  macOS | Darwin) os=darwin ;;
  *) echo "::error::security-baseline: unsupported operating system $os_name (Linux and macOS only)."; exit 1 ;;
esac
case "$arch_name" in
  X64 | x86_64 | amd64) arch=amd64 ;;
  ARM64 | arm64 | aarch64) arch=arm64 ;;
  *) echo "::error::security-baseline: unsupported architecture $arch_name."; exit 1 ;;
esac
platform="$os-$arch"

# <tool> -> download base url (the version comes from the manifest row)
base_url() { # <tool> <version>
  case "$1" in
    actionlint) echo "https://github.com/rhysd/actionlint/releases/download/v$2" ;;
    zizmor) echo "https://github.com/zizmorcore/zizmor/releases/download/v$2" ;;
    *) echo "install-tools.sh: no download location for tool $1" >&2; return 1 ;;
  esac
}

# row <tool>: prints "<version> <asset> <sha256>" for the platform, or fails.
row() {
  local found
  found="$(awk -v tool="$1" -v platform="$platform" \
    '$0 !~ /^[[:space:]]*#/ && $1 == tool && $3 == platform { print $2, $4, $5 }' "$manifest")"
  if [ -z "$found" ] || [ "$(printf '%s\n' "$found" | wc -l | tr -d ' ')" -ne 1 ]; then
    echo "::error::security-baseline: $1 has no single entry for $platform in $manifest." >&2
    return 1
  fi
  printf '%s\n' "$found"
}

sha256_of() { # <file>
  if command -v sha256sum > /dev/null 2>&1; then
    sha256sum "$1" | awk '{ print $1 }'
  else
    shasum -a 256 "$1" | awk '{ print $1 }'
  fi
}

install_tool() { # <tool>
  local tool="$1" version asset sha url work
  read -r version asset sha < <(row "$tool")
  url="$(base_url "$tool" "$version")/$asset"
  if [ "$print_plan" -eq 1 ]; then
    echo "$tool $asset $sha $url"
    return 0
  fi
  work="$(mktemp -d "$dest/.download.XXXXXX")"
  curl --fail --silent --show-error --location --retry 3 --retry-delay 2 --max-time 120 \
    --output "$work/$asset" "$url"
  if [ "$(sha256_of "$work/$asset")" != "$sha" ]; then
    echo "::error::security-baseline: sha256 mismatch for $asset."
    rm -rf "$work"
    exit 1
  fi
  tar -xzf "$work/$asset" -C "$dest" "$tool"
  rm -rf "$work"
}

if [ "$print_plan" -eq 0 ]; then
  mkdir -p "$dest"
fi
install_tool actionlint
install_tool zizmor
