#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/harness/ci-project-state.sh [--root <repository-root>]

Classify the repository for npm-based CI:
  bootstrap  root commit containing only the harness (no package manifest or lockfile)
  ready      package.json plus exactly one npm lockfile
  invalid    every incomplete, ambiguous, or post-bootstrap state

The script writes state, reason, lockfile, and root_commit to stdout and, when
GITHUB_OUTPUT is set, to that file. Invalid states exit non-zero.
USAGE
}

repo_root="."
while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)
      [[ $# -ge 2 ]] || { echo "Missing value for --root." >&2; usage >&2; exit 2; }
      repo_root="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ ! -d "$repo_root" ]]; then
  echo "Repository root does not exist: $repo_root" >&2
  exit 2
fi
repo_root="$(cd "$repo_root" && pwd -P)"

state="invalid"
reason="unclassified"
lockfile=""
root_commit="false"

emit() {
  local key="$1"
  local value="$2"
  printf '%s=%s\n' "$key" "$value"
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    printf '%s=%s\n' "$key" "$value" >> "$GITHUB_OUTPUT"
  fi
}

finish() {
  local exit_code="$1"
  emit state "$state"
  emit reason "$reason"
  emit lockfile "$lockfile"
  emit root_commit "$root_commit"
  exit "$exit_code"
}

fail() {
  reason="$1"
  shift
  printf 'CI project-state error: %s\n' "$*" >&2
  finish 1
}

for protected in package.json package-lock.json npm-shrinkwrap.json yarn.lock pnpm-lock.yaml bun.lock bun.lockb; do
  if [[ -L "$repo_root/$protected" ]]; then
    fail "symlinked-project-metadata" "$protected must be a regular repository file, not a symbolic link."
  fi
done

if git -C "$repo_root" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
  && git -C "$repo_root" rev-parse --verify HEAD^{commit} >/dev/null 2>&1; then
  if [[ "$(git -C "$repo_root" rev-parse --is-shallow-repository)" == "true" ]]; then
    fail "shallow-history" "Full Git history is required; use actions/checkout with fetch-depth: 0."
  fi
  read -r -a ancestry <<< "$(git -C "$repo_root" rev-list --parents -n 1 HEAD)"
  if [[ ${#ancestry[@]} -eq 1 ]]; then
    root_commit="true"
  fi
else
  fail "git-head-unavailable" "A checked-out Git commit is required to distinguish the one-time bootstrap state."
fi

has_package=false
[[ -f "$repo_root/package.json" ]] && has_package=true

npm_locks=()
[[ -f "$repo_root/package-lock.json" ]] && npm_locks+=("package-lock.json")
[[ -f "$repo_root/npm-shrinkwrap.json" ]] && npm_locks+=("npm-shrinkwrap.json")

foreign_locks=()
[[ -f "$repo_root/yarn.lock" ]] && foreign_locks+=("yarn.lock")
[[ -f "$repo_root/pnpm-lock.yaml" ]] && foreign_locks+=("pnpm-lock.yaml")
[[ -f "$repo_root/bun.lock" ]] && foreign_locks+=("bun.lock")
[[ -f "$repo_root/bun.lockb" ]] && foreign_locks+=("bun.lockb")

if [[ "$has_package" == false && ${#npm_locks[@]} -eq 0 && ${#foreign_locks[@]} -eq 0 ]]; then
  if [[ "$root_commit" == true ]]; then
    required_harness_files=(
      "README_HARNESS.md"
      "package.scripts.fragment.json"
      "package.devDependencies.fragment.json"
    )
    missing_harness_files=()
    for required in "${required_harness_files[@]}"; do
      [[ -f "$repo_root/$required" ]] || missing_harness_files+=("$required")
    done
    if [[ ${#missing_harness_files[@]} -gt 0 ]]; then
      fail "root-bootstrap-contract-missing" \
        "A package-less root commit is allowed only for a complete harness overlay. Missing: ${missing_harness_files[*]}"
    fi
    state="bootstrap"
    reason="root-harness-only"
    printf 'Harness bootstrap state detected: Node verification is intentionally skipped for this root commit.\n' >&2
    finish 0
  fi
  fail "post-bootstrap-project-metadata-missing" \
    "package.json and an npm lockfile are missing after the root commit. Add the application metadata; CI cannot be bypassed by deleting it."
fi

if [[ "$has_package" == false ]]; then
  fail "package-manifest-missing" "A lockfile exists without package.json. Restore or generate package.json."
fi

if [[ ${#foreign_locks[@]} -gt 0 ]]; then
  fail "unsupported-or-ambiguous-package-manager" \
    "This harness uses npm in CI. Remove unsupported lockfiles (${foreign_locks[*]}) or migrate the workflows and contracts explicitly."
fi

if [[ ${#npm_locks[@]} -eq 0 ]]; then
  fail "npm-lockfile-missing" \
    "package.json exists without package-lock.json or npm-shrinkwrap.json. Run npm install locally and commit the generated lockfile."
fi

if [[ ${#npm_locks[@]} -gt 1 ]]; then
  fail "multiple-npm-lockfiles" \
    "Both package-lock.json and npm-shrinkwrap.json exist. Keep exactly one canonical npm lockfile."
fi

state="ready"
reason="npm-project-ready"
lockfile="${npm_locks[0]}"
printf 'npm CI project is ready with %s.\n' "$lockfile" >&2
finish 0
