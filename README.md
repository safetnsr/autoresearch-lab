# autoresearch-lab

Autonomous AI research experiments, powered by [karpathy/autoresearch](https://github.com/karpathy/autoresearch).

## Structure

```
upstream/          — karpathy's autoresearch (git submodule)
lens/              — our instrumentation layer (telemetry, memory, meta-analysis)
experiments/       — our experiment configs and findings
  vet-scorer/      — tiny code-quality model for @safetnsr/vet
```

## What this adds

autoresearch is a minimal research loop: agent edits code, trains 5 min, keeps or discards.

**lens** adds the missing infrastructure:
1. **Run telemetry** — loss curves, grad norms, memory snapshots per run
2. **Experiment memory** — structured graph of what was tried, what worked, why
3. **Meta-analysis** — auto-generated insights after N runs
4. **Val/test guard** — detects implicit overfitting through repeated val selection
5. **Cross-session transfer** — `findings.md` persists proven insights

## Current experiment: vet-scorer

Training a tiny (<10MB) code pattern classifier to ship inside [@safetnsr/vet](https://github.com/safetnsr/vet).

Target capabilities:
- Classify file complexity (simple/moderate/complex/dangerous)
- Detect common anti-patterns that AST/regex miss (semantic level)
- Score test quality beyond coverage percentage

## Requirements

- Single NVIDIA GPU (tested on H100, works on consumer GPUs with smaller configs)
- Python 3.10+, uv
- Node.js 20+ (for lens tooling)

## License

MIT (same as upstream autoresearch)
