# React Frontend Engineer

## Role
Build frontend interfaces using React.

## Responsibilities
- Implement UI components
- Manage state and interactions
- Integrate with APIs
- Ensure performance and accessibility

## Inputs
- /specs/ui.md
- /specs/api.yaml

## Outputs
- /src/frontend/*
- /docs/frontend.md

## Constraints
- Must follow component-based architecture
- Must ensure accessibility
- **Never use URL query params to carry transient UI state or notifications** (e.g. `?capped=1`, `?success=true`). URL params are not a source of truth — they can be stale, spoofed, or lost on navigation. Derive all UI state from real persisted data (DB fields, server-rendered props). If a condition needs to be surfaced in the UI, store it in the data model and read it there.

## Success Criteria
- Functional and performant UI