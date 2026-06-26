#!/usr/bin/env python3
"""
Generate claude_analytics_proposal.txt — a comprehensive, self-contained
peer-review package for Gemini to evaluate, stress-test, and refine the
Analytics & Prescriptive Insights Dashboard implementation.
"""

PROPOSAL = r"""---
### [PASTE THIS SECTION DIRECTLY INTO GEMINI]

**Role:** Act as a Principal Systems Engineer, Cyber Security Auditor, and UI/UX Critic.
**Context:** I am working with an OJT team implementing a school MIS inventory system. Claude has analyzed our existing codebase and proposed the following architecture, SQL schema extensions, and React frontend structures for our **Prescriptive Analytics Engine** and **Dashboard** using our signature `#411111` brand identity.

I need you to thoroughly evaluate, stress-test, and refine Claude's proposal below. Please provide:
1. **An Edge-Case Code Audit:** Look for flaws in the SQL performance, permission issues in Supabase, dynamic table scanning gaps, or state leaks in the React code.
2. **UI/UX Polishing:** Ensure the visual breakdown matches a clean, modern dashboard aesthetic without background icon tints and adheres to a strict `p-4 md:p-6 max-w-7xl mx-auto` layout framework.
3. **Optimizations:** Provide any necessary refactorings or code replacements directly.

#### Claude's Proposed Analytics Architecture & Data-Mapping:

**Data Source → Metric Mapping:**

| Domain | Table | Fields Used | Derived Metrics |
|---|---|---|---|
| Inventory | `inventory_items` | `status`, `data` (JSONB), `section_id` | Defect rate per section, overall defect rate, category health |
| Inventory | `inventory_sections` | `id`, `name`, `tab_id` | Section-level aggregation |
| Inventory | `inventory_tabs` | `id`, `name` | Tab-level grouping |
| Borrowing | `borrowing_records` | `borrowed_at`, `returned_at`, `expected_return_at`, `status` | Compliance rate, avg duration, on-time/late breakdown, outstanding count |
| Security | `login_attempts_tracker` | `lockout_tier`, `suspended_until`, `last_ip`, `email`, `consecutive_failures` | Threat score (0-100), active lockouts, suspicious IP detection, escalation trends |
| Audit | `inventory_change_logs` | `change_ts`, `action`, `changed_by`, `new_data` | Daily change volume, off-hours detection, bulk change detection, user activity |
| Users | `borrowing_records` | `borrower_name`, `borrower_id_number`, `borrower_role` | Top borrowers leaderboard, per-user compliance score, repeat offender detection |

**Prescriptive Engine Threshold Rules:**

| Trigger | Severity | Recommendation |
|---|---|---|
| Defect rate > 15% per section | CRITICAL | Procurement: Replace aging units |
| Defect rate 10-15% | WARNING | Maintenance: Schedule preventive maintenance |
| Return compliance < 70% | CRITICAL | Policy: Review borrowing period limits |
| Avg borrow duration > 5 days | WARNING | Policy: Reduce maximum borrow period |
| Outstanding items > 10 | WARNING | Policy: Follow up with borrowers |
| Threat score >= 70 | CRITICAL | Security: Immediate action required |
| Same IP > 3 accounts | CRITICAL | Security: Consider IP blocking |
| User > 3 late returns | WARNING | Training: Schedule policy review |
| Utilization > 80% | INFO | Optimization: Expand inventory |
| Off-hours changes > 10 | WARNING | Audit: Verify authorized activity |
| Bulk changes > 100/day | WARNING | Audit: Verify authorized activity |

#### Claude's Proposed PostgreSQL / Supabase RPC Queries:

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- QUERY 1: Defect Rate by Section (uses existing inventory_items + joins)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  s.id AS section_id,
  s.name AS section_name,
  t.name AS tab_name,
  COUNT(*) AS total_items,
  COUNT(*) FILTER (
    WHERE i.status ILIKE '%defect%'
    OR i.data::text ILIKE '%defect%'
  ) AS defective_items,
  ROUND(
    COUNT(*) FILTER (
      WHERE i.status ILIKE '%defect%'
      OR i.data::text ILIKE '%defect%'
    )::numeric / NULLIF(COUNT(*), 0) * 100, 2
  ) AS defect_rate
FROM inventory_items i
JOIN inventory_sections s ON i.section_id = s.id
JOIN inventory_tabs t ON s.tab_id = t.id
GROUP BY s.id, s.name, t.name
ORDER BY defect_rate DESC;


-- ═══════════════════════════════════════════════════════════════════════════
-- QUERY 2: Borrowing Compliance & Average Duration (borrowing_records)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  COUNT(*) AS total_transactions,
  AVG(
    EXTRACT(EPOCH FROM (returned_at - borrowed_at)) / 86400
  ) FILTER (WHERE returned_at IS NOT NULL) AS avg_borrow_days,
  COUNT(*) FILTER (WHERE status = 'returned') AS on_time_returns,
  COUNT(*) FILTER (WHERE status = 'returned_late') AS late_returns,
  COUNT(*) FILTER (WHERE status IN ('borrowed', 'not_returned')) AS outstanding,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'returned')::numeric /
    NULLIF(COUNT(*) FILTER (WHERE status IN ('returned', 'returned_late')), 0) * 100, 2
  ) AS compliance_rate
FROM borrowing_records
WHERE borrowed_at >= NOW() - INTERVAL '30 days';


-- ═══════════════════════════════════════════════════════════════════════════
-- QUERY 3: Security Threat Assessment (login_attempts_tracker)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  COUNT(*) FILTER (WHERE suspended_until > NOW()) AS active_lockouts,
  COUNT(*) FILTER (WHERE lockout_tier >= 3 AND suspended_until > NOW()) AS high_severity,
  COUNT(*) FILTER (WHERE lockout_tier >= 5) AS permanent_bans,
  COUNT(DISTINCT email) FILTER (WHERE suspended_until > NOW()) AS unique_targets,
  COUNT(DISTINCT last_ip) FILTER (WHERE suspended_until > NOW()) AS unique_ips
FROM login_attempts_tracker;


-- ═══════════════════════════════════════════════════════════════════════════
-- QUERY 4: Suspicious IP Detection (brute-force pattern)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  last_ip,
  COUNT(DISTINCT email) AS targeted_accounts,
  COUNT(*) AS total_attempts,
  MAX(consecutive_failures) AS max_failures
FROM login_attempts_tracker
WHERE updated_at >= NOW() - INTERVAL '24 hours'
  AND last_ip IS NOT NULL
GROUP BY last_ip
HAVING COUNT(DISTINCT email) > 1
ORDER BY targeted_accounts DESC;


-- ═══════════════════════════════════════════════════════════════════════════
-- QUERY 5: Top Borrowers with Compliance Scores
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  br.borrower_name,
  br.borrower_id_number,
  br.borrower_role,
  COUNT(DISTINCT br.id) AS total_borrows,
  COUNT(*) FILTER (WHERE br.status = 'returned') AS on_time,
  COUNT(*) FILTER (WHERE br.status = 'returned_late') AS late,
  COUNT(*) FILTER (WHERE br.status IN ('borrowed', 'not_returned')) AS outstanding,
  ROUND(
    COUNT(*) FILTER (WHERE br.status = 'returned')::numeric /
    NULLIF(COUNT(*) FILTER (WHERE br.status IN ('returned', 'returned_late')), 0) * 100, 2
  ) AS compliance_rate
FROM borrowing_records br
WHERE br.borrowed_at >= NOW() - INTERVAL '90 days'
GROUP BY br.borrower_name, br.borrower_id_number, br.borrower_role
ORDER BY total_borrows DESC
LIMIT 20;


-- ═══════════════════════════════════════════════════════════════════════════
-- QUERY 6: Off-Hours Audit Anomaly Detection
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  change_ts,
  table_name,
  action,
  changed_by,
  EXTRACT(HOUR FROM change_ts) AS change_hour,
  EXTRACT(DOW FROM change_ts) AS day_of_week
FROM inventory_change_logs
WHERE change_ts >= NOW() - INTERVAL '7 days'
  AND (
    EXTRACT(HOUR FROM change_ts) < 8
    OR EXTRACT(HOUR FROM change_ts) > 18
    OR EXTRACT(DOW FROM change_ts) IN (0, 6)
  )
ORDER BY change_ts DESC
LIMIT 50;


-- ═══════════════════════════════════════════════════════════════════════════
-- QUERY 7: Defect Rate Trend (time-series for charting)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  DATE(change_ts) AS change_date,
  COUNT(*) AS total_changes,
  COUNT(*) FILTER (
    WHERE new_data::text ILIKE '%defect%'
  ) AS defect_changes,
  ROUND(
    COUNT(*) FILTER (WHERE new_data::text ILIKE '%defect%')::numeric /
    NULLIF(COUNT(*), 0) * 100, 2
  ) AS defect_rate
FROM inventory_change_logs
WHERE change_ts >= NOW() - INTERVAL '30 days'
GROUP BY DATE(change_ts)
ORDER BY change_date ASC;


-- ═══════════════════════════════════════════════════════════════════════════
-- QUERY 8: Inventory Utilization (borrowed vs available per section)
-- ═══════════════════════════════════════════════════════════════════════════
WITH section_items AS (
  SELECT
    i.section_id,
    COUNT(*) AS total,
    COUNT(*) FILTER (
      WHERE i.status ILIKE '%defect%'
      OR i.data::text ILIKE '%defect%'
    ) AS defective
  FROM inventory_items i
  GROUP BY i.section_id
),
active_borrows AS (
  SELECT
    bi.inventory_section_id,
    COUNT(*) AS borrowed_count
  FROM borrowing_records br
  JOIN borrowing_items bi ON br.id = bi.borrowing_record_id
  WHERE br.status IN ('borrowed', 'not_returned')
  GROUP BY bi.inventory_section_id
)
SELECT
  s.name AS section_name,
  t.name AS tab_name,
  si.total,
  si.defective,
  si.total - si.defective AS available,
  COALESCE(ab.borrowed_count, 0) AS borrowed,
  ROUND(
    COALESCE(ab.borrowed_count, 0)::numeric /
    NULLIF(si.total - si.defective, 0) * 100, 2
  ) AS utilization_rate
FROM section_items si
JOIN inventory_sections s ON si.section_id = s.id
JOIN inventory_tabs t ON s.tab_id = t.id
LEFT JOIN active_borrows ab ON si.section_id = ab.inventory_section_id
ORDER BY utilization_rate DESC;
```

#### Claude's Proposed React Component Architecture:

```
src/
├── pages/
│   └── AnalyticsDashboard.jsx          # Main page: header, stat cards, charts, insights, tables
├── components/
│   └── analytics/
│       ├── AnalyticsStatCard.jsx       # Reusable stat card (icon, label, value, sparkline, change)
│       ├── InsightCard.jsx             # Single prescriptive insight (severity, message, action)
│       ├── InsightPanel.jsx            # Filterable container (All/Critical/Warning/Info tabs)
│       ├── TimeRangeSelector.jsx       # 7D/30D/90D/All toggle
│       └── charts/
│           ├── DefectRateTrendChart.jsx       # LineChart with 15% warning threshold
│           ├── BorrowingComplianceChart.jsx   # Stacked horizontal bar chart
│           ├── SecurityThreatChart.jsx        # Horizontal bar chart by severity
│           └── AuditActivityChart.jsx         # AreaChart of daily changes
├── lib/
│   ├── analyticsApi.js                 # 7 Supabase fetch functions
│   └── prescriptiveEngine.js           # Pure-function threshold rule engine
└── hooks/
    ├── useAnalytics.js                 # Master data hook (Promise.allSettled)
    └── usePrescriptiveInsights.js      # Memoized insight derivation
```

#### Claude's Proposed UI Layout (AnalyticsDashboard.jsx):

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Analytics & Insights                    [Refresh] [7D|30D|90D|All]    │
├─────────────────────────────────────────────────────────────────────────┤
│  [Critical Alert Banner — shown only when criticalCount > 0]           │
├──────────┬──────────┬──────────┬──────────┬──────────┬────────────────┤
│ Defect   │ Return   │ Avg      │ Threat   │ Avg      │ Top Borrower   │
│ Rate     │ Compli-  │ Duration │ Level    │ Util.    │ + Offenders    │
│ (spark)  │ ance     │ (days)   │ (icon)   │ (%)      │ Count          │
├──────────┴──────────┴──────────┴──────────┴──────────┴────────────────┤
│  Defect Rate Trend (Line)    │  Borrowing Return Breakdown (Bar)      │
│  [15% warning ref line]      │  [On Time / Late / Outstanding]        │
├──────────────────────────────┼────────────────────────────────────────┤
│  Security Threat (Bar)       │  Audit Activity (Area)                 │
│  [Active/High/Permanent]      │  [Daily change volume]                 │
├──────────────────────────────┴────────────────────────────────────────┤
│  Prescriptive Insights Panel                                          │
│  [All (n)] [Critical (n)] [Warning (n)] [Info (n)]                   │
│  ┌─ [CRITICAL] High Defect Rate: Section X has Y% defect rate ──────┐│
│  │  Action: View Section                                     [X]    ││
│  └────────────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────────────┤
│  Top Borrowers (Table)       │  Defect Rate by Section (Table)        │
│  Name | Role | Borrows | %   │  Section | Tab | Total | Def | Rate   │
├──────────────────────────────┴────────────────────────────────────────┤
│  Audit Anomalies (shown only when offHoursCount > 0)                  │
│  [ACTION] TableName by User @ Timestamp                               │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Claude's Proposed Data Flow:

```
User visits /analytics (admin-only route guard)
  │
  ├─ useAnalytics(timeRange) hook fires
  │   ├─ fetchDefectRateBySection()         → inventory_items + joins
  │   ├─ fetchBorrowingCompliance(days)      → borrowing_records
  │   ├─ fetchSecurityThreatAssessment()     → login_attempts_tracker
  │   ├─ fetchTopBorrowers(90)              → borrowing_records
  │   ├─ fetchAuditAnomalies(days)           → inventory_change_logs
  │   ├─ fetchDefectRateTrend(days)          → inventory_change_logs
  │   └─ fetchInventoryUtilization()        → 3 parallel queries
  │
  ├─ usePrescriptiveInsights(analyticsData) hook
  │   └─ generateInsights(data) → sorted by severity
  │
  └─ Render: Stat Cards → Charts → Insights Panel → Tables → Anomalies
```

#### Claude's Key Design Decisions:

1. **All data from existing tables** — No schema changes, no new columns, no migrations needed
2. **Client-side aggregation** — Supabase returns raw rows; JavaScript computes metrics (avoids complex SQL functions, works with RLS)
3. **Promise.allSettled** — Partial data renders even if one query fails
4. **Pure-function prescriptive engine** — `generateInsights(data)` is deterministic and testable
5. **Brand-matched UI** — `#411111` primary, `rounded-xl bg-white shadow-sm border-slate-200/80` cards
6. **Admin-only route guard** — `SecurityRoute requiredRole="admin"` matches existing Security/SystemSettings pattern
7. **Time range selector** — 7D/30D/90D/All, defaults to 30D, refetches on change

#### Claude's Identified Risk Areas (self-audit):

1. **Dynamic inventory tables not scanned** — `analyticsApi.js` only queries the legacy `inventory_items` table. Dynamic tables created via Edge Functions (e.g., `inventory_computing_devices`) are NOT included in defect rate calculations. This means newer inventory sections may show 0% defect rate even if they have defective items.
2. **login_attempts_tracker RLS** — This is the ONLY table with RLS enabled (service_role policy). The `fetchSecurityThreatAssessment()` function uses the anon key via `supabase.from("login_attempts_tracker").select("*")` which WILL FAIL at the RLS level unless the service role key is used.
3. **Off-hours timezone** — `getUTCHours()` is used for off-hours detection, but the school is likely in UTC+8 (Philippines). 8am local = 0am UTC, so the logic is correct for UTC storage but the "business hours" label is misleading.
4. **Compliance rate edge case** — When there are 0 completed returns (all outstanding), compliance defaults to 100%. This may mislead admins into thinking compliance is fine when actually there's no data.
5. **N+1 in utilization** — `fetchInventoryUtilization()` fetches ALL items across ALL sections in a single query, then filters client-side. This is fine for small datasets but could be slow with 10,000+ items.

#### Files Created/Modified:

**Created (12 files):**
- `src/lib/analyticsApi.js` — 7 Supabase data-fetching functions
- `src/lib/prescriptiveEngine.js` — Threshold-based recommendation engine
- `src/hooks/useAnalytics.js` — Master data hook
- `src/hooks/usePrescriptiveInsights.js` — Insights derivation hook
- `src/components/analytics/AnalyticsStatCard.jsx` — Reusable stat card
- `src/components/analytics/InsightCard.jsx` — Single insight display
- `src/components/analytics/InsightPanel.jsx` — Filterable insights container
- `src/components/analytics/TimeRangeSelector.jsx` — Date range toggle
- `src/components/analytics/charts/DefectRateTrendChart.jsx`
- `src/components/analytics/charts/BorrowingComplianceChart.jsx`
- `src/components/analytics/charts/SecurityThreatChart.jsx`
- `src/components/analytics/charts/AuditActivityChart.jsx`
- `src/pages/AnalyticsDashboard.jsx` — Main dashboard page

**Modified (2 files):**
- `src/App.jsx` — Added import + `/analytics` route with SecurityRoute guard
- `src/components/Layout.jsx` — Added BarChart3 import + "Analytics" nav item

---

**End of Claude's Proposal — Begin your evaluation below.**
"""

output_path = r"C:\Users\leele\OneDrive\Desktop\Ark\ST TERESA MIS\Teresa-MIS-Inventory\claude_analytics_proposal.txt"

with open(output_path, "w", encoding="utf-8") as f:
    f.write(PROPOSAL)

print(f"Proposal written to: {output_path}")
print(f"Size: {len(PROPOSAL)} characters")
