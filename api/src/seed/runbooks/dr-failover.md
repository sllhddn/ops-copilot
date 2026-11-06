# Disaster Recovery Failover Drill

The drill moves production from the primary data centre to the disaster recovery centre (DRC) and back.
It runs once a year with the system owner present.

## Switchover order

1. Database first: stop replication, promote the DRC database to primary, and confirm it accepts writes.
2. Web servers second: point the DRC web servers at the DRC application servers and enable the virtual hosts.
3. Application servers last: start them against the promoted database and check the connection pool is healthy.
4. Update DNS to the DRC addresses. The DNS TTL is 5 minutes, so allow 10 minutes before testing from outside.

## Success criteria

- Recovery time objective (RTO): service available at the DRC within 4 hours.
- Recovery point objective (RPO): no more than 15 minutes of data lost.
- Users can log in, search records and submit a transaction at the DRC.

## Switch back

Reverse the order: application servers, then web servers, then database. Re-establish replication from the
primary before closing the drill. Record the timing of every step for the drill report.
