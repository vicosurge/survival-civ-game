## First-time setup

1. `npm install`
2. `wrangler d1 create cambrera-feedback`
3. `wrangler d1 execute cambrera-feedback --file=schema.sql --remote`
4. `wrangler secret put DASHBOARD_KEY`
5. `wrangler deploy`

## Migrating an existing deployment to the chronicle column

If the D1 database predates the `chronicle` column, add it once:

```
wrangler d1 execute cambrera-feedback --remote \
  --command "ALTER TABLE feedback ADD COLUMN chronicle TEXT"
```

Then redeploy: `wrangler deploy`.
