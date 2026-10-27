# Public-submission moderation

The iOS release adds submission-policy consent, server-side rejection of obvious profanity/contact details/advertising links, content reporting and local contributor blocking. Filtering is deliberately not described as comprehensive. Public contributor IDs are a separate domain-separated hash, never the deletion token or its stored owner hash. Reports contain a reason enum, point ID, anonymous reporter hash and timestamp; they are not public.

## Operator duty before and after launch

Review reports regularly and act promptly. A public support contact must be supplied by the owner before Store submission; no contact or guaranteed response SLA is fabricated here. Local blocking hides all points from a contributor, survives restart, and can be reset from the results list. It does not erase server records.

Use the existing authenticated Wrangler/D1 tooling from this folder. Read first:

```
npx wrangler d1 execute share-water-community --remote --command "SELECT r.point_id,r.reason,r.created_at,w.title,w.detail FROM water_reports r LEFT JOIN water_points w ON w.id=r.point_id ORDER BY r.created_at"
```

Inspect the exact reported ID. Remove objectionable content only after operator review:

```
npx wrangler d1 execute share-water-community --remote --command "DELETE FROM water_points WHERE id='<reviewed-point-id>'"
```

Block repeated abusive contributors using the private owner hash already retained on the reviewed point (execute before removing the point):

```
npx wrangler d1 execute share-water-community --remote --command "INSERT OR IGNORE INTO blocked_contributors(owner_hash) SELECT owner_hash FROM water_points WHERE id='<reviewed-point-id>'"
```

Blocked contributors cannot post again and their existing points are omitted from list responses. Their deletion capability remains valid. Report records remain for operator handling; delete resolved reports when no longer needed. Do not expose owner/reporter hashes or database exports publicly.

## Rollback

Pre-change Worker deployment: `878e8cb9-7882-422e-bbd1-e596ea13d5c6`.
Database SQL backup is in the ignored release package `community-before-moderation.sql` with mode0600. Tables were added without changing existing water_points or ownership. Prefer Worker rollback with additive tables retained; do not restore the entire database over newer user data. The original web OTA/native rollback checkpoint is unchanged.
