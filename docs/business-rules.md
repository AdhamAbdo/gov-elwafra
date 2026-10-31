# Business rules

- Missing current-cycle checks are `not_verified`, never compliant.
- Compliance, task, review, and corrective-action states are independent.
- License and contract renewals retain the prior record through self-references.
- A resignation event records a process; it does not change employment status automatically.
- Weekly task uniqueness is `(compliance_item_id, review_cycle_id)`.
- Database review decisions reject self-approval; a review decision does not change corrective-action status.
- An owner can only request corrective-action verification. A separately authorized reviewer closes or returns it.
- An inspection submission needs an evidence reference when the obligation requires evidence. A `not_applicable` result requires a documented reason.
- A reviewer can act only on a pending result and cannot review their own inspection. A returned result goes back to the task owner for correction; approved and escalated results remain immutable to ordinary resubmission.
- Corrective actions can be created only for an `action_required` finding, and their assigned owner must have access to the same company.
