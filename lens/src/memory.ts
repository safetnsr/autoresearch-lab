/**
 * Experiment memory — structured graph of all runs.
 * Persists as experiments.jsonl, queryable by the agent.
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import type { Experiment, Finding } from './types.js';

const EXPERIMENTS_FILE = 'experiments.jsonl';
const FINDINGS_FILE = 'findings.md';

/** Load all experiments from JSONL */
export function loadExperiments(dir: string): Experiment[] {
  const path = `${dir}/${EXPERIMENTS_FILE}`;
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8')
    .trim().split('\n').filter(Boolean)
    .map(l => JSON.parse(l) as Experiment);
}

/** Append a new experiment */
export function recordExperiment(dir: string, exp: Experiment): void {
  appendFileSync(`${dir}/${EXPERIMENTS_FILE}`, JSON.stringify(exp) + '\n');
}

/** Auto-tag an experiment based on its diff summary */
export function autoTag(diffSummary: string): string[] {
  const tags: string[] = [];
  const lower = diffSummary.toLowerCase();

  const patterns: [string, string[]][] = [
    ['architecture', ['n_layer', 'n_head', 'n_embd', 'depth', 'width', 'block', 'attention', 'mlp', 'ffn']],
    ['hyperparameter', ['lr', 'learning_rate', 'batch_size', 'warmup', 'decay', 'dropout']],
    ['optimizer', ['adam', 'muon', 'sgd', 'momentum', 'weight_decay', 'beta']],
    ['activation', ['relu', 'gelu', 'silu', 'swish', 'tanh', 'activation']],
    ['normalization', ['norm', 'layernorm', 'rmsnorm', 'batchnorm']],
    ['embedding', ['embed', 'wte', 'positional', 'rotary', 'rope']],
    ['regularization', ['dropout', 'weight_decay', 'label_smooth']],
  ];

  for (const [tag, keywords] of patterns) {
    if (keywords.some(kw => lower.includes(kw))) {
      tags.push(tag);
    }
  }

  return tags.length > 0 ? tags : ['other'];
}

/** Query: what dimensions have been explored? */
export function explorationMap(experiments: Experiment[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const exp of experiments) {
    for (const tag of exp.tags) {
      map[tag] = (map[tag] || 0) + 1;
    }
  }
  return map;
}

/** Query: what hasn't been tried? */
export function unexploredDimensions(experiments: Experiment[]): string[] {
  const explored = new Set(experiments.flatMap(e => e.tags));
  const allDimensions = [
    'architecture', 'hyperparameter', 'optimizer', 'activation',
    'normalization', 'embedding', 'regularization', 'data-augmentation',
    'curriculum', 'distillation', 'pruning', 'quantization',
  ];
  return allDimensions.filter(d => !explored.has(d));
}

/** Detect if a similar experiment was already tried */
export function isDuplicate(experiments: Experiment[], diffSummary: string, threshold = 0.8): Experiment | null {
  const words = new Set(diffSummary.toLowerCase().split(/\W+/).filter(Boolean));
  for (const exp of experiments) {
    const expWords = new Set(exp.diff_summary.toLowerCase().split(/\W+/).filter(Boolean));
    const intersection = [...words].filter(w => expWords.has(w)).length;
    const union = new Set([...words, ...expWords]).size;
    if (union > 0 && intersection / union > threshold) {
      return exp;
    }
  }
  return null;
}

/** Extract findings from experiment history */
export function extractFindings(experiments: Experiment[]): Finding[] {
  const findings: Finding[] = [];
  const kept = experiments.filter(e => e.status === 'keep');
  const discarded = experiments.filter(e => e.status === 'discard');

  // Find consistently beneficial tags
  const tagStats: Record<string, { keep: number; discard: number; crash: number }> = {};
  for (const exp of experiments) {
    for (const tag of exp.tags) {
      if (!tagStats[tag]) tagStats[tag] = { keep: 0, discard: 0, crash: 0 };
      tagStats[tag][exp.status]++;
    }
  }

  for (const [tag, stats] of Object.entries(tagStats)) {
    const total = stats.keep + stats.discard + stats.crash;
    if (total < 3) continue;
    const keepRate = stats.keep / total;
    if (keepRate > 0.6) {
      findings.push({
        id: `finding-${tag}-positive`,
        discovered_at: new Date().toISOString(),
        confidence: keepRate > 0.8 ? 'high' : 'medium',
        category: tag,
        insight: `${tag} changes have ${(keepRate * 100).toFixed(0)}% keep rate (${stats.keep}/${total})`,
        evidence: kept.filter(e => e.tags.includes(tag)).map(e => e.id),
        invalidated_by: null,
      });
    } else if (keepRate < 0.2 && total >= 3) {
      findings.push({
        id: `finding-${tag}-negative`,
        discovered_at: new Date().toISOString(),
        confidence: 'medium',
        category: tag,
        insight: `${tag} changes rarely help — ${(keepRate * 100).toFixed(0)}% keep rate. consider moving on.`,
        evidence: discarded.filter(e => e.tags.includes(tag)).map(e => e.id),
        invalidated_by: null,
      });
    }
  }

  return findings;
}

/** Write findings to markdown for cross-session transfer */
export function writeFindingsMarkdown(dir: string, findings: Finding[]): void {
  const lines = ['# Research Findings\n', `_Auto-generated ${new Date().toISOString()}_\n`];

  const byCategory = new Map<string, Finding[]>();
  for (const f of findings) {
    const list = byCategory.get(f.category) || [];
    list.push(f);
    byCategory.set(f.category, list);
  }

  for (const [category, catFindings] of byCategory) {
    lines.push(`## ${category}\n`);
    for (const f of catFindings) {
      const icon = f.confidence === 'high' ? '✓' : f.confidence === 'medium' ? '~' : '?';
      lines.push(`- [${icon}] ${f.insight}`);
      if (f.invalidated_by) lines.push(`  - invalidated by: ${f.invalidated_by}`);
    }
    lines.push('');
  }

  writeFileSync(`${dir}/${FINDINGS_FILE}`, lines.join('\n'));
}
