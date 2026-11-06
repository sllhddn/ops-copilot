# Application Server Out of Memory

## Symptom

Pages time out, the logs show java.lang.OutOfMemoryError, and the JVM heap graph stays near its maximum after
garbage collection.

## Immediate action

1. Take a heap dump before restarting if the server still responds: `jcmd <pid> GC.heap_dump /tmp/heap.hprof`.
2. Remove the node from the load balancer pool so users are sent to healthy nodes.
3. Restart the application server and watch the startup log until the application is deployed.
4. Add the node back to the pool once the health check URL returns 200.

## Root cause

Open the heap dump in a memory analyser and look for the largest retained objects. Common causes are reports
that load a whole table into memory, sessions that never expire, and caches without a size limit.
Raise a ticket with the dump summary for the development team.
