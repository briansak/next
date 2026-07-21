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
3. `npm run db:push` — applies any Prisma schema changes (starts Postgres briefly if needed)

**Your data is preserved:** `.env`, Settings, and database content are not reset — unless a release notes a **breaking schema change** (see below).

Restart the app after updating:

```bash
npm run next
```

## Breaking change: single-user schema (2026)

Older versions used multi-tenant tables (`Tenant`, `TenantMember`, etc.). The app is now **one user per install**. There is no automatic migration path.

If you upgraded from an older version and see Prisma errors about missing columns or `tenantId`, reset your **local** database:

```bash
npm run db:reset
```

This wipes communications and settings in the DB and re-seeds policies. Export anything you need before running it.

After reset, open `/setup` and complete the first-launch questionnaire again.

For a completely clean slate (including Docker volume):

```bash
npm run uninstall
npm run setup
```

## Manual update

```bash
git pull origin main
npm ci
npm run db:push
npm run next
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
| `.env` (auto-created DATABASE_URL) | New optional keys in `.env.example` — compare if you use legacy overrides |
| Database contents (Docker volume) | Schema changes — `db:push` handles most additions |
| Settings UI configuration | Rare breaking changes — check commit messages |
| Encrypted Webex credentials in DB | Re-run `npm run db:seed` only on fresh DBs, not for updates |

Prefer configuring via **Settings** rather than editing source, so updates stay painless.

## Merge conflicts

If you customized the codebase locally, `git pull` may conflict.

1. Commit or stash your changes: `git stash`
2. Run `npm run update`
3. Reapply your changes: `git stash pop` and resolve conflicts

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
