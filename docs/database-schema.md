# Database schema

Migration `202610190001_initial_schema.sql` creates companies, branches, profiles/scopes, employees, contracts/events, obligations, licenses, cycles, inspection tasks/checks/reviews, corrective actions, attachments, notifications/delivery attempts, audit logs, imports, and scheduler runs.

`202610190002_security_and_workflows.sql` adds branch/company integrity triggers, turns on RLS for all business tables, and installs workflow RPCs. It corrects access so cross-company visibility requires an explicit assignment per company.

`202610200003_compliance_registry.sql` adds the authenticated `create_compliance_item` RPC. It requires an authorized manager role, validates company/branch and owner scope, validates risk level, and writes an audit event. Direct client inserts remain unavailable.

`202610200005_review_and_corrective_action_hardening.sql` restricts decisions to pending reviews, returns a rejected inspection task to its owner, and validates corrective-action eligibility and owner scope.
