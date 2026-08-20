#!/usr/bin/env bash
# Author or replay the Studio Kane suite. Requires Studio on :5173 and API on :4031.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi
if [[ -n "${KANE_USERNAME:-}" && -n "${KANE_ACCESS_KEY:-}" ]]; then
  kane-cli login --username "$KANE_USERNAME" --access-key "$KANE_ACCESS_KEY" >/dev/null
fi

OUT="$ROOT/docs/kane-runs/studio-e2e"
mkdir -p "$OUT"

tests=(
  kane/api_health_test.md
  kane/studio_landing_test.md
  kane/studio_test.md
  kane/studio_wizard_test.md
  kane/studio_validation_test.md
  kane/studio_gallery_test.md
)

summary="$OUT/summary.txt"
: >"$summary"
fail=0

copy_result() {
  local stem="$1"
  local dest="$OUT/${stem}.Result.md"
  local found=""
  shopt -s nullglob
  for d in "$ROOT/kane/output-${stem}" "$ROOT/output-${stem}" "$ROOT/kane/output-"*; do
    if [[ -f "$d/Result.md" ]]; then
      local base
      base="$(basename "$d")"
      if [[ "$base" == "output-${stem}" || "$base" == output-"${stem}"* ]]; then
        found="$d/Result.md"
        break
      fi
    fi
  done
  shopt -u nullglob
  if [[ -z "$found" ]]; then
    found="$(find "$ROOT/kane" "$ROOT" -maxdepth 2 -name Result.md -print 2>/dev/null | head -n 1 || true)"
  fi
  if [[ -n "${found:-}" && -f "$found" ]]; then
    cp "$found" "$dest"
    echo "copied $found -> $dest"
  fi
}

for t in "${tests[@]}"; do
  stem="$(basename "$t" .md)"
  stem="${stem%_test}"
  echo "=== $t ===" | tee -a "$summary"
  set +e
  kane-cli --local testmd run "$t" --agent --headless --timeout 90 --max-steps 20 --name "e2e-${stem//_/-}"
  code=$?
  set -e
  if [[ $code -eq 0 ]]; then
    echo "PASS exit=$code $t" | tee -a "$summary"
  else
    echo "FAIL exit=$code $t" | tee -a "$summary"
    fail=1
  fi
  copy_result "$stem"
done

echo "SUITE_EXIT=$fail" | tee -a "$summary"
exit "$fail"
