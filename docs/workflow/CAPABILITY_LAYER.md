# Capability Layer

`harness/capabilities/manifest.json` is the canonical registry of abilities and providers. Agents ask for abilities such as `github`, `documentation`, `browser`, or `test`; the orchestrator chooses an allowed provider. This layer does not introduce a second workflow or task state.

Provider selection considers role, risk, approval, availability, source priority, and evidence sufficiency. Existing providers must be reused before a new adapter is added. Required providers fail closed; optional providers degrade honestly. External-write and production risks require declared human approval.

## Documentation resolution

Documentation requests are routed through the `documentation` capability. `harness/capabilities/manifest.json` is the only normative source for request classification, provider priority, evidence sufficiency, Context7 fallback conditions, failure behavior, and required evidence fields.

Operationally:

- agents request `documentation`, not a named provider;
- local repository and installed dependency evidence are evaluated before external providers;
- provider selection stops when evidence is sufficient;
- optional provider failure is reported honestly and does not silently become success;
- material decisions follow the primary-source and installed-version requirements declared in the manifest;
- Context7 MCP is unsupported.

This document deliberately does not duplicate the manifest's trigger list.

## Other capabilities

GitHub uses `git` and `gh` over HTTPS. Browser evidence may use Playwright or optional Chrome DevTools MCP. Provider-specific configuration remains subordinate to the Capability Layer and existing approval boundaries.

## Normative provider policy

`harness/capabilities/manifest.json` is the only normative source for documentation provider order and Context7 fallback conditions. Other documents reference it and must not duplicate its condition list.
