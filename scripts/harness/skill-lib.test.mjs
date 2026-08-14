import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { writeSkillOutputs } from "./skill-lib.mjs";

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "harness-skill-"));
}

test("skill generation prunes retired marker-owned Cursor skills", () => {
  const root = tmpRoot();
  fs.mkdirSync(path.join(root, "harness/skills/planning"), { recursive: true });
  fs.writeFileSync(path.join(root, "harness/skills/planning/SKILL.md"), "# Planning\n");
  fs.mkdirSync(path.join(root, ".cursor/skills/retired"), { recursive: true });
  fs.writeFileSync(path.join(root, ".cursor/skills/retired/SKILL.md"), "<!-- GENERATED FILE. DO NOT EDIT DIRECTLY. -->\nold\n");

  writeSkillOutputs(root);

  assert.ok(fs.existsSync(path.join(root, ".cursor/skills/planning/SKILL.md")));
  assert.equal(fs.existsSync(path.join(root, ".cursor/skills/retired")), false);
});

test("skill generation preserves unmanaged Cursor skills", () => {
  const root = tmpRoot();
  fs.mkdirSync(path.join(root, "harness/skills/planning"), { recursive: true });
  fs.writeFileSync(path.join(root, "harness/skills/planning/SKILL.md"), "# Planning\n");
  fs.mkdirSync(path.join(root, ".cursor/skills/local-user-skill"), { recursive: true });
  fs.writeFileSync(path.join(root, ".cursor/skills/local-user-skill/SKILL.md"), "# User-owned skill\n");

  writeSkillOutputs(root);

  assert.ok(fs.existsSync(path.join(root, ".cursor/skills/local-user-skill/SKILL.md")));
});
