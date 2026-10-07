# Multi-Opportunity Tracking

OPEN opportunities are no longer a global singleton. `listOpenOpportunities()` loads all open rows; `status-created-at` is used for ordering and `observation-key` provides deterministic identity.

The opportunity cron monitors and resolves each open opportunity independently. An error in one item does not stop the others.

History exposes open opportunities with checkboxes, select-all and clear-all controls. Selected IDs are sent to `POST /api/test-positions/batch`, which returns independent `created`, `skipped`, and `failed` arrays. Phase 4 keeps one OPEN paper position per source opportunity.
