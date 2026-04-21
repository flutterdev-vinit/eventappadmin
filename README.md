# Event Admin Dashboard

React + TypeScript + Vite admin interface for Firestore-backed event data (users, events, payments, messages, analytics).

## Setup

```bash
npm install
cp .env.example .env
# Fill `VITE_*` values from Firebase Console → Project settings → Your apps
```

```bash
npm run dev
```

## Build & deploy

```bash
npm run build
firebase deploy --only firestore:rules,firestore:indexes,hosting
```

Use the Firebase CLI logged into the correct Google account; project id is set in `.firebaserc`.

## Security notes

- Never commit `.env` or service account JSON keys (see `.gitignore`).
- Admin users need Firebase Auth custom claim `admin: true` plus matching Firestore rules.
