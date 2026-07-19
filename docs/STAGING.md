# Staging R2 (dress rehearsal)

Shared **non-production** bucket for full pipeline + app rehearsals before prod writes.

| | |
|--|--|
| Bucket | `atlas-staging` |
| Public URL | `https://pub-5f1c48f86b024c42a8d174a4a5dd69ca.r2.dev` |
| Env file | `.env.staging` (gitignored; symlink from main Atlas) |

## Commands

```bash
export ATLAS_ENV=staging

npm run process:staging -- <feed> <slug> "Name" "lat,lon"
npm run refresh:staging -- <slug> --force
npm run build-pmtiles:staging
npm run dev:staging
```

Country-launch hard gate **does not apply** to non-`atlas` buckets.

## Prod vs staging

| | Prod | Staging |
|--|------|---------|
| Bucket | `atlas` | `atlas-staging` |
| Env | `.env.local` / default | `ATLAS_ENV=staging` |
| Launch gate | On for FR/MX/… | Off |

Do not point staging env at the production bucket.

