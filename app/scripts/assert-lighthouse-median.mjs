import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const defaultThresholds = require('../lighthouse-thresholds.json');

export function median(values) {
  if (values.length === 0) throw new Error('Cannot calculate a median without values.');
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function auditScore(report, auditId) {
  const score = report.audits?.[auditId]?.score;
  return typeof score === 'number' ? score : null;
}

function categoryScore(report, categoryId) {
  const score = report.categories?.[categoryId]?.score;
  return typeof score === 'number' ? score : null;
}

export function evaluateReports(reports, thresholds = defaultThresholds) {
  const failures = [];
  const warnings = [];
  const categoryResults = {};

  if (reports.length !== thresholds.expectedRuns) {
    failures.push(`Expected ${thresholds.expectedRuns} Lighthouse reports, found ${reports.length}.`);
  }

  for (const [categoryId, minScore] of Object.entries(thresholds.categories)) {
    const scores = reports.map((report) => categoryScore(report, categoryId));
    if (scores.some((score) => score === null)) {
      failures.push(`Category ${categoryId} is missing from at least one Lighthouse report.`);
      continue;
    }

    const numericScores = scores;
    const medianScore = median(numericScores);
    categoryResults[categoryId] = { scores: numericScores, median: medianScore, minScore };
    if (medianScore < minScore) {
      failures.push(
        `Median ${categoryId} score ${medianScore.toFixed(2)} is below ${minScore.toFixed(2)}.`,
      );
    }
  }

  for (const auditId of thresholds.requiredAudits) {
    const scores = reports.map((report) => auditScore(report, auditId));
    if (scores.some((score) => score === null || score < 1)) {
      failures.push(`Required audit ${auditId} did not pass on every runner.`);
    }
  }

  for (const auditId of thresholds.warningAudits) {
    const scores = reports.map((report) => auditScore(report, auditId));
    if (scores.some((score) => score === null || score < 1)) {
      warnings.push(`Audit ${auditId} did not pass on every runner.`);
    }
  }

  const benchmarkIndices = reports
    .map((report) => report.environment?.benchmarkIndex)
    .filter((value) => typeof value === 'number');

  return {
    passed: failures.length === 0,
    failures,
    warnings,
    categoryResults,
    benchmarkIndices,
  };
}

function listJsonFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(fullPath);
    }
  }
  return files;
}

export function loadLighthouseReports(directory) {
  if (!fs.existsSync(directory)) {
    throw new Error(`Lighthouse report directory does not exist: ${directory}`);
  }

  return listJsonFiles(directory)
    .map((filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8')))
    .filter((report) => (
      typeof report === 'object'
      && report !== null
      && typeof report.lighthouseVersion === 'string'
      && typeof report.categories === 'object'
    ));
}

function formatScore(score) {
  return score.toFixed(2);
}

function runCli() {
  const reportDirectory = path.resolve(process.argv[2] ?? '.lighthouseci-aggregate');
  const reports = loadLighthouseReports(reportDirectory);
  const result = evaluateReports(reports);

  console.log(`Lighthouse median gate: ${reports.length}/${defaultThresholds.expectedRuns} independent runner reports`);
  for (const [categoryId, categoryResult] of Object.entries(result.categoryResults)) {
    const scores = categoryResult.scores.map(formatScore).join(', ');
    console.log(
      `${categoryId}: median ${formatScore(categoryResult.median)} `
      + `(required >= ${formatScore(categoryResult.minScore)}; runs: ${scores})`,
    );
  }

  if (result.benchmarkIndices.length > 0) {
    const indices = [...result.benchmarkIndices].sort((left, right) => left - right);
    console.log(
      `runner benchmarkIndex: median ${median(indices).toFixed(0)} `
      + `(range ${indices[0].toFixed(0)}-${indices.at(-1).toFixed(0)})`,
    );
  }

  for (const warning of result.warnings) {
    console.log(`::warning::${warning}`);
  }
  for (const failure of result.failures) {
    console.error(`::error::${failure}`);
  }

  if (!result.passed) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) runCli();
