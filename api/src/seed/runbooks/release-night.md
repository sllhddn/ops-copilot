# Release Night Runbook

Production releases run in the 22:00–01:00 maintenance window. All data is fictional.

## Before the window

1. Confirm the release ticket is approved and lists every SQL script in run order.
2. Check that each DDL script has been run on staging and has a rollback script.
3. Roster one engineer to run the release and one to verify; both stay online until the health checks pass.
4. Announce the window to the service desk at least 24 hours ahead.

## During the window

1. Switch the load balancer to the maintenance page.
2. Take a database backup or confirm the scheduled backup finished in the last 6 hours.
3. Run the DDL scripts in order. Stop at the first error and record the script name and error code.
4. Deploy the WAR file built from the release tag, never from a developer branch.
5. Restart the application servers one at a time and watch the logs for startup errors.

## After the window

1. Run the scripted health checks: login, search, submit an application, print a receipt.
2. Remove the maintenance page only when every health check passes.
3. If any check fails and cannot be fixed within 30 minutes, roll back: restore the previous WAR and run the rollback scripts.
4. Post a summary in the release channel with start time, end time and issues found.
