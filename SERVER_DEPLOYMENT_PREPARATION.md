# Local server deployment preparation

No deployment, settings change, scan, upload, staging, or commit is authorized by this file.

`server-release.json` is the explicit proposed release allowlist. All five new server modules are included, along with the evaluation dependency chain. Run `npm run check:server-release` before staging review and again after any separately authorized staging. The checker is read-only and rejects staged paths outside the allowlist. It is not an installed Git hook and cannot prevent someone bypassing it.

Both `npm start` and `npm run server` now select `node src/server.js`. The old daily entrypoint is available explicitly as `npm run scan`; do not run it during server preparation. No dependency installation is required by these changes. Axios ranges match the existing lockfile.

Credential files, inventory paths, and common local artifacts have ignore rules. Already tracked inventory remains tracked and unchanged: Git ignores do not protect tracked paths. Never use broad staging commands. Excluding an inventory change does not remove historical inventory from the repository. The allowlist is for the proposed commit, not a claim that Git-based Render builds exclude all other tracked files. No secret scan can guarantee the absence of every credential format.

## Confirmed migration state (reported by operator)

- Live server: `src/server.js`, with `NORTH_STAR_DATA_DIR` unset.
- Original inventory: `/opt/render/project/src/src/data/opportunities.json`.
- Verified backup: `/var/data/opportunities-backup-20261110T000326Z.json`.
- Verified destination: `/var/data/opportunities.json`, six records matching the original and backup at copy time.

## Approval boundaries remaining

- Review and separately authorize explicit staging/commit/push. These actions may trigger hosting automation; check deployment controls before pushing.
- Before cutover, approve a read-only freshness check and establish a quiet writer window. A matching copy at preparation time does not guarantee continued equivalence.
- Separately approve the coordinated data-directory setting change to `/var/data` and deployment/restart. Setting changes may restart the service. Keep original and backup intact. Confirm persistent-disk access by the service user.
- Verify the running revision, effective directory, protected full inventory, and public filtered feed after an approved rollout. Missing inventory currently reads as an empty array: do not switch to an unverified path.
- Daily/V1 now share the version-protected automatic uploader in `src/cloudSync.js`; V1 converts raw records to canonical review rows before publication. Rollout of these client changes still requires separate approval and the repaired server API first. They stop safely against an old server with no protected inventory endpoint. Direct daily local snapshot writes remain separate from remote publication and must not target the server's authoritative persistent inventory.
- A deployment rollback to the old replacement-write API is not a safe inventory rollback. Do not restore snapshots, remove locks, or change credentials automatically.

## Local verification

- Full existing offline suite: 362 passed, zero failed or skipped.
- Actual main server entrypoint started in a child process using a temporary data directory, sanitized environment, and ephemeral loopback listener. Local health returned HTTP 200 with an empty isolated inventory; the listener was closed and the fixture directory removed.
- Real local inventory bytes were unchanged by the startup check. No local `.env` was loaded by that child process.
- Release checker validates file presence, relative import coverage, dependency range agreement, entrypoint scripts, selected credential patterns, and staged-path exclusions. It reports zero staged files.
- Server runtime files and the release checker passed Node syntax checks.
- On this Windows machine use `npm.cmd run check:server-release` if PowerShell blocks `npm.ps1`; no execution-policy change is needed.
