#!/bin/bash
# vet-calibrate: clone repos and run vet against them
# Usage: bash run-calibration.sh [max_repos]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPOS_FILE="$SCRIPT_DIR/repos.json"
CLONE_DIR="$SCRIPT_DIR/clones"
RESULTS_DIR="$SCRIPT_DIR/results"
MAX_REPOS="${1:-40}"

mkdir -p "$CLONE_DIR" "$RESULTS_DIR"

echo "=== vet-calibrate: scanning $MAX_REPOS repos ==="

# Parse repos.json
REPOS=$(node -e "
const repos = JSON.parse(require('fs').readFileSync('$REPOS_FILE', 'utf-8'));
repos.slice(0, $MAX_REPOS).forEach(r => {
  console.log([r.repo, r.expected_quality, r.stars_tier, r.reason].join('|'));
});
")

RESULTS_FILE="$RESULTS_DIR/run-$(date +%Y%m%d-%H%M%S).jsonl"
echo "Results: $RESULTS_FILE"

while IFS='|' read -r repo quality tier reason; do
  name=$(echo "$repo" | tr '/' '__')
  clone_path="$CLONE_DIR/$name"
  
  echo -n "[$repo] "
  
  # Shallow clone if not exists
  if [ ! -d "$clone_path" ]; then
    if ! git clone --depth 1 --quiet "https://github.com/$repo.git" "$clone_path" 2>/dev/null; then
      echo "SKIP (clone failed)"
      continue
    fi
  fi
  
  # Skip repos that are too large (>50MB)
  repo_size=$(du -sm "$clone_path" 2>/dev/null | cut -f1)
  if [ "${repo_size:-0}" -gt 50 ]; then
    echo "SKIP (${repo_size}MB, too large)"
    continue
  fi

  # Run vet with --json from local build (timeout 60s)
  vet_tmp="$RESULTS_DIR/.vet-tmp.json"
  timeout 60 node /var/www/vet/dist/cli.js "$clone_path" --json > "$vet_tmp" 2>/dev/null || echo '{"error": true}' > "$vet_tmp"
  
  # Extract key metrics from file
  result=$(node -e "
    const fs = require('fs');
    try {
      const v = JSON.parse(fs.readFileSync('$vet_tmp', 'utf-8'));
      const cats = {};
      if (v.categories) {
        v.categories.forEach(c => { cats[c.name] = c.score; });
      }
      console.log(JSON.stringify({
        repo: '$repo',
        expected_quality: '$quality',
        stars_tier: '$tier',
        score: v.score || 0,
        grade: v.grade || 'F',
        security: cats.security || 0,
        integrity: cats.integrity || 0,
        debt: cats.debt || 0,
        deps: cats.deps || 0,
        total_issues: v.totalIssues || 0,
        fixable_issues: v.fixableIssues || 0,
        error: v.error || false
      }));
    } catch(e) {
      console.log(JSON.stringify({
        repo: '$repo',
        expected_quality: '$quality',
        stars_tier: '$tier',
        score: 0, grade: 'ERR', error: true
      }));
    }
  ")
  
  echo "$result" >> "$RESULTS_FILE"
  
  # Quick summary
  score=$(echo "$result" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8')); console.log(d.grade + ' (' + d.score + ')')")
  echo "$score (expected: $quality)"
  
done <<< "$REPOS"

echo ""
echo "=== Done. Results: $RESULTS_FILE ==="
echo ""

# Analyze correlation
node -e "
const fs = require('fs');
const lines = fs.readFileSync('$RESULTS_FILE', 'utf-8').trim().split('\n');
const results = lines.map(l => JSON.parse(l)).filter(r => !r.error);

const qualityMap = { high: 3, medium: 2, low: 1 };

// Calculate correlation
const n = results.length;
const expected = results.map(r => qualityMap[r.expected_quality] || 2);
const actual = results.map(r => r.score);

const meanE = expected.reduce((a,b) => a+b, 0) / n;
const meanA = actual.reduce((a,b) => a+b, 0) / n;

let num = 0, denE = 0, denA = 0;
for (let i = 0; i < n; i++) {
  const dE = expected[i] - meanE;
  const dA = actual[i] - meanA;
  num += dE * dA;
  denE += dE * dE;
  denA += dA * dA;
}
const correlation = num / (Math.sqrt(denE) * Math.sqrt(denA));

console.log('── correlation analysis ──');
console.log('repos scored: ' + n);
console.log('pearson correlation (expected vs actual): ' + correlation.toFixed(4));
console.log('');

// Mismatches
const mismatches = results.filter(r => {
  const expected = r.expected_quality;
  if (expected === 'high' && r.score < 60) return true;
  if (expected === 'low' && r.score > 75) return true;
  return false;
});

if (mismatches.length > 0) {
  console.log('── mismatches (expected vs scored) ──');
  mismatches.forEach(r => {
    console.log('  ' + r.repo + ': expected=' + r.expected_quality + ' got=' + r.grade + '(' + r.score + ')');
  });
}

// Grade distribution
const grades = {};
results.forEach(r => { grades[r.grade] = (grades[r.grade] || 0) + 1; });
console.log('');
console.log('── grade distribution ──');
Object.entries(grades).sort().forEach(([g, c]) => console.log('  ' + g + ': ' + c));

// Category averages by expected quality
console.log('');
console.log('── avg scores by expected quality ──');
for (const q of ['high', 'medium', 'low']) {
  const group = results.filter(r => r.expected_quality === q);
  if (group.length === 0) continue;
  const avg = (arr, key) => Math.round(arr.reduce((s, r) => s + (r[key]||0), 0) / arr.length);
  console.log('  ' + q + ' (n=' + group.length + '): overall=' + avg(group, 'score') 
    + ' security=' + avg(group, 'security')
    + ' integrity=' + avg(group, 'integrity')
    + ' debt=' + avg(group, 'debt')
    + ' deps=' + avg(group, 'deps'));
}
"
