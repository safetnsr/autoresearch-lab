# vet-calibrate: autoresearch for scoring thresholds

## Goal
Optimize vet's scoring parameters so that:
- High-quality repos (sindresorhus, zod, hono) consistently score A or B
- Medium-quality repos score B or C  
- Low-quality repos (deprecated, joke repos) score D or F
- The correlation between expected_quality and actual score is maximized

## The file you modify
`thresholds.json` — contains all tunable parameters:
- Grade boundaries (A=90, B=75, C=60, D=40)
- Category weights (security, integrity, debt, deps)
- Per-check penalty values and caps
- Score floor for non-security checks

## The file you do NOT modify
- `repos.json` — the dataset (fixed)
- `run-calibration.sh` — the eval harness (fixed)
- Any vet source code — you optimize the CONFIG, not the code

## How to apply thresholds
After editing thresholds.json, the thresholds need to be patched into vet's source:
```bash
node apply-thresholds.js
```
This writes the values from thresholds.json into vet's actual source files.

## How to run an experiment
```bash
bash run-calibration.sh > run.log 2>&1
```

## Metric
The primary metric is **pearson correlation** between expected quality (high=3, medium=2, low=1) and vet's actual score. Higher is better.

Secondary metrics:
- **Mismatch count**: high-quality repos scoring <60 or low-quality scoring >75
- **Grade spread**: all repos shouldn't cluster in one grade
- **Category discrimination**: each category should contribute meaningfully

## Experiment loop
1. Read current thresholds.json
2. Read previous results (results/*.jsonl) for context
3. Propose a hypothesis ("increasing debt penalty will separate high from medium")
4. Edit thresholds.json
5. Run `node apply-thresholds.js && bash run-calibration.sh > run.log 2>&1`
6. Check results: `tail -30 run.log`
7. If correlation improved → keep. If worse → revert thresholds.json
8. Log result in results.tsv
9. Repeat

## Constraints
- All penalties must be positive integers
- All caps must be >= corresponding penalty
- Category weights must sum to 1.0
- Grade boundaries must be strictly decreasing (A > B > C > D)
- Score floor must be 0-30
