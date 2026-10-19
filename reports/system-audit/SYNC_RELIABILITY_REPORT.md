# ELWAZEER POS / BEBYOON SYSTEM — MULTI-BRANCH SYNCHRONIZATION & OFFLINE RELIABILITY REPORT
**Audit Date:** October 18, 2026  
**Audited Version:** 1.0.6  
**Target:** Branch-to-Master Synchronization Engine (`src/server/modules/sync/**`)  

---

## 1. Architectural Architecture & Topology

The synchronization system implements an **Autonomous Offline-First Topology**:

```
+-------------------------------------------------------------+
|                CENTRAL SERVER (Master Mode)                 |
|  - PostgreSQL 18.4 Engine                                   |
|  - Authoritative Global Catalog & Central Reporting         |
|  - Sync Endpoints:                                          |
|      * GET  /api/sync/catalog (Catalog Delta Distribution)  |
|      * POST /api/sync/pull    (Branch Mutation Ingestion)   |
|      * GET  /api/sync/status  (Health & Queue Diagnostics)  |
+-------------------------------------------------------------+
                              ▲
                              │  HTTPS / HTTP
                              │  (x-sync-key Authentication)
                              ▼
+-------------------------------------------------------------+
|               BRANCH CLIENT (Branch Mode)                   |
|  - SQLite 3 with Write-Ahead Logging (WAL) Mode             |
|  - In-Process PostgreSQL Query Translator (translatePg)     |
|  - Local Mutation Queue: sync_queue (FIFO by operation_uuid)|
|  - Background Worker: syncService.startBackgroundSyncWorker |
|  - Manual Sync UI: Header Sync Status & Instant Sync Button |
+-------------------------------------------------------------+
```

### Core Primitives:
1. **Idempotency via Universally Unique Identifiers (UUIDv4):**
   - Every entity created offline (Order, Return, Customer, Expense, Tailoring Order, Rental) is assigned an `offline_uuid` at mutation time.
   - Operations queued in `sync_queue` have unique `operation_uuid` keys.
   - Central server verifies `SELECT id FROM orders WHERE offline_uuid = $1` before inserting. If the UUID already exists, insertion is bypassed or treated as an update, preventing duplicate transactions on retries.

2. **Branch SQLite Translation Engine (`translatePgToSqlite`):**
   - Enables the exact same backend service codebase to execute seamlessly against SQLite in branch mode.
   - Rewrites `ILIKE` -> `LIKE`, `::int/::numeric` -> stripped casts, `GREATEST/LEAST` -> `MAX/MIN`, intervals -> `datetime(...)`, `json_agg` -> `json_group_array`, and Postgres advisory locks -> no-op scalar selects.

3. **Background Sync Worker (`startBackgroundSyncWorker`):**
   - Polls every 30 seconds (configurable).
   - Drains local `pending` operations in ascending order of creation.
   - Upon network timeout or HTTP 5xx error, bounded exponential backoff prevents server flooding.
   - Synchronized queue entries are retained for audit and pruned after 30 days (`SYNC_QUEUE_RETENTION_DAYS`).

---

## 2. Fault-Injection & Reliability Test Matrix

| Scenario ID | Test Scenario | Fault Injection Mechanism | System Behavior & Defense | Result |
|---|---|---|---|---|
| **SYNC-01** | Stock Deficit on Replay | Server stock reduced below offline sale quantity prior to sync replay | Master server detects deficit ($required > available$). Server sets available stock to 0 and records an automated conflict note with exact deficit quantity without failing the batch. | **PASS** |
| **SYNC-02** | Network Timeout during Sync | Simulate `SYNC_FETCH_TIMEOUT_MS` expiration | `fetchWithTimeout` aborts request via `AbortController`. Queue records `status = 'pending'`, increments `attempts`, and preserves mutation for next cycle. | **PASS** |
| **SYNC-03** | Repeated Message Delivery (Idempotency) | Replay the identical batch of 5 sales orders twice to `POST /api/sync/pull` | Master recognizes existing `offline_uuid` values. 0 duplicate records created in `orders` or `order_items`. Stock decremented exactly once. | **PASS** |
| **SYNC-04** | Rapid Sync Button Clicks | 10 concurrent requests to manual sync trigger in UI | `syncInProgress` lock flag prevents concurrent sync loops. Only 1 worker executes; subsequent clicks are ignored until complete. | **PASS** |
| **SYNC-05** | Offline App Restart with Pending Queue | Terminate application process with 20 un-synced orders in local SQLite | Orders remain stored in `orders` table and `sync_queue` table in SQLite WAL database. Upon restart, background worker resumes and syncs seamlessly. | **PASS** |
| **SYNC-06** | Server Restart Midway through Batch | Kill master database during transaction ingestion | Master wraps each operation in `db.transaction`. Partial mutations roll back completely. Branch marks operation as failed and retries on next poll. | **PASS** |
| **SYNC-07** | Clock Skew & Historical Ordering | Branch device clock lags master server by 3 hours | Transactions store branch creation timestamps (`order_date`), but master assigns canonical sequential `branch_invoice_number` via advisory locks. Reports reconcile accurately. | **PASS** |
| **SYNC-08** | Unauthorized Branch Key Injection | Branch submits `x-sync-key` with invalid token | Master returns HTTP 401 Unauthorized immediately. Zero database reads or writes executed. | **PASS** |
| **SYNC-09** | Order Update Synchronization | Branch updates payment method / splits for an existing synced order | Master locates order by `offline_uuid` and updates `paid_amount`, `cash_amount`, `bank_transfer_amount`, and `payment_splits` accurately. | **PASS** |
| **SYNC-10** | Worn Product Offline Replay | Replay offline worn product requiring unavailable stock | Deficit detected and logged cleanly without unlocked SUM overwrite or negative stock corruption. | **PASS** |

---

## 3. Supported vs Unsupported Offline Capabilities

### Fully Supported Offline Operations (Branch Mode):
- POS sales checkout (Single cash, Visa, InstaPay, Split payments, Customer debt).
- Sales invoice printing (Thermal receipts & standard A4 receipts).
- Customer creation and search (local customer registry).
- Expense recording and categorization.
- Daily cash drawer monitoring.
- Customer returns and stock restoration.
- Barcode scanning and product lookup from cached catalog.

### Intentionally Restricted / Online-Only Operations:
- Deleting global branches or warehouse reconfigurations (Admin-only).
- Modifying central user roles or system-wide settings.
- Real-time stock querying of remote branches (requires internet connectivity to fetch remote branch inventory).

---

## 4. Conclusion & Reliability Score
The offline synchronization engine demonstrates **exceptional fault tolerance**. Idempotent replay, advisory locking, and stock deficit logging guarantee that no financial transaction is lost, no inventory is double-deducted, and network interruptions do not corrupt either the branch or the central database.
