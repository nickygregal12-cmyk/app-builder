# @app-builder/composition

Deterministic requirements-to-product composition for App Builder.

Inputs:
- Project Manifest (v2 preferred; v1 supported as a compatibility fallback)
- optional Phase 3 trusted knowledge pack

Output:
- stable PageSpec records
- stable SectionSpec records
- provenance-aware content bindings
- composition warnings and input/hash metadata

This package is factory-side only. Generated applications receive the composition data they need, not a runtime dependency on this package.
