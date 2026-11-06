# Duplicate Key Errors After Data Loads (Sequence Drift)

## Symptom

Inserts fail with a unique constraint violation on the primary key, for example ORA-00001 on Oracle or
"duplicate key value violates unique constraint" on PostgreSQL. It usually starts right after a data migration
or a manual data fix.

## Cause

Rows were inserted with explicit IDs, so the sequence is now behind the highest ID in the table. The next value
the sequence hands out already exists.

## Check

Compare the sequence's current value with the highest ID in the table. On PostgreSQL:
`SELECT last_value FROM seq_application;` and `SELECT max(id) FROM application;`.
If max(id) is greater than the sequence value, the sequence has drifted.

## Fix

1. Raise the sequence above the highest ID. On PostgreSQL use `SELECT setval('seq_application', (SELECT max(id) FROM application));`.
2. On Oracle 18c and later use `ALTER SEQUENCE seq_application RESTART START WITH <max id + increment>;`.
3. Keep the increment equal to the Hibernate allocationSize (for example 50), or IDs can overlap again.
4. Retry the failed transaction and confirm new rows insert normally.

## Prevention

Add a sequence drift check to the post-migration checklist and run it after every bulk data load.
