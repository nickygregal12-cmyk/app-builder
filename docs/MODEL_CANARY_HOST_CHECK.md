# Model canary host image check

`npm run runtime:model-canary` now uses a host-aware entry point that preserves the portable canary's fail-closed behaviour while allowing the real Hetzner host to settle one question CI cannot answer: whether the exact digest-pinned task image is present in the rootless Podman image store right now.

The host check is intentionally narrow:

- it reads the expected reference, tag and digest from `config/task-images.json`;
- it asks local rootless Podman for that image's `.Digest`;
- only an exact digest match changes `task-image-present-on-host` from `HOST/unknown` to `PASS`;
- a different digest or a failed inspection is a hard failure;
- a machine without Podman remains `HOST/unknown` and blocking;
- no environment variable or caller-supplied digest can turn the check green.

The existing hosted boundary attestation remains separate evidence. Image presence proves that the pinned image exists now; the attestation proves that the hosted isolation boundary was exercised with that digest. Both are required before a real provider call.
