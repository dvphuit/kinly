# Kinly architecture

## Source layout

Kinly uses feature ownership for product code and a small shared layer for reusable code.

```text
src/
├── app/
├── features/
│   ├── activities/
│   ├── home/
│   ├── timeline/
│   ├── growth/
│   ├── expenses/
│   ├── reminders/
│   ├── profile/
│   └── sync/
├── shared/
│   ├── ui/
│   ├── hooks/
│   ├── lib/
│   └── styles/
└── data/
```

Move code only when ownership and dependency direction stay clear. Do not move files only to make the tree look more uniform.

## Dependency direction

`app` may import feature public entry points and shared code.

A feature may import shared code and domain-independent data. A feature must not import another feature's private component, hook, selector, store, or other implementation file.

`shared` must not import feature code, including feature public entry points.

Every feature exposes exactly one public entry point at `features/<feature>/index.ts`. Production code outside the owning feature must consume that feature through the alias import `@/features/<feature>`; relative cross-feature imports and deep imports such as `@/features/<feature>/components/*`, `hooks/*`, `domain/*`, or `store/*` are private-boundary violations.

Architecture acceptance tests parse static imports, re-exports, dynamic `import()`, and `require()` calls to enforce these edges. Existing violations may be listed only as exact source-file/import-specifier exceptions in the architecture audit. Do not add wildcard exceptions or expand an exception to cover a directory. The audit also rejects stale exceptions, so remove an exception as soon as the dependency is moved behind the target feature's public API.

## Activity data

Baby and mother activities use the same persisted activity store. `ActivityRecord` is a discriminated union of `BabyActivity` and `MomActivity`.

Persist activity facts such as occurrence time, amount, duration, side, symptoms, and notes. Calculate daily totals through selectors. Do not persist a second daily total when the same value can be calculated from activity records.

The activity registry may hold stable metadata such as labels and icons. Forms and feature-specific presentation stay explicit React code.

## Snapshot contract

`features/sync/appSnapshotSchema.ts` is the pure semantic wire contract for backup and restore. It owns `AppSnapshot`, the generation constant, and boundary parsing/validation. It must not read, write, or subscribe to application stores or depend on feature runtime values.

`features/sync/appSnapshot.ts` is the Sync-side port. It exposes snapshot export/apply/subscription operations to Google Drive sync but does not know any feature stores. The application configures that port once during bootstrap.

`app/lifecycle/appSnapshotRuntime.ts` is the app-composition adapter. It assembles the semantic snapshot from feature state, applies a validated snapshot back to current stores, and subscribes to snapshot-relevant changes. Because it composes multiple domains, it belongs to `app` and consumes each feature through its public API.

`AppSnapshot` generation 2 has these semantic sections:

- `profile`
- `activities`
- `growth`
- `timeline`
- `expenses`
- `reminders`

The snapshot does not expose Zustand storage keys. Separating the schema, port, and app runtime does not change generation 2 or the Google Drive file format. A generation change is reserved for an incompatible semantic wire-contract change, not for moving implementation code.

`GrowthFacts` persists only measurement facts, milestone progress, the active stage, and completed habit IDs. `StageData` is an in-memory projection rebuilt from those facts plus static reference data. WHO chart series, vitals summaries, scores, labels, and other calculated presentation are not persisted.

## Local persistence

`data/localDb.ts` provides the current physical persistence boundary for `babygrowth_v4_*` records inside the historical `babygrowth-local` IndexedDB database.

These BabyGrowth-era identifiers intentionally survive the Kinly rebrand. Existing browser installations already store data under them, so changing them without a migration would make current data appear missing. Treat their literal values as compatibility contracts rather than current product branding.

The adapter does not read v2 or v3 store records. The app has no migration step for those generations.

Media blobs use a separate IndexedDB object store and are not encoded into the Zustand JSON records.

## Google Drive sync

`features/sync/googleDriveSync.ts` wraps `AppSnapshot` in `SyncSnapshot` schema version 2. The envelope adds conflict-detection metadata:

- `updatedAt`
- `deviceId`
- `fingerprint`

Google Drive sync never reads or writes individual Zustand records. Auto-sync subscribes through the configured snapshot port, so Sync remains independent of feature store implementations.

The existing `babygrowth-sync-v2.json`, legacy `babygrowth-sync.json`, sync metadata key, and device identifier are also compatibility contracts. Renaming them requires a migration that can discover and reconcile existing Drive and local state.

Schema-1 Drive backups are incompatible with the current generation and are rejected at the parser boundary.

Timeline media uses separate private files in `appDataFolder`. Snapshot data stores Drive file identifiers on timeline media records.

## State rules

Persist raw domain facts. Use selectors for values that can be calculated from those facts.

Examples of derived values include:

- current age
- daily milk total
- daily sleep total
- diaper count
- pumping total
- expense summaries
- growth chart series

UI state such as a selected tab, dialog state, and search text does not belong in the Drive snapshot.

## Component rules

Shared UI components contain reusable interaction and presentation only. Feature components own domain behavior.

Feature-owned domain types live with the owning feature and are exported through its public API when another boundary needs them. Do not use the global type barrel as a dumping ground for feature contracts. Domain-specific controls such as feeding, medication, and temperature inputs belong to the Activities feature rather than `shared/ui`.

Split a large component when one part can have a clear responsibility such as form state, a selector-backed view model, media interaction, or a reusable presentation component. Do not split a file only to reduce its line count.

For timeline entries, the dialog shell owns detail presentation and edit/delete orchestration, while `TimelineEntryEditor` owns edit-form state, validation, and save orchestration. Cross-feature editor dependencies must use feature public APIs.

## Native animation ownership

Browser-native primitives own runtime animation behavior. CSS transitions and keyframes handle declarative enter/exit and press feedback. The View Transition API handles route-level document transitions. Pointer Events write drag transforms directly to the DOM, and the Web Animations API handles imperative settle/dismiss animation.

React state must not update on every gesture frame. Keep layout, typography, spacing, colors, borders, and static visual state in CSS. All native animation paths must respect `prefers-reduced-motion`.

## Verification

Every architecture change must pass:

```bash
npm test
npm run lint
npm run build
```

Before removing a component, style, asset, or export, verify that no production consumer remains.
