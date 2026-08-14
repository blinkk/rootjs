# Publishing Checks

Status: implemented — see `shared/publish-checks.ts` for the shared types and
helpers, `checks.run` in `core/api.ts` for the server-side runner,
`ui/hooks/usePublishChecks.tsx` for the client-side gate, and
`ui/components/PublishChecksModal/` for the UI.

## Overview

Publishing checks run a collection's registered CMS checks as a step in the
publish flow. A check configured at the `required` level halts publishing when
it fails; a check configured at the `warning` level lets publishing continue
and reports its message once the content is live.

Checks are registered globally via `cmsPlugin({checks: [...]})` and opted into
per collection, so the same check can be required for one collection and a
warning for another.

## Configuration

Register the check implementation in `root.config.ts`:

```ts
cmsPlugin({
  checks: [
    translationsCheck(),
    {
      id: 'seo-meta',
      label: 'SEO Meta',
      description: 'Verifies the doc has a meta title and description.',
      run: async (ctx) => {
        const doc = await ctx.cmsClient.getRawDoc(ctx.collectionId, ctx.slug, {
          mode: 'draft',
        });
        if (!doc?.fields?.meta?.title) {
          return {status: 'error', message: 'Missing `meta.title`.'};
        }
        return {status: 'success', message: 'All good!'};
      },
    },
  ],
});
```

Then opt a collection into the checks that gate its publish flow, in
`collections/<id>.schema.ts`:

```ts
export default schema.defineCollection({
  name: 'Pages',
  publishing: {
    checks: [
      {id: 'seo-meta', level: 'required'},
      {id: 'root-cms/translations', level: 'warning'},
    ],
  },
  fields: [...],
});
```

A bare string is shorthand for the `required` level, so
`checks: ['seo-meta']` and `checks: [{id: 'seo-meta', level: 'required'}]` are
equivalent.

Collections without a `publishing.checks` config publish exactly as before —
no checks run and no extra requests are made.

## Behavior

| Check level  | Result status | Outcome                                     |
| ------------ | ------------- | ------------------------------------------- |
| `required`   | `error`       | Publishing halts.                           |
| `required`   | `warning`     | Publishes, warning shown afterwards.        |
| `warning`    | `error`       | Publishes, downgraded to a warning.         |
| `warning`    | `warning`     | Publishes, warning shown afterwards.        |
| either       | `success`     | Publishes.                                  |

An `error` from a `warning`-level check is deliberately downgraded rather than
promoted, so the collection's configured level stays authoritative.

A check that throws is reported as an `error` result for that check alone; the
remaining checks still run and report.

Checks that a collection references but that aren't registered (a config typo,
or a check whose own `collections` allowlist excludes the collection) are
skipped rather than treated as failures, so a bad reference can't make
publishing unrecoverable for non-admins.

## Where checks run

Checks gate the interactive publish and schedule flows:

- **Docs** — `PublishDocModal`, for both "Publish now" and "Scheduled". This
  covers the doc editor and the collection list's publish action.
- **Releases** — `ReleasePage` publish, and `ScheduleReleaseModal`. A release
  runs the checks configured on each of its docs' collections, and a single
  failed required check halts the whole release.

Scheduled content is gated **at schedule time**, not when the cron fires. The
scheduled publish itself runs unchanged, so content that drifts after being
scheduled is not re-checked.

## Admin overrides

Admins (the `ADMIN` project role) get two escape hatches:

- **Skip checks** — a "Skip publishing checks" toggle in the publish and
  release UIs, which publishes without running any checks.
- **Bypass failed checks** — a "Publish anyway" action in the modal shown when
  required checks fail.

Both are admin-only. The skip flag is re-validated against the user's role
inside `usePublishChecks()`, so a stale toggle can't let a non-admin past the
checks.

## Audit trail

Publishing writes go directly to Firestore from the browser, so this gate is a
workflow guardrail rather than a security boundary. Every publish, schedule,
and release action therefore records what the checks did in its action-log
metadata under a `checks` key:

```json
{
  "docId": "Pages/index",
  "checks": {
    "passed": 2,
    "warnings": 1,
    "failed": ["Pages/index::seo-meta"],
    "bypassed": true
  }
}
```

When an admin skips checks, the metadata records `{"skipped": true}` instead.

## API

```
POST /cms/api/checks.run
{"docIds": ["Pages/index", "Pages/about"]}
```

Returns the results of every check configured on each doc's collection:

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "docId": "Pages/index",
        "checkId": "seo-meta",
        "label": "SEO Meta",
        "level": "required",
        "status": "error",
        "message": "Missing `meta.title`."
      }
    ]
  }
}
```

Checks run with a concurrency of 5, and a single request covers at most 500
docs (`TOO_MANY_DOCS` beyond that). Results are sorted by doc id and check id
so the UI order is stable.
