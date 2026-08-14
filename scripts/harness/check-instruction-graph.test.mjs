import test from "node:test";
import assert from "node:assert/strict";
import { nestedAgentsReferences } from "./check-instruction-graph.mjs";

test("detects retired nested AGENTS.md paths", () => {
  assert.deepEqual(
    nestedAgentsReferences("See docs/operations/AGENTS.md and product/AGENTS.md."),
    ["docs/operations/AGENTS.md", "product/AGENTS.md"],
  );
});

test("ignores root AGENTS.md while allowing provider-specific routing", () => {
  assert.deepEqual(
    nestedAgentsReferences("Read root AGENTS.md, then CODEX.md or scoped .mdc."),
    [],
  );
});
