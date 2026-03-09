# vet-scorer research program

This is an autoresearch experiment to train a tiny code-quality classifier
for use inside [@safetnsr/vet](https://github.com/safetnsr/vet).

## Goal

Train the smallest possible model (<10MB exported) that can score code files
on dimensions that AST/regex analysis misses:

1. **Complexity class** — simple / moderate / complex / dangerous
2. **Anti-pattern detection** — god functions, hidden coupling, misleading names
3. **Test quality** — meaningful vs. trivial assertions, coverage theater

The model ships as ONNX inside an npm package. It must run in <100ms per file
on CPU (no GPU required at inference time).

## Setup

Follow the standard autoresearch setup from `upstream/program.md`, with these changes:

1. Data: instead of generic text, we use a curated dataset of code files with
   quality labels. Run `python prepare_code_data.py` to generate training data.
2. The model architecture in `train.py` should be much smaller than the default
   GPT — think ~1M params, not 50M.
3. Export: after each successful run, also export the model to ONNX format for
   size verification.

## Lens integration

This experiment uses autoresearch-lens for instrumentation.

After each run:
1. Parse `telemetry.jsonl` for curve analysis
2. Record to `experiments.jsonl` with auto-tags
3. Every 10 runs, generate meta-analysis report
4. Check `findings.md` before proposing new experiments

Read findings.md at the start of each session for prior insights.

## Constraints

- Model must be <10MB as ONNX
- Inference <100ms per file on CPU
- Training still uses the 5-minute time budget
- No external dependencies beyond what's in pyproject.toml
