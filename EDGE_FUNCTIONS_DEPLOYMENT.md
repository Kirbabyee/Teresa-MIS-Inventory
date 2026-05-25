# Edge Functions Deployment Guide

## Overview
The Teresa-MIS Inventory system uses Supabase Edge Functions to handle the physical deletion of PostgreSQL tables and columns when inventory tabs and columns are deleted from the system.

## Created Edge Functions

Four Edge Functions are used by the inventory manager and should be deployed together:

### 1. drop-inventory-table
**Location:** `supabase/functions/drop-inventory-table/index.ts`

**Purpose:** Drops a physical PostgreSQL table from the database when an inventory tab is deleted.

**Requirements:**
- Admin role (account_type = 'admin' or 'superadmin')
- POST request with JSON body containing `tableName`

**Request Body:**
```json
{
  "tableName": "my_inventory_table"
}
```

**Response:**
```json
{
  "ok": true,
  "schema": "public",
  "table": "my_inventory_table",
  "dropped": true
}
```

### 2. drop-inventory-columns
**Location:** `supabase/functions/drop-inventory-columns/index.ts`

**Purpose:** Drops specific columns from a physical PostgreSQL table when template columns are removed.

**Requirements:**
- Admin role (account_type = 'admin' or 'superadmin')
- POST request with JSON body containing `tableName` and `columnNames` array

**Request Body:**
```json
{
  "tableName": "my_inventory_table",
  "columnNames": ["column1", "column2"]
}
```

### 3. create-inventory-logs-table
**Location:** `supabase/functions/create-inventory-logs-table/index.ts`

**Purpose:** Creates the per-tab history/logs table used by the inventory history views.

**Requirements:**
- Admin role (account_type = 'admin' or 'superadmin')
- POST request with JSON body containing `tableName` or `inventoryTableName`

**Request Body:**
```json
{
   "tableName": "my_inventory_table_logs",
   "inventoryTableName": "my_inventory_table"
}
```

**Response:**
```json
{
   "ok": true,
   "schema": "public",
   "table": "my_inventory_table_logs",
   "columns": []
}
```

### 4. drop-inventory-logs-table
**Location:** `supabase/functions/drop-inventory-logs-table/index.ts`

**Purpose:** Drops the per-tab history/logs table when an inventory tab is deleted.

**Requirements:**
- Admin role (account_type = 'admin' or 'superadmin')
- POST request with JSON body containing `tableName` or `inventoryTableName`

**Request Body:**
```json
{
   "tableName": "my_inventory_table_logs",
   "inventoryTableName": "my_inventory_table"
}
```

**Response:**
```json
{
   "ok": true,
   "schema": "public",
   "table": "my_inventory_table_logs",
   "dropped": true
}
```

**Response:**
```json
{
  "ok": true,
  "results": [
    { "column": "column1", "dropped": true },
    { "column": "column2", "dropped": true }
  ]
}
```

## Deployment Instructions

### Option 1: Using Supabase CLI (Recommended)

#### Prerequisites:
- Node.js and npm installed
- Supabase account with project access

#### Steps:

1. **Install Supabase CLI globally:**
   ```bash
   npm install -g supabase
   ```

2. **Login to Supabase:**
   ```bash
   supabase login
   ```

3. **Deploy the drop-inventory-table function:**
   ```bash
   supabase functions deploy drop-inventory-table --project-ref yzhgvvnchajslpcabrjn
   ```

4. **Deploy the drop-inventory-columns function:**
   ```bash
   supabase functions deploy drop-inventory-columns --project-ref yzhgvvnchajslpcabrjn
   ```

5. **Deploy the create-inventory-logs-table function:**
   ```bash
   supabase functions deploy create-inventory-logs-table --project-ref yzhgvvnchajslpcabrjn
   ```

6. **Deploy the drop-inventory-logs-table function:**
   ```bash
   supabase functions deploy drop-inventory-logs-table --project-ref yzhgvvnchajslpcabrjn
   ```

### Option 2: Using npx (If Global Install Fails)

```bash
# In the project directory
npx supabase@latest functions deploy drop-inventory-table --project-ref yzhgvvnchajslpcabrjn
npx supabase@latest functions deploy drop-inventory-columns --project-ref yzhgvvnchajslpcabrjn
npx supabase@latest functions deploy create-inventory-logs-table --project-ref yzhgvvnchajslpcabrjn
npx supabase@latest functions deploy drop-inventory-logs-table --project-ref yzhgvvnchajslpcabrjn
```

### Option 3: Using Supabase Dashboard (Manual)

1. Go to https://app.supabase.com
2. Select your project
3. Navigate to Edge Functions → Create Function
4. Name it `drop-inventory-table`
5. Copy the entire content of `supabase/functions/drop-inventory-table/index.ts`
6. Paste it into the function editor
7. Click Deploy
8. Repeat steps 3-7 for `drop-inventory-columns`
9. Repeat steps 3-7 for `create-inventory-logs-table`
10. Repeat steps 3-7 for `drop-inventory-logs-table`

## Troubleshooting

### Error: "The term 'supabase' is not recognized"
This means the Supabase CLI is not installed globally. Try:
```bash
npm install -g supabase@latest
```

Or use npx instead:
```bash
npx supabase@latest functions deploy drop-inventory-table --project-ref yzhgvvnchajslpcabrjn
```

### Error: "Cannot find POSTGRES_CONNECTION_STRING"
This is usually a warning and can be ignored if you have SUPABASE_URL and SUPABASE_ANON_KEY set.

### Error: "Failed to fetch - 404 Not Found"
The Edge Function is not deployed. Follow the deployment instructions above.

### Error: "CORS policy" when creating logs tables
This usually means `create-inventory-logs-table` has not been deployed yet, or the deployed function returned an error before sending CORS headers. Redeploy the logs functions and check the Supabase function logs.

### Error: "CORS policy"
If you see a CORS error in the browser console, the function may exist but isn't responding correctly. Check:
1. The function is deployed and running
2. The function has proper CORS headers (they are included in the code)
3. Authentication headers are being sent correctly

## Verification

After deployment, verify the functions are working:

1. **Using curl:**
   ```bash
   curl -X POST https://yzhgvvnchajslpcabrjn.supabase.co/functions/v1/drop-inventory-table \
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"tableName":"test_table"}'
   ```

2. **In the browser console:**
   When you delete an inventory tab, it should attempt to call the Edge Function. Check the Network tab in DevTools.

3. **In Supabase Dashboard:**
   Go to Functions → View Logs to see if the functions are being called.

## API Integration

The frontend automatically calls these functions when:
- **deleteInventoryTab()** is called → calls drop-inventory-table
- **Template columns are removed** → calls drop-inventory-columns (when implemented)

See `src/lib/inventoryApi.js` for the integration code:
- `callDropInventoryTable(url, tableName)`
- `callDropInventoryColumns(url, tableName, columnNames)`
- `getInventoryDropTableEndpoint()`
- `getInventoryDropColumnsEndpoint()`

## Support

If you encounter issues:
1. Check the Supabase project logs in the dashboard
2. Verify authentication is working (check JWT token in localStorage)
3. Ensure your user account has admin role
4. Check the browser console for detailed error messages
