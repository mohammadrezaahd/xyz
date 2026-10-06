const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const page = fs.readFileSync("app/page.tsx", "utf8");
const phase3 = fs.readFileSync("components/phase3-panel.tsx", "utf8");
const phase4 = fs.readFileSync("components/test-position-panel.tsx", "utf8");

test("navigation uses distinct Phase 4 and Phase 3 labels", () => {
  assert.match(page, /Phase 4 Paper Position/);
  assert.match(page, /Phase 3 History/);
  assert.match(page, /Phase 3 Opportunity History/);
});

test("Phase 4 position view renders only the Phase 4 panel", () => {
  const positionView = page.match(/view === "position"[\s\S]*?\n      \{view === "history"/);
  assert.ok(positionView);
  assert.match(positionView[0], /<TestPositionPanel currentPrice=\{prices\?\.bitpin \?\? null\} \/>/);
  assert.doesNotMatch(positionView[0], /<Phase3Panel/);
});

test("Phase 3 history view renders Phase3Panel and not TestPositionPanel", () => {
  const historyView = page.match(/\{view === "history" &&[\s\S]*?\n      \{error &&/);
  assert.ok(historyView);
  assert.match(historyView[0], /<Phase3Panel \/>/);
  assert.doesNotMatch(historyView[0], /<TestPositionPanel/);
});

test("components retain separate primary APIs", () => {
  assert.match(phase3, /fetch\(`\/api\/opportunities/);
  assert.match(phase4, /fetch\("\/api\/test-positions/);
  assert.match(phase4, /\/api\/test-positions\/\$\{id\}\/close/);
});
