# MCP usage policy

| Stage | GitHub Capability | Documentation Capability | Browser Capability |
|---|---|---|---|
| Planning | read-only normalized report when material | local + official sources | normally off |
| Research | supplied read-only report | local + official; Context7 CLI optional | off |
| Implementation | supplied report only; no external write | local + official; Context7 CLI optional | local UI only when approved |
| Verification | refresh normalized report | normally off | Playwright or optional Chrome DevTools MCP |
| Review | refreshed normalized report | official validation as needed | safe URL opt-in |
| Release | complete checks report | off | Preview smoke only |

GitHub MCP and Context7 MCP are unsupported. Chrome DevTools MCP is the only committed optional MCP provider and remains subordinate to the Browser Capability and all approval boundaries.
