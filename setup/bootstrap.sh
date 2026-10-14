#!/usr/bin/env bash
# One-shot setup for macOS / Linux: checks base tools, installs missing ones with brew/apt when asked,
# installs Claude Code CLI via npm, then installs the Tool_VibeCode kit.
# Usage: bash setup/bootstrap.sh [--yes] [--dry-run] [--skip-kit]
set -euo pipefail

YES=0; DRY=0; SKIP_KIT=0
for a in "$@"; do
  case "$a" in
    --yes|-y) YES=1 ;;
    --dry-run) DRY=1 ;;
    --skip-kit) SKIP_KIT=1 ;;
    *) echo "Unknown option: $a" >&2; exit 2 ;;
  esac
done

KIT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
have() { command -v "$1" >/dev/null 2>&1; }

# tool -> package (brew / apt)
declare -A BREW=( [git]=git [node]=node [gh]=gh [python3]=python [rg]=ripgrep [jq]=jq )
declare -A APT=(  [git]=git [node]=nodejs [gh]=gh [python3]=python3 [rg]=ripgrep [jq]=jq )

missing=()
for t in git node gh python3 rg jq; do have "$t" || missing+=("$t"); done

if [ "${#missing[@]}" -eq 0 ]; then
  echo "All base tools are already installed."
else
  echo "Missing tools: ${missing[*]}"
  if have brew; then PM=brew; elif have apt-get; then PM=apt; else PM=none; fi
  if [ "$PM" = none ]; then
    echo "No supported package manager (brew / apt-get). Install them manually, then re-run." >&2
    exit 1
  fi
  go=$YES
  if [ "$go" -eq 0 ] && [ "$DRY" -eq 0 ]; then
    read -r -p "Install missing tools with $PM now? (y/N) " ans
    case "$ans" in y|Y|yes|YES) go=1 ;; esac
  fi
  for t in "${missing[@]}"; do
    if [ "$PM" = brew ]; then cmd=(brew install "${BREW[$t]}"); else cmd=(sudo apt-get install -y "${APT[$t]}"); fi
    if [ "$DRY" -eq 1 ]; then echo "[dry-run] ${cmd[*]}"
    elif [ "$go" -eq 1 ]; then "${cmd[@]}" || echo "Warning: failed to install $t, continuing." >&2
    else echo "Skipped $t."; fi
  done
fi

if ! have claude; then
  if [ "$DRY" -eq 1 ]; then echo "[dry-run] npm install -g @anthropic-ai/claude-code"
  elif have npm; then npm install -g @anthropic-ai/claude-code
  else echo "Claude Code CLI not installed (npm missing). See https://code.claude.com/docs" >&2; fi
fi

if [ "$SKIP_KIT" -eq 0 ]; then
  have node || { echo "Node.js missing; install it and run: node bin/vibe.mjs install" >&2; exit 1; }
  cd "$KIT_ROOT"
  if [ "$DRY" -eq 1 ]; then node bin/vibe.mjs install --dry-run; else node bin/vibe.mjs install; echo; node bin/vibe.mjs doctor || true; fi
fi

cat <<'EOF'

Next steps:
  1. gh auth login            (if the doctor shows GitHub CLI is not logged in)
  2. claude                   (first run: sign in)
  3. node bin/vibe.mjs new <folder>   or open a project and run /vibe-start
EOF
