/**
 * Telemetry injector for autoresearch train.py
 *
 * Injects a lightweight logger that captures step-level metrics
 * and writes them to a JSONL file. Zero external dependencies —
 * uses only Python stdlib + torch (already available).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { StepSnapshot, RunSummary } from './types.js';

/** Python code to inject into train.py's training loop */
export const TELEMETRY_HOOK = `
# --- autoresearch-lens telemetry (injected) ---
import json as _lens_json
_lens_file = open("telemetry.jsonl", "w")
_lens_interval = 10  # log every N steps

def _lens_log(step, elapsed, loss, model, optimizer, tokens):
    if step % _lens_interval != 0:
        return
    grad_norm = sum(p.grad.norm().item() for p in model.parameters() if p.grad is not None)
    lr = optimizer.param_groups[0].get("lr", 0)
    vram = torch.cuda.max_memory_allocated() / 1e6
    record = {
        "step": step, "elapsed_s": round(elapsed, 2),
        "loss": round(loss, 6), "grad_norm": round(grad_norm, 4),
        "lr": round(lr, 8), "vram_mb": round(vram, 1),
        "tokens_seen": tokens
    }
    _lens_file.write(_lens_json.dumps(record) + "\\n")
    _lens_file.flush()

import atexit
atexit.register(lambda: _lens_file.close())
# --- end lens telemetry ---
`;

/** Parse telemetry.jsonl into snapshots */
export function parseTelemetry(path: string): StepSnapshot[] {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf-8').trim().split('\n').filter(Boolean);
  return lines.map(l => JSON.parse(l) as StepSnapshot);
}

/** Analyze snapshots into a run summary */
export function summarizeRun(snapshots: StepSnapshot[]): RunSummary | null {
  if (snapshots.length < 3) return null;

  const losses = snapshots.map(s => s.loss);
  const gradNorms = snapshots.map(s => s.grad_norm);
  const finalLoss = losses[losses.length - 1];
  const minLoss = Math.min(...losses);
  const minLossIdx = losses.indexOf(minLoss);

  // Detect curve shape
  const firstThird = losses.slice(0, Math.floor(losses.length / 3));
  const lastThird = losses.slice(Math.floor(losses.length * 2 / 3));
  const firstAvg = firstThird.reduce((a, b) => a + b, 0) / firstThird.length;
  const lastAvg = lastThird.reduce((a, b) => a + b, 0) / lastThird.length;

  let curveShape: RunSummary['curve_shape'];
  if (lastAvg > firstAvg * 1.1) {
    curveShape = 'diverge';
  } else if (Math.abs(lastAvg - firstAvg) / firstAvg < 0.01) {
    curveShape = 'plateau';
  } else {
    // Check if most improvement happened in first half
    const midLoss = losses[Math.floor(losses.length / 2)];
    const earlyDrop = firstAvg - midLoss;
    const lateDrop = midLoss - lastAvg;
    curveShape = earlyDrop > lateDrop * 2 ? 'fast-converge' : 'slow-converge';
  }

  // Detect instability (high variance in loss)
  const lossVariance = losses.reduce((acc, l) => {
    const mean = losses.reduce((a, b) => a + b, 0) / losses.length;
    return acc + (l - mean) ** 2;
  }, 0) / losses.length;
  if (lossVariance > (finalLoss * 0.1) ** 2) {
    curveShape = 'unstable';
  }

  // Find convergence point (where improvement drops below 0.1% per step window)
  let convergenceStep: number | null = null;
  const windowSize = Math.max(5, Math.floor(snapshots.length / 10));
  for (let i = windowSize; i < snapshots.length; i++) {
    const windowLosses = losses.slice(i - windowSize, i);
    const improvement = (windowLosses[0] - windowLosses[windowLosses.length - 1]) / windowLosses[0];
    if (improvement < 0.001) {
      convergenceStep = snapshots[i].step;
      break;
    }
  }

  return {
    curve_shape: curveShape,
    final_loss: finalLoss,
    min_loss: minLoss,
    min_loss_step: snapshots[minLossIdx].step,
    grad_norm_mean: gradNorms.reduce((a, b) => a + b, 0) / gradNorms.length,
    grad_norm_max: Math.max(...gradNorms),
    vram_peak_mb: Math.max(...snapshots.map(s => s.vram_mb)),
    total_steps: snapshots[snapshots.length - 1].step,
    convergence_step: convergenceStep,
  };
}

/** One-line summary for the agent to read */
export function formatSummaryForAgent(summary: RunSummary): string {
  const parts = [
    `curve: ${summary.curve_shape}`,
    `final_loss: ${summary.final_loss.toFixed(4)}`,
    `min_loss: ${summary.min_loss.toFixed(4)} (step ${summary.min_loss_step})`,
    `grad_norm: avg=${summary.grad_norm_mean.toFixed(2)} max=${summary.grad_norm_max.toFixed(2)}`,
    `vram: ${(summary.vram_peak_mb / 1024).toFixed(1)}GB`,
    `steps: ${summary.total_steps}`,
  ];
  if (summary.convergence_step) {
    parts.push(`converged_at: step ${summary.convergence_step}`);
  }
  return parts.join(' | ');
}
