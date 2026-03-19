#!/usr/bin/env node

/**
 * Check Coverage Script
 * 
 * Validates that test coverage meets the required thresholds.
 * Exits with code 1 if coverage is below thresholds.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const THRESHOLDS = {
  lines: 90,
  branches: 85,
  functions: 95,
  statements: 90,
};

const COVERAGE_FILE = path.join(__dirname, '..', 'coverage', 'coverage-summary.json');

function checkCoverage() {
  if (!fs.existsSync(COVERAGE_FILE)) {
    console.error('❌ Coverage file not found. Run tests with coverage first: npm test');
    process.exit(1);
  }

  const coverage = JSON.parse(fs.readFileSync(COVERAGE_FILE, 'utf8'));
  const total = coverage.total;

  console.log('\n📊 Coverage Report:\n');
  console.log(`Lines:      ${total.lines.pct.toFixed(2)}% (threshold: ${THRESHOLDS.lines}%)`);
  console.log(`Branches:   ${total.branches.pct.toFixed(2)}% (threshold: ${THRESHOLDS.branches}%)`);
  console.log(`Functions:  ${total.functions.pct.toFixed(2)}% (threshold: ${THRESHOLDS.functions}%)`);
  console.log(`Statements: ${total.statements.pct.toFixed(2)}% (threshold: ${THRESHOLDS.statements}%)`);

  const failures = [];

  if (total.lines.pct < THRESHOLDS.lines) {
    failures.push(`Lines coverage (${total.lines.pct.toFixed(2)}%) is below threshold (${THRESHOLDS.lines}%)`);
  }

  if (total.branches.pct < THRESHOLDS.branches) {
    failures.push(`Branches coverage (${total.branches.pct.toFixed(2)}%) is below threshold (${THRESHOLDS.branches}%)`);
  }

  if (total.functions.pct < THRESHOLDS.functions) {
    failures.push(`Functions coverage (${total.functions.pct.toFixed(2)}%) is below threshold (${THRESHOLDS.functions}%)`);
  }

  if (total.statements.pct < THRESHOLDS.statements) {
    failures.push(`Statements coverage (${total.statements.pct.toFixed(2)}%) is below threshold (${THRESHOLDS.statements}%)`);
  }

  if (failures.length > 0) {
    console.log('\n❌ Coverage check failed:\n');
    failures.forEach(failure => console.log(`  - ${failure}`));
    console.log('\nPlease add more tests to meet the coverage thresholds.\n');
    process.exit(1);
  }

  console.log('\n✅ All coverage thresholds met!\n');
  process.exit(0);
}

checkCoverage();
