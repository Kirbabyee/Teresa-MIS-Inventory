# create-inventory-table Edge Function

This Edge Function creates or updates a physical inventory table in Supabase from a list of columns.

## What it does
- Verifies the request has a valid Supabase user session.
- Requires the user to have `role = "admin"` in `user_metadata` or `app_metadata`.
- Connects to Postgres using `SUPABASE_DB_URL`.
- Runs `CREATE TABLE IF NOT EXISTS`.
- Runs `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for each custom column.

## Required secrets
Set these in Supabase before deploying:

```bash
supabase secrets set SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
supabase secrets set SUPABASE_ANON_KEY="YOUR_ANON_KEY"
supabase secrets set DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres"
```

## Deploy
From the repo root:

```bash
supabase functions deploy create-inventory-table --project-ref YOUR_PROJECT_REF
```

Make sure `verify_jwt = false` is set for browser preflight support in `supabase/config.toml`:

```toml
[functions.create-inventory-table]
verify_jwt = false
```

If you want to test locally first:

```bash
supabase functions serve create-inventory-table --env-file supabase/.env.local
```

## Request shape

```json
{
  "tableName": "inventory_laboratory",
  "schemaName": "public",
  "columns": [
    { "key": "computer_number", "type": "int" },
    { "key": "serial_number", "type": "text" },
    { "key": "condition", "type": "text" }
  ]
}
```

## Notes
- Custom headers/columns are best handled by `inventory_tab_columns` plus `inventory_items.data`.
- Use this function only when you truly want a physical table per tab.
- Keep the function URL in `inventory_settings` under `inventory.create_table_endpoint` so the app can call it without hardcoding it.
