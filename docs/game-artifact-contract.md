# Game release contract v1

An independent game repository must build without access to ai-game-lab. Its npm build produces:

```
dist/
  game-release.json
  client/index.html
  client/... static runtime, assets, licenses
  server/index.mjs       optional, self-contained Node runtime
  server/...            optional, pinned dependencies and simulation
```

Example manifest:

```json
{
  "schemaVersion": 1,
  "id": "your-game-id",
  "version": "1.0.0",
  "client": "client",
  "service": {
    "entry": "server/index.mjs",
    "healthPath": "/api/your-game/health",
    "httpPrefixes": ["/api/your-game/"],
    "websocketPaths": ["/your-game"]
  }
}
```

For a static game, service is null. Service routes must exactly match the trusted platform registration. The service binds 127.0.0.1, reads GAME_SERVER_PORT and GAME_SERVER_CONFIG as an absolute JSON file path, and runs from an arbitrary cwd. It owns its authoritative game state and simulation. The platform never imports its source.

Client paths must be relative and work under /games/<id>/. Optional generic host SDK v1 messages use exact parent/window, origin and per-instance labSession. Shared protocol code may be vendored with its version/provenance/license; game implementation must not be vendored into the platform.

Prefer a versioned GitHub Release with:

- game-release.tgz: contents of dist at archive root, no enclosing directory
- game-release.sha256: SHA-256 followed by archive filename
- game-release.provenance.json:

```json
{
  "schemaVersion": 1,
  "gameId": "your-game-id",
  "repository": "https://github.com/owner/repo.git",
  "commit": "full-40-character-git-commit",
  "lockfileSha256": "sha256-of-exact-package-lock-json-bytes",
  "artifactSha256": "sha256-of-game-release-tgz"
}
```

Publish only after the artifact’s commit is tagged and checks pass. Retain code and asset licenses. A digest establishes integrity and provenance consistency, not legal permission or an independent signature; registry trust and repository access controls remain necessary. Avoid links, private files, credentials, mutable runtime downloads or install hooks in the artifact.

Private GitHub release assets use the verified [release-asset API](https://docs.github.com/en/rest/releases/assets#get-a-release-asset) with Accept: application/octet-stream. Authentication is sent only to the validated API endpoint, never forwarded to asset-storage redirects. Fine-grained credentials require Contents: read for the registered repository.
