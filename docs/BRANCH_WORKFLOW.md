# Branch and Deployment Workflow

Atlas has one source branch and two deployments. The `main` branch is the source of truth for both production and beta; beta is a Vercel environment, not a second code branch.

## Branches

- `main` is the only long-lived integration branch.
- Start short-lived feature, fix, or data branches from the latest `origin/main`.
- Open pull requests into `main`. Keep unrelated work in separate branches and worktrees.
- Do not use a long-lived `beta` branch for feature flags, UI experiments, or agency visibility. The historical `beta` branch is legacy and must not receive new work.
- `main` is protected and requires a pull request. Direct pushes and force-pushes stay disabled.

Typical start:

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c fix/short-description
```

## Beta and production

Both Vercel projects build the same `main` commit:

| Deployment | Vercel project | Environment | Beta flags |
|---|---|---|---|
| Production | `atlas` | Production | off unless deliberately graduated |
| Beta | `atlas-beta` | Production | on for approved testing |

Keep differences between the deployments in project-scoped Vercel environment variables, not source branches. `VITE_BETA_BUILD=true` labels beta builds; it is not a source-code fork.

Every pull request runs the normal build and a second build with the beta flags enabled. A green beta build proves that the same source can serve both deployments; it does not approve a feature for production.

## Feature work

1. Create an issue when the work needs a durable record.
2. Branch from current `origin/main` and add the regression test before broadening shared behavior.
3. Follow [`../FIXING_ISSUES.md`](../FIXING_ISSUES.md) and its scope-specific runbook.
4. Keep immature features behind an environment flag so beta can validate them without branch drift.
5. Update `[Unreleased]`, commit the logical change, and open a PR into `main`.
6. Merge only after CI, preview checks, and the required data/UI validation pass.

When a beta feature is ready for everyone, graduate its production environment flag in a separate, deliberate change. Do not merge a beta branch to achieve that.

## Beta-domain cutovers

When the beta deployment is changing projects or domains:

1. Deploy the candidate `main` commit to `atlas-beta`.
2. Check the protected generated deployment URL and confirm the beta flags are present.
3. Attach `beta.transitatlas.fyi` to the new beta project and verify the public hostname.
4. Check production separately, including that beta-only flags remain off.
5. Remove the hostname from the legacy project and retire the old beta branch only after both sites are confirmed.

Keep the legacy project and branch available during the cutover so the old hostname can be restored without rewriting source history.

