# Kinly

Kinly is a local-first React application for tracking baby care, growth, family timeline, reminders, expenses, and postpartum routines.

The app stores data in IndexedDB and can back up one semantic application snapshot to the user's private Google Drive `appDataFolder`. It has no application backend.

## Features

- Baby and mother activity logging
- Daily home summaries
- Timeline and journal with private media
- Growth measurements and WHO reference charts
- Pumping and postpartum tracking
- Family expenses and budgets
- Reminders and notifications
- Family profile and onboarding
- Google Drive backup and restore
- Installable PWA

## Stack

- React 19
- TypeScript
- Vite 7
- React Router 7
- Zustand 5
- IndexedDB
- Chart.js
- vite-plugin-pwa and Workbox

## Architecture

Kinly uses feature ownership for product code. Domain behavior belongs to the owning feature; application composition belongs in `app/`; reusable code with no feature-specific business rules belongs in `shared/`.

```text
app/src/
├── app/                  # Application composition and lifecycle
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

Architecture tests enforce feature boundaries and prevent private cross-feature imports.

### Ownership rules

- `app/` composes routes, providers, and global lifecycle code.
- `features/*` owns domain components, selectors, stores, feature hooks, and feature styles.
- `shared/` contains reusable code with no feature-specific business rules.
- Feature code does not depend on another feature's private files. Import its public entry point instead.
- Persist raw domain data. Calculate totals and other derived values with selectors.

See `ARCHITECTURE.md` for the current data, dependency, and persistence contracts.

## Persistence

Zustand uses `app/src/data/localDb.ts` as its IndexedDB storage adapter. The current logical storage namespace is generation 4. The adapter does not read or migrate historical v2 or v3 store keys.

Kinly intentionally retains the historical `babygrowth-local`, `babygrowth_v4_*`, and `babygrowth-sync*.json` identifiers so existing installations and Google Drive backups remain readable after the rebrand. Changing those identifiers requires an explicit data migration and is not part of a cosmetic rename.

Google Drive does not copy Zustand persistence keys. `app/src/features/sync/appSnapshot.ts` exports a semantic application snapshot with generation 2 sections for profile, activities, growth, timeline, expenses, and reminders.

The Drive backup envelope uses sync schema version 2:

```text
Feature stores
    ↓
AppSnapshot generation 2
    ↓
SyncSnapshot schema 2
    ↓
Google Drive appDataFolder
```

A schema-1 Drive backup is rejected. This is intentional for the current persistence generation.

Private timeline media is stored as blobs in IndexedDB and uploaded as separate files in `appDataFolder`. Snapshot JSON contains media references, not Base64 media payloads.

## Development

From the repository root:

```bash
cd app
npm install
npm run dev
```

The development server normally runs at `https://localhost:5173` with a local SSL certificate.

## Validation

Run the same core checks used by CI:

```bash
cd app
npm test
npm run lint
npm run build
```

Browser E2E coverage is available with:

```bash
npm run test:e2e
```

CI uses Node.js 22.

## Google Drive setup

Create an OAuth 2.0 Web application client in Google Cloud Console. Enable the Google Drive API and add each development or production origin to Authorized JavaScript origins.

Copy the environment example and set the browser client ID:

```bash
cd app
cp .env.example .env.local
```

Set:

```text
VITE_GOOGLE_CLIENT_ID=<your web OAuth client ID>
```

The app requests `https://www.googleapis.com/auth/drive.appdata`. Google access tokens remain in memory. The app does not store a refresh token.

## Deployment

Firebase Hosting serves `app/dist/`. Production and preview deployment scripts live in `app/package.json` and `app/scripts/`.

Never commit `.env.local`, service account JSON, access tokens, or other credentials.

## Contributing

Create a feature branch from `master`. Keep feature business logic inside its feature directory and move shared code into `shared/` only when more than one feature has a real use for it.

Before opening or updating a pull request, run:

```bash
cd app
npm test
npm run lint
npm run build
```
