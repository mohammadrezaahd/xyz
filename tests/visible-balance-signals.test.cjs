const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const page = fs.readFileSync('app/page.tsx', 'utf8');
const balance = fs.readFileSync('components/buy-sell-balance.tsx', 'utf8');
const signals = fs.readFileSync('components/signals-panel.tsx', 'utf8');
const diagnostics = fs.readFileSync('components/signals-diagnostics.tsx', 'utf8');

test('Buy/Sell Balance is rendered in Overview and Opportunity through one reusable component', () => {
  assert.match(page, /<BuySellBalance balance=\{analysis\.buySellBalance\}/);
  assert.match(fs.readFileSync('components/opportunity-panel.tsx', 'utf8'), /<BuySellBalance balance=\{analysis\.buySellBalance\}/);
  assert.equal((page.match(/import \{ BuySellBalance \}/g) || []).length, 1);
});

test('custom balance gauge is visible, read-only, accessible, and honest about missing data', () => {
  assert.match(balance, /role="img"/);
  assert.match(balance, /INSUFFICIENT DATA/);
  assert.match(balance, /balanceSellZone/);
  assert.match(balance, /balanceNeutralZone/);
  assert.match(balance, /balanceBuyZone/);
  assert.match(balance, /Directional evidence only/);
  assert.doesNotMatch(balance, /input.*type="range"/s);
});

test('Signals empty state exposes diagnostics and rejected observations', () => {
  assert.match(signals, /SignalsDiagnostics/);
  assert.match(signals, /Recent rejected candidates/);
  assert.match(signals, /NO_TRADE_NEGATIVE_EDGE/);
  assert.match(signals, /View diagnostics/);
  assert.match(diagnostics, /Latest rejection/);
  assert.match(diagnostics, /External reference/);
  assert.match(diagnostics, /Opportunity cron/);
});

test('current UI uses Data completeness instead of Confidence', () => {
  for (const file of ['app/page.tsx', 'components/opportunity-panel.tsx', 'components/snapshot-page.tsx', 'components/signals-panel.tsx']) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, />\s*Confidence\s*</i, file);
  }
});

test('summary and cron APIs expose persisted diagnostics contracts', () => {
  assert.match(fs.readFileSync('app/api/signals/summary/route.ts', 'utf8'), /getSignalsSummary/);
  assert.match(fs.readFileSync('lib/automation-runs.ts', 'utf8'), /automationRuns/);
  assert.match(fs.readFileSync('app/api/cron/signals/route.ts', 'utf8'), /generated/);
  assert.match(fs.readFileSync('app/api/cron/signals/route.ts', 'utf8'), /No eligible observations/);
});
