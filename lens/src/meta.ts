/**
 * Meta-analysis — generates periodic reports on research progress.
 * The "group meeting" that autoresearch is missing.
 */

import type { Experiment, Finding, MetaReport } from './types.js';
import { extractFindings, unexploredDimensions, explorationMap } from './memory.js';

/** Generate a meta-analysis report from experiment history */
export function generateMetaReport(experiments: Experiment[]): MetaReport {
  const findings = extractFindings(experiments);
  const unexplored = unexploredDimensions(experiments);

  // Calculate improvement rate (keeps per 10 experiments)
  const recent = experiments.slice(-10);
  const recentKeeps = recent.filter(e => e.status === 'keep').length;

  // Best result
  const validExps = experiments.filter(e => e.status !== 'crash' && e.val_bpb > 0);
  const bestBpb = validExps.length > 0
    ? Math.min(...validExps.map(e => e.val_bpb))
    : 0;

  // Diminishing returns detection
  const lastN = experiments.slice(-20);
  const lastKeeps = lastN.filter(e => e.status === 'keep');
  const diminishing = lastKeeps.length > 0 && lastN.length >= 10
    ? lastKeeps.every(e => {
        const prevBest = Math.min(...experiments
          .filter(p => p.status === 'keep' && p.timestamp < e.timestamp && p.val_bpb > 0)
          .map(p => p.val_bpb).concat([Infinity]));
        return prevBest > 0 && (prevBest - e.val_bpb) / prevBest < 0.001;
      })
    : false;

  // Generate suggestions
  const suggested = generateSuggestions(experiments, findings, unexplored, diminishing);

  return {
    generated_at: new Date().toISOString(),
    total_experiments: experiments.length,
    best_val_bpb: bestBpb,
    improvement_rate: recentKeeps,
    top_insights: findings.filter(f => f.confidence !== 'low').slice(0, 5),
    unexplored,
    diminishing_returns: diminishing,
    suggested_next: suggested,
  };
}

function generateSuggestions(
  experiments: Experiment[],
  findings: Finding[],
  unexplored: string[],
  diminishing: boolean
): string[] {
  const suggestions: string[] = [];
  const map = explorationMap(experiments);

  // Suggest unexplored dimensions
  if (unexplored.length > 0) {
    suggestions.push(`try ${unexplored[0]} — haven't explored this dimension yet`);
  }

  // If diminishing returns, suggest bigger moves
  if (diminishing) {
    suggestions.push('improvements are plateauing — try a fundamentally different architecture');
    suggestions.push('consider combining the top 2-3 changes that individually helped');
  }

  // If one dimension is over-explored, suggest moving on
  for (const [tag, count] of Object.entries(map)) {
    if (count > 8) {
      const keepRate = experiments
        .filter(e => e.tags.includes(tag) && e.status === 'keep').length / count;
      if (keepRate < 0.3) {
        suggestions.push(`${tag} tried ${count}x with ${(keepRate * 100).toFixed(0)}% success — move on`);
      }
    }
  }

  // If crash rate is high, suggest safer experiments
  const crashRate = experiments.filter(e => e.status === 'crash').length / experiments.length;
  if (crashRate > 0.3) {
    suggestions.push(`${(crashRate * 100).toFixed(0)}% crash rate — make smaller, safer changes`);
  }

  return suggestions.slice(0, 5);
}

/** Format report as markdown for agent consumption */
export function formatReportMarkdown(report: MetaReport): string {
  const lines = [
    `# meta-analysis (${report.total_experiments} experiments)\n`,
    `**best val_bpb:** ${report.best_val_bpb.toFixed(6)}`,
    `**recent hit rate:** ${report.improvement_rate}/10 last experiments improved`,
    `**diminishing returns:** ${report.diminishing_returns ? 'YES — consider bigger moves' : 'no'}\n`,
  ];

  if (report.top_insights.length > 0) {
    lines.push('## insights');
    for (const f of report.top_insights) {
      lines.push(`- [${f.confidence}] ${f.insight}`);
    }
    lines.push('');
  }

  if (report.unexplored.length > 0) {
    lines.push(`## unexplored: ${report.unexplored.join(', ')}\n`);
  }

  if (report.suggested_next.length > 0) {
    lines.push('## suggested next');
    for (const s of report.suggested_next) {
      lines.push(`- ${s}`);
    }
  }

  return lines.join('\n');
}
