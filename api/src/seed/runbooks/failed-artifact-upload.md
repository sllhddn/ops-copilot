# Failed Release Upload to the Artifact Repository

## Symptom

A release build stops halfway through uploading to the artifact repository (Nexus), usually because of a network
error. A later attempt to release the same version fails because the version already exists.

## Fix

1. Open the repository browser and find the release version that failed.
2. Check which files were uploaded. A partial release usually has the POM but is missing the JAR or its checksums.
3. Delete the partial version from the release repository. Only the operations team has delete rights.
4. Ask the developer to run the release again with the same version number.
5. Confirm the JAR, POM and checksum files are all present before the deployment continues.

## Notes

Never bump the version just to get around a partial upload: dependent modules would point at a version that
was never fully published.
