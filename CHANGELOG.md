# Changelog

All notable changes to `@surrealdb/mastra-ai` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-beta.1]

First beta of the 1.0 line. Everything below is verified against SurrealDB v3
and `@mastra/core` 1.63.

### Changed

- Raised the tested `@mastra/core` floor to **1.63.0** (peer range stays
  `>=1.31.0-0 <2.0.0-0`). No source changes were required — the 1.52 → 1.63
  jump is source-compatible for this adapter.
- Updated `surrealdb` to 2.0.8 and `@surrealdb/spectron` to 1.0.0-alpha.8.
- Integration tests now run with `fileParallelism: false`. Each file initialises
  the schema in its own database against one shared server, and running them
  concurrently could hit KV write conflicts on `DEFINE`.

### Fixed

- **The publish workflow could never succeed.** It had no `actions/checkout`
  step, so `package.json` was absent on the runner: version extraction silently
  produced an empty string and the build failed. This is why `v0.2.0` was tagged
  but never reached npm.
- `repository.url`, `homepage`, and `bugs.url` point at `surrealdb/mastra-ai`.
  They initially used the repository's former `surrealdb-dev` name, which npm
  rejected with `E422` because `repository.url` must match the repository in the
  signed provenance attestation.
- Prerelease versions are no longer published under the `latest` dist-tag. The
  workflow now derives the tag from the version (`1.0.0-beta.1` → `beta`) and
  fails fast if the release tag and `package.json` version disagree.
- Test sources are no longer included in the published tarball.

### Added

- Package metadata for the npm listing: `repository`, `homepage`, `bugs`,
  `keywords`, `sideEffects: false`, and an explicit `engines.node` of
  `>=22.13.0` matching `@mastra/core`.
- The release workflow now runs typecheck, unit tests, and the full integration
  suite against SurrealDB before publishing.

## [0.2.0] — tagged, never published

Tagged as `v0.2.0`, but the release never reached npm because of the publish
workflow defect described above. Its contents ship as part of `1.0.0-beta.1`.

### Added

- **Observational Memory.** `MemorySurrealDB` implements the full OM storage
  contract (`supportsObservationalMemory = true`), backed by the
  `mastra_observational_memory` table.
- **Memory extractors.** `spectronExtractedSink` bridges `@mastra/memory`'s
  observer/reflector extraction into `spectron.remember`.
- `examples/observational-memory`.

### Fixed

- SurrealDB v3 compatibility across every storage domain: `type::thing()` was
  removed in v3 and is replaced by `type::record()`, and `FLEXIBLE` must now
  follow `TYPE` in `DEFINE FIELD`.

## [0.1.0]

Initial release.

### Added

- `SurrealDBStore`, a `MastraCompositeStore` covering the memory, workflow,
  scores, and observability domains over a shared `SurrealDBClient`.
- Conversation memory: threads, messages, and working memory.
- Workflow suspend/resume with atomic snapshot storage.
- HNSW vector indexes for RAG without a separate vector database.
- Spectron integration under the `@surrealdb/mastra-ai/spectron` subpath:
  `SpectronMemory`, `createSpectronTools`, and document/RAG helpers.

[1.0.0-beta.1]: https://github.com/surrealdb/mastra-ai/releases/tag/v1.0.0-beta.1
[0.2.0]: https://github.com/surrealdb/mastra-ai/releases/tag/v0.2.0
[0.1.0]: https://github.com/surrealdb/mastra-ai/releases/tag/v0.1.0
