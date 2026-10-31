# Scheduled jobs

Run weekly task generation after the Riyadh Sunday boundary. Persist `scheduler_runs.idempotency_key` before processing. Create only active/applicable obligations, and rely on the inspection-task unique constraint for safe retries. Deadline scanning creates notifications with a stable event/entity/threshold key.

`generate_weekly_tasks` is service-role only, takes an advisory transaction lock, and relies on the task unique key as the final duplicate guard. `schedule_notification` has an idempotency key and does not equate scheduling with delivery.

## Running the scheduler

`npm run scheduler` (optionally `-- --at <ISO date-time>`) uses the service-role key from `.env.local`, so run it only from a trusted server or CI job, never from browser code. It upserts the current Sunday–Saturday Riyadh cycle, calls `generate_weekly_tasks`, calls `mark_overdue_corrective_actions` (migration 006), and records the outcome under `scheduler_runs.idempotency_key = weekly-cycle:<start date>`. Re-running is safe. Schedule it from Sunday 00:05 Asia/Riyadh (Saturday 21:05 UTC) and daily for overdue marking.
