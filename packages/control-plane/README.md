# @app-builder/control-plane

Provider-neutral durable control primitives for App Builder Phase 3.5.

This package does **not** run an AI model and does not depend on OpenCode, Hetzner, the Builder Console or any generated application. It owns deterministic task/loop/checkpoint/ChangeSet/context-policy helpers that later runtimes must obey.

Key rules:

- sessions are disposable; durable factory state is authoritative;
- source data never gains instruction authority;
- capability checks are deny-by-default;
- autonomous edits declare a ChangeSet before mutation;
- cost/time/token/iteration/no-progress loop guards are deterministic;
- generated apps never depend on this package at runtime.
