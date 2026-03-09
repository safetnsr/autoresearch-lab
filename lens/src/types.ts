/** Telemetry snapshot captured every N training steps */
export interface StepSnapshot {
  step: number;
  elapsed_s: number;
  loss: number;
  grad_norm: number;
  lr: number;
  vram_mb: number;
  tokens_seen: number;
}

/** Summary of a single run's telemetry */
export interface RunSummary {
  curve_shape: 'fast-converge' | 'slow-converge' | 'plateau' | 'diverge' | 'unstable';
  final_loss: number;
  min_loss: number;
  min_loss_step: number;
  grad_norm_mean: number;
  grad_norm_max: number;
  vram_peak_mb: number;
  total_steps: number;
  convergence_step: number | null; // step where loss stopped improving >0.1%
}

/** Experiment record in the memory graph */
export interface Experiment {
  id: string;
  commit: string;
  parent_commit: string | null;
  timestamp: string;
  diff_summary: string;
  val_bpb: number;
  status: 'keep' | 'discard' | 'crash';
  telemetry: RunSummary | null;
  description: string;
  tags: string[]; // auto-tagged: 'architecture', 'hyperparameter', 'optimizer', etc.
}

/** Cross-session finding that persists */
export interface Finding {
  id: string;
  discovered_at: string;
  confidence: 'low' | 'medium' | 'high';
  category: string;
  insight: string;
  evidence: string[]; // experiment IDs that support this
  invalidated_by: string | null; // experiment ID that disproved it
}

/** Meta-analysis report generated every N runs */
export interface MetaReport {
  generated_at: string;
  total_experiments: number;
  best_val_bpb: number;
  improvement_rate: number; // improvements per 10 experiments
  top_insights: Finding[];
  unexplored: string[]; // dimensions not yet tried
  diminishing_returns: boolean;
  suggested_next: string[];
}
