# Time and date policy

The harness separates machine evidence time from human calendar dates.

| Use | Canonical representation |
|---|---|
| approvals, evidence, delegation, gate history, generated machine reports | UTC ISO 8601 timestamp, for example `2026-08-05T00:00:00.000Z` |
| `_active.md` `updated_at` | execution environment's local calendar date |
| `DONE.md` completion date | execution environment's local calendar date |
| worklog monthly filename and entry ID | execution environment's local calendar date |
| worklog audit context | local clock time, IANA time-zone identifier, and UTC ISO 8601 timestamp |

Harness scripts use `scripts/harness/time.mjs`. Scripts must not derive human-facing dates with `toISOString().slice(0, 10)`, because that produces the UTC calendar date and can disagree with the operator's local date around midnight.

Changing the host time zone changes future local-date metadata only. Existing evidence timestamps and worklog entries are not rewritten.
