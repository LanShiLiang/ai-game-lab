# Local migration verification, 2026-10-10

This records local repository and deployment-pipeline verification, not a claim that the code is published or deployed to production. All three private game repositories have now been published and their complete remote source archives byte-verified against the tested local projects; registry entries record those actual remote commits. Browser-based uploads may create different remote commit IDs; deployment resolves the actual remote version at preparation time and does not assume a local SHA exists remotely.

## Independent projects

- game-transport-ship: 104 tests passed, clean-clone installation/build passed, release launched outside the checkout with a JSON config file and arbitrary cwd
- game-apex-rush: 37 tests passed, clean-clone installation/build passed, isolated API runtime/CORS/WebSocket/prefixed invites verified
- game-orbit-dash: 7 tests passed, clean-clone installation/build passed, standalone static artifact verified

Game implementation and performance evidence remain in those independent repositories. None is copied into this platform's current source tree or static-only dist. Published platform history is retained; the new public platform branch is based on the existing published main rather than the unpublished intermediate same-repository game refactor.

## Platform and deployment

Clean npm ci, JavaScript/registry checks, 41 automated tests and the platform-only build passed. Coverage includes:

- Explicit trusted repository policy and local-source opt-in
- Requested version to immutable SHA resolution, including annotated tags
- Exact dependency-lock digest and version/toolchain cache keys
- Immutable artifact digest/provenance binding, private asset API authentication/redirect isolation and artifact-first cache path
- Source lifecycle-hook suppression and stripped secret environment
- Archive/link checks, modified release/cache detection, compression reuse and precompressed-only static delivery
- Fetch/ref/build/probe failure preserving the active release
- Live same-process/instance acknowledgements and pointer restoration on failure or timeout
- Generic static/API/WebSocket forwarding, source/Origin/path boundaries, cleanup and warm swaps

A real three-game release was prepared from the independent local Git repositories in an external deployment-state directory. Repeating preparation reused all three verified builds. It did not change current or contact production.

Independent review verified all game artifact digests and lock/source identities, 65 browser-module import references, 193 real asset HEAD routes, prefixed and proxy-stripped routes, both actual game WebSocket room protocols, canonical invitation prefixes, hostile-origin rejection and private-file boundaries. Test shutdown removed both child processes.

In disposable copied state, a live FPS room blocked activation while preserving its socket and both existing backend processes. After explicit leave, activation and rollback returned ready only after the running gateway acknowledged the selected version.

## Remaining limits

Chromium cannot start in this executor because its IPC sockets are blocked. Actual UI rendering, GPU performance and browser FPS are not claimed. Transport performance measurements are documented separately in its own repository and remain CPU measurements.

The gateway exposes unhealthy child status but does not silently restart crashed game processes. Production readiness monitoring and process-supervisor policy remain deployment responsibilities. No production activation, firewall change or network-setting change was made.
