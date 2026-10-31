# Permissions matrix

System administrators configure roles and scopes. General managers receive cross-company scope only through explicit assignment. Company managers and officers are limited to assigned company/branch records; officers may work assigned tasks but cannot approve their own checks. Read-only users have no mutation permissions. All company queries evaluate `can_access_company`; branch records also evaluate `can_access_branch`.

Reviewed RPCs now exist for inspection submission, review decisions, corrective-action creation/closure, and scheduler-owned task and notification generation. Scheduler functions are service-role only; client mutation RPCs require an authenticated caller and check company roles internally.

Compliance Registry creation is restricted to company managers, general managers, and system administrators assigned to the selected company.

Review decisions are restricted to company managers, general managers, and system administrators. The database rejects self-review. Compliance officers submit inspection results; read-only users have neither submission nor review privileges.
