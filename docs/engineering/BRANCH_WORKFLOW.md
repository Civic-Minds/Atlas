# Branch and deployment workflow

Atlas has one source branch and three deployments. The `main` branch is the source of truth for Public, Preview, and Beta; deployment mode is a Vercel environment setting, not a code branch.

## Branches

- `main` is the only long-lived integration branch.
- Start short-lived feature, fix, or data branches from the latest `origin/main`.
- Open pull requests into `main`. Keep unrelated work in separate branches and worktrees.
- Do not use a long-lived `beta` branch for feature flags, UI experiments, or agency visibility. The historical `beta` branch is legacy and must not receive new work.
- `main` branch protection blocks force-pushes and deletion. It does not enforce a required review or status check, so opening a pull request and waiting for the `Type Check · Test · Build` CI check is the working rule rather than a GitHub setting.

Typical start:

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c fix/short-description
```

## Deployments

All Vercel projects build the same `main` commit:

| Deployment | Mode | Update policy | Purpose |
|---|---|---|---|
| Public | `public` | Automatic from `main` | Public site |
| Preview | `preview` | Automatic from `main` | Stable outreach/demo link for agencies |
| Beta | `beta` | Manual promotion from `main` | Experimental feature validation |

The 2026-09-28 topology check in [`../FEATURE_FLAGS.md`](../FEATURE_FLAGS.md#verified-deployment-topology) found Preview attached to the `atlas-beta` Vercel project, so it shares Beta's configuration rather than running as an independently configured `preview` deployment. Re-verify before relying on the Preview row above.

Keep differences between the deployments in project-scoped Vercel environment variables, not source branches. `VITE_ATLAS_MODE` is the source of truth; legacy `VITE_BETA_BUILD` and `VITE_PREVIEW_BUILD` values are compatibility fallbacks only.

CI runs on every pull request into `main` and every push to `main`: the normal build plus a second build with the beta flags enabled. A green beta build proves that the same source can serve both deployments; it does not approve a feature for production.

## Feature work

1. Create an issue when the work needs a durable record.
2. Branch from current `origin/main` and add the regression test before broadening shared behavior.
3. Follow [`FIXING_ISSUES.md`](FIXING_ISSUES.md) and its scope-specific runbook.
4. Keep immature features behind an environment flag so beta can validate them without branch drift.
5. Update `[Unreleased]`, commit the logical change, and open a PR into `main`.
6. Merge only after CI, preview checks, and the required data/UI validation pass.

## Deployment verification

Run `npm run verify:deployments` after a deployment change or when a hosted site appears stale. It checks that each hostname serves its app shell and the matching mode-specific catalog rather than falling back to the single-page app's `index.html`. It does not prove which mode a hostname was built with. The check accepts `ATLAS_PUBLIC_URL`, `ATLAS_PREVIEW_URL`, and `ATLAS_BETA_URL` overrides for protected or temporary hostnames.

For Preview, also open the outreach URL and verify the current on-demand demo manually. The catalog check catches stale builds; the browser check confirms the map overlay and route interactions.

When a beta feature is ready for everyone, graduate its production environment flag in a separate, deliberate change. Do not merge a beta branch to achieve that.

## Beta-domain cutovers

When the beta deployment is changing projects or domains:

1. Deploy the candidate `main` commit to `atlas-beta`.
2. Check the protected generated deployment URL and confirm the beta flags are present.
3. Attach `beta.transitatlas.fyi` to the new beta project and verify the public hostname.
4. Check production separately, including that beta-only flags remain off.
5. Remove the hostname from the legacy project and retire the old beta branch only after both sites are confirmed.

Keep the legacy project and branch available during the cutover so the old hostname can be restored without rewriting source history.
