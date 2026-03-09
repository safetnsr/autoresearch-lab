#!/usr/bin/env node
/**
 * Reads thresholds.json and patches vet's source files.
 * This is the bridge between autoresearch config and vet's code.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const VET_SRC = '/var/www/vet/src';
const t = JSON.parse(readFileSync(new URL('./thresholds.json', import.meta.url), 'utf-8'));

// ── categories.ts ──
let cats = readFileSync(join(VET_SRC, 'categories.ts'), 'utf-8');

// Grade thresholds
cats = cats.replace(/if \(score >= \d+\) return 'A'/, `if (score >= ${t.grades.A}) return 'A'`);
cats = cats.replace(/if \(score >= \d+\) return 'B'/, `if (score >= ${t.grades.B}) return 'B'`);
cats = cats.replace(/if \(score >= \d+\) return 'C'/, `if (score >= ${t.grades.C}) return 'C'`);
cats = cats.replace(/if \(score >= \d+\) return 'D'/, `if (score >= ${t.grades.D}) return 'D'`);

// Category weights
cats = cats.replace(/security: [\d.]+/, `security: ${t.category_weights.security.toFixed(2)}`);
cats = cats.replace(/integrity: [\d.]+/, `integrity: ${t.category_weights.integrity.toFixed(2)}`);
cats = cats.replace(/debt: [\d.]+/, `debt: ${t.category_weights.debt.toFixed(2)}`);
cats = cats.replace(/deps: [\d.]+/, `deps: ${t.category_weights.deps.toFixed(2)}`);

// Score floor
cats = cats.replace(/return Math\.max\(\d+, check\.score\)/, `return Math.max(${t.score_floor_non_security}, check.score)`);

writeFileSync(join(VET_SRC, 'categories.ts'), cats);

// ── integrity.ts ──
let integ = readFileSync(join(VET_SRC, 'checks/integrity.ts'), 'utf-8');

integ = integ.replace(
  /score -= hallucinatedIssues\.length \* \d+/,
  `score -= hallucinatedIssues.length * ${t.integrity.hallucinated_import_penalty}`
);
integ = integ.replace(
  /score -= emptyCatchIssues\.filter\(i => i\.severity === 'error'\)\.length \* \d+/,
  `score -= emptyCatchIssues.filter(i => i.severity === 'error').length * ${t.integrity.empty_catch_error_penalty}`
);
integ = integ.replace(
  /score -= emptyCatchIssues\.filter\(i => i\.severity === 'warning'\)\.length \* \d+/,
  `score -= emptyCatchIssues.filter(i => i.severity === 'warning').length * ${t.integrity.empty_catch_warning_penalty}`
);
integ = integ.replace(
  /score -= stubbedTestIssues\.filter\(i => i\.severity === 'error'\)\.length \* \d+/,
  `score -= stubbedTestIssues.filter(i => i.severity === 'error').length * ${t.integrity.stubbed_test_penalty}`
);
integ = integ.replace(
  /score -= Math\.min\(\d+, unhandledWarnings \* \d+\)/,
  `score -= Math.min(${t.integrity.unhandled_async_cap}, unhandledWarnings * ${t.integrity.unhandled_async_penalty})`
);

writeFileSync(join(VET_SRC, 'checks/integrity.ts'), integ);

// ── debt.ts ──
let debt = readFileSync(join(VET_SRC, 'checks/debt.ts'), 'utf-8');

debt = debt.replace(
  /const dupPenalty = Math\.min\(\d+, dupIssues\.length \* \d+\)/,
  `const dupPenalty = Math.min(${t.debt.duplicate_cap}, dupIssues.length * ${t.debt.duplicate_penalty})`
);
debt = debt.replace(
  /const orphanPenalty = Math\.min\(\d+, orphanWarnings\.length \* \d+\)/,
  `const orphanPenalty = Math.min(${t.debt.orphan_cap}, orphanWarnings.length * ${t.debt.orphan_penalty})`
);
debt = debt.replace(
  /const wrapperPenalty = Math\.min\(\d+, wrapperWarnings\.length \* \d+\)/,
  `const wrapperPenalty = Math.min(${t.debt.wrapper_cap}, wrapperWarnings.length * ${t.debt.wrapper_penalty})`
);
debt = debt.replace(
  /const driftPenalty = Math\.min\(\d+, driftWarnings\.length \* \d+\)/,
  `const driftPenalty = Math.min(${t.debt.naming_drift_cap}, driftWarnings.length * ${t.debt.naming_drift_penalty})`
);

writeFileSync(join(VET_SRC, 'checks/debt.ts'), debt);

// ── deps.ts ──
let deps = readFileSync(join(VET_SRC, 'checks/deps.ts'), 'utf-8');

deps = deps.replace(
  /const rawScore = 100 - \(errors \* \d+\) - \(warnings \* \d+\)/,
  `const rawScore = 100 - (errors * ${t.deps.error_penalty}) - (warnings * ${t.deps.warning_penalty})`
);

writeFileSync(join(VET_SRC, 'checks/deps.ts'), deps);

// ── ready.ts ──
let ready = readFileSync(join(VET_SRC, 'checks/ready.ts'), 'utf-8');

ready = ready.replace(
  /const score = Math\.max\(0, Math\.min\(100, 100 - errors \* \d+ - warnings \* \d+ - infos \* \d+\)\)/,
  `const score = Math.max(0, Math.min(100, 100 - errors * ${t.ready.error_penalty} - warnings * ${t.ready.warning_penalty} - infos * ${t.ready.info_penalty}))`
);

writeFileSync(join(VET_SRC, 'checks/ready.ts'), ready);

// Rebuild vet
import { execSync } from 'node:child_process';
execSync('npm run build', { cwd: '/var/www/vet', stdio: 'pipe' });

console.log('thresholds applied + vet rebuilt');
console.log(JSON.stringify(t, null, 2));
