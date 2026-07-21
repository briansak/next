# Updating Next

When new code is pushed to GitHub, pull it into your local install and apply schema/dependency changes.

## Standard update (recommended)

From your clone directory:

```bash
npm run update
```

This runs [scripts/update.sh](../scripts/update.sh), which:

1. `git fetch` + merge the latest `main` branch
2. `npm ci` — installs exact dependency versions from `package-lock.json`
3. `npm run db:push` — applies any Prisma schema changes to your database

**Your data is preserved:** `.env`, uploaded imports, and database content are not reset — unless a release notes a **breaking schema change** (see below).

## Breaking change: single-user schema (2026)

Older versions used multi-tenant tables (`Tenant`, `TenantMember`, etc.). The app is now **one user per install**. There is no automatic migration path.

If you upgraded from an older version and see Prisma errors about missing columns or `tenantId`, reset your **local** database:

```bash
npm run db:reset
```

This wipes communications and settings in the DB and re-seeds from `.env`. Export anything you need before running it.

After reset, sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `.env`.

Restart the app after updating:

```bash
npm run dev
# or for production:
npm run build && npm run start
```

## Manual update

```bash
git pull origin main
npm ci
npm run db:push
```

## If you forked the repository

Add the upstream remote once:

```bash
git remote add upstream git@github.com:briansak/next.git
# or: git remote add upstream https://github.com/briansak/next.git
```

Then update from upstream:

```bash
git fetch upstream main
git merge upstream/main
npm ci
npm run db:push
```

Or customize the update script:

```bash
bash scripts/update.sh upstream main
```

## What is safe vs. what to watch

| Safe (not overwritten by update) | May require attention after update |
|----------------------------------|-------------------------------------|
| `.env` | New required env vars in `.env.example` — compare and add missing keys |
| Database contents | Schema changes — `db:push` handles most additions |
| Local config in Settings UI | Rare breaking changes — check commit messages |
| Webex tokens in DB | Re-run `npm run db:seed` only on fresh DBs, not for updates |

## Merge conflicts

If you customized the codebase locally, `git pull` may conflict.

1. Commit or stash your changes: `git stash`
2. Run `npm run update`
3. Reapply your changes: `git stash pop` and resolve conflicts

Prefer configuring via `.env` and **Settings** rather than editing source, so updates stay painless.

## Staying informed

- Watch the repository on GitHub for new commits
- Read commit messages on `main` before updating production
- After major updates, run tests locally: `npm test`

## Roll back

If an update causes problems:

```bash
git log --oneline -5          # find the previous commit
git checkout <commit-sha>     # detached HEAD at known-good version
npm ci
npm run db:push
```

To return to latest later: `git checkout main && npm run update`.
