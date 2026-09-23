# Official schema fixtures

Unmodified files from https://github.com/ards-project/ard-spec at commit
`b76f235a8f461876ad4f1e77abd0eb0eb302b48d`, retrieved 2026-09-23.

- `spec/schemas/ai-catalog.schema.json`: SHA-256 `c55238483a4738e08b250bdd6af1f4dc05a91afe882c649d224d09c19cd8fe09`.
- `spec/schemas/ard-entry.schema.json`: SHA-256 `011b86d55fd5d2883dffae3f0577d26f5efb56ca866eb079edbc78a628f95499`.
- `LICENSE`: upstream Apache-2.0 license, Copyright 2026 Agentic Resource Discovery project.

AI Catalog 1.0 is a draft. ARD v0.91 is a proposal with an independent `ArdManifest` definition at `#/$defs/ArdManifest`; it does not use the schema root (`ArdEntry`) for manifests. Future schema updates require deliberate review and updated fixture hashes, not a network request from tests.
