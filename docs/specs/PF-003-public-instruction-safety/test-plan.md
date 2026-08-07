# Test plan

## Automated

- append two canonical sources into one AGENTS target in deterministic order
- reject duplicate replace targets
- reject target paths escaping repository root
- assert the real manifest has no generated instruction below `public/`
- assert root AGENTS contains the canonical Public asset role
- assert the public Cursor rule exists with its scoped glob
- run all GitHub, MCP, Git hook and React Doctor regression tests
- generate and check all rule outputs

## Static and packaging

- scan `public/` for AGENTS, `.cursor` and `.codex`
- parse JSON and workflow YAML
- JavaScript syntax check
- ensure the archive contains only reviewed inventory entries
- verify ZIP has no unsafe path, symlink, `.git`, `.harness` or secret pattern
- extract the ZIP and repeat synchronization and test execution
