# Release policy

A completed development task is not proof of production deployment. Releases use a separate lifecycle: `CANDIDATE → PREVIEW_VERIFIED → PRODUCTION_APPROVED → DEPLOYED → OBSERVING → ACCEPTED`. Production approval and deployment recording require explicit human actors. The harness records external deployment evidence but does not execute a production deployment.

The `production` GitHub Environment contract is defined in `harness/integrations/github.json`. Before approval, run `npm run github:production-environment-check` and manually confirm administrator bypass is disabled. This gate establishes authorization only; it is not provider deployment.
