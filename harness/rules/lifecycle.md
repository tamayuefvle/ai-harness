# Full lifecycle controller

`harness/lifecycle/manifest.json` is the canonical state-transition source. Project, task, release, and incident lifecycles are separate and coordinated. Do not duplicate state lists in prompts or documentation when they can be generated or referenced. Full lifecycle mode blocks new delivery tasks until project state `ACTIVE`; delivery-only mode exists solely for controlled migration compatibility.
