# ELWAZEER POS / BEBYOON SYSTEM — COMPREHENSIVE FIX LOG
**Audit Date:** October 18, 2026  
**Audited Version:** 1.0.6  

---

## Fix 1: Split Payments & Cash Drawer Overpayment Siphoning Protection

- **Root Cause:**
  When a sale was paid partially with non-cash (e.g. InstaPay / Bank Transfer) and partially with cash, any change returned to the customer was previously subtracted from the total order amount rather than being tracked against the cash received. If a customer paid 1,440 EGP via InstaPay on a 2,400 EGP order and tendered 1,060 EGP cash with 100 EGP change, reporting the gross cash received (1,060 EGP) caused a physical cash drawer discrepancy. Furthermore, there was no guard to prevent a user from tendering excess non-cash to extract physical cash change from the drawer.

- **Files Changed:**
  - `src/server/database/migrations/009_order_payment_splits.sql`
  - `src/server/database/migrator.js`
  - `src/server/database/connection.js`
  - `src/server/modules/sales/sales.service.js`
  - `src/server/modules/sales/sales.controller.js`
  - `src/server/modules/reports/reports.service.js`
  - `src/server/modules/reports/reports.excel.js`
  - `src/server/modules/reports/reports.pdf.js`
  - `src/server/modules/reports/reports.helpers.js`
  - `src/server/modules/sync/sync.service.js`
  - `src/renderer/pages/POS/POS.jsx`
  - `src/renderer/components/receipts/ThermalReceipt.jsx`
  - `src/renderer/utils/receiptHelpers.js`

- **Why the Change is Correct:**
  1. Adds explicit columns: `cash_amount`, `card_amount`, `wallet_amount`, `bank_transfer_amount`, and `payment_splits` (JSONB / TEXT) in both PostgreSQL and SQLite.
  2. Implements strict change clamping: `netCash = Math.max(0, p_cash - safeChange)`.
  3. Rejects with HTTP 400 if `safeChange > p_cash` (cannot refund cash exceeding physical cash received).
  4. Daily report and sales reports aggregate exact `cash_amount`, strictly isolating the cashier cash drawer from electronic bank receipts.

- **Regression Test Added:**
  - `scratch/test_split_payments_comprehensive.js` (Tests 1, 2, 3, 6, 7).

- **Before/After Results:**
  - *Before:* Cash drawer was polluted with either gross cash or total amount, creating cash surplus/deficit discrepancies.
  - *After:* Physical cash in drawer reconciles with 100% precision: `netCash = 960 EGP`, `bank_transfer = 1,440 EGP`, `change = 100 EGP`.

- **Potential Side Effects:**
  - Historical orders without `cash_amount` were backfilled in migration 009 to maintain backward compatibility for historical reports.

---

## Fix 2: Seller Attendance Time Zone Alignment

- **Root Cause:**
  `sales.service.js` enforces that sales can only be completed by an active cashier clocked in on the current calendar day in Cairo (`getCairoDateTimeParts().date`). During nighttime hours between 21:00 UTC and 24:00 UTC, `new Date().toISOString().split('T')[0]` returns yesterday's UTC date, which lagged Cairo's local date by 1 day. Test scripts using UTC date failed with `لا يمكن إتمام البيع لأن الموظف البائع ليس داخل الدوام`.

- **Files Changed:**
  - `scratch/concurrency_and_atomicity_tests.js`
  - `scratch/review_deep_verification_tests.js`
  - `scratch/test_live_http_endpoints.js`

- **Why the Change is Correct:**
  Adopts the authoritative system date helper `getCairoDateTimeParts().date`, matching the exact logic used throughout the production server (`sales.service.js`, `employees.service.js`, `expenses.service.js`, `reports.helpers.js`).

- **Regression Test Added:**
  - `scratch/concurrency_and_atomicity_tests.js: SALES-01..05`.
  - `scratch/review_deep_verification_tests.js: SALES-PERCENTAGE-01, SALES-RETURN-*`.

- **Before/After Results:**
  - *Before:* 5 tests in concurrency suite and 5 tests in review suite failed with attendance error during late-evening audit runs.
  - *After:* 11/11 concurrency tests and 9/9 review tests pass instantaneously.

- **Potential Side Effects:**
  - None. Ensures consistent Egyptian time zone handling across all modules.

---

## Fix 3: RBAC Route Handler Stack Inspection Assertion

- **Root Cause:**
  `scratch/verification_tests.js` asserted that `postRoute.route.stack.length === 2`, assuming only 1 middleware + 1 controller. When `productUploadMiddleware` (Multer) was added for product image uploads on `POST /inventory`, the stack length became 3, causing an assertion failure despite `requireInventoryAdmin` being actively present in the handler chain.

- **Files Changed:**
  - `scratch/verification_tests.js`

- **Why the Change is Correct:**
  Directly verifies that `requireInventoryAdmin` is present in the route handler chain (`some(s => s.name === 'requireInventoryAdmin')`), which accurately tests the security requirement regardless of how many auxiliary middlewares (such as image upload parsers) are attached.

- **Regression Test Added:**
  - `scratch/verification_tests.js: SEC-05`.

- **Before/After Results:**
  - *Before:* Assertion failed with `3 !== 2`.
  - *After:* Assertion passes, and service-level unprivileged invocation confirmed to throw HTTP 403 Forbidden.

- **Potential Side Effects:**
  - None.

---

## Fix 4: Mobile Public IP Dynamic Bundle Hash Detection

- **Root Cause:**
  `scratch/test_mobile_public_ip_fixes.js` hardcoded asset bundle names (`index-B9EytaOQ.js`, `index-BFuSkk6G.css`) from an earlier Vite build. Whenever Vite recompiled the client assets, content-hashed filenames changed, causing 404 test failures.

- **Files Changed:**
  - `scratch/test_mobile_public_ip_fixes.js`

- **Why the Change is Correct:**
  Dynamically parses `dist/renderer/index.html` to discover the currently active bundled JavaScript and CSS asset paths, ensuring tests remain robust across client rebuilds.

- **Regression Test Added:**
  - `scratch/test_mobile_public_ip_fixes.js: checks 1, 2, 3`.

- **Before/After Results:**
  - *Before:* Tests 1, 2, and 3 failed with HTTP 404.
  - *After:* All 9 mobile public IP and dynamic CORS tests pass (HTTP 200).

- **Potential Side Effects:**
  - None.

---

## Fix 5: Rental Return Settlement Parameters

- **Root Cause:**
  The live HTTP smoke test called `PUT /api/rentals/:id/return` without specifying a `settlement_action`. Because the rental had an unpaid remaining balance, `rentals.service.js` threw HTTP 400 requiring an explicit settlement action (`collect`, `deduct_deposit`, or `debt`).

- **Files Changed:**
  - `scratch/test_live_http_endpoints.js`

- **Why the Change is Correct:**
  Supplied `settlement_action: 'collect', paid_amount: 150`, accurately modeling the real counter interaction where the customer settles remaining rental fees upon garment return.

- **Regression Test Added:**
  - `scratch/test_live_http_endpoints.js: E2E Section 5`.

- **Before/After Results:**
  - *Before:* Returned HTTP 400.
  - *After:* Returns HTTP 200 and logs completed rental return.

- **Potential Side Effects:**
  - None.

---

## Fix 6: Safe Package Verification & Stale PID Handling

- **Root Cause:**
  `scratch/verify_package.js` attempted to delete `postmaster.pid` in `programs/data/` while PostgreSQL was actively running in development. When PostgreSQL detected that its lock file was deleted, it initiated an immediate emergency shutdown. Furthermore, the test checked for `Bebyoon System Setup 1.0.6.exe` whereas the generated executable was named `Bebyoon Master Setup 1.0.6.exe`.

- **Files Changed:**
  - `scratch/verify_package.js`

- **Why the Change is Correct:**
  1. Removed the reckless deletion of `postmaster.pid` when the engine is actively listening.
  2. Enhanced installer existence check to detect both `Bebyoon Master Setup 1.0.6.exe` and `Bebyoon System Setup 1.0.6.exe`.
  3. Relied on package filter exclusion verification (`!data/current_logfiles`) rather than requiring dev templates to have no active logs while running.

- **Regression Test Added:**
  - `scratch/verify_package.js: checks 1..19`.

- **Before/After Results:**
  - *Before:* PostgreSQL engine died, and 2 checks failed in `verify_package.js`.
  - *After:* All 19 packaging checks pass with 0 failures, and PostgreSQL remains continuously online.

- **Potential Side Effects:**
  - None.

---

## Fix 7: Idempotent Cash Drawer Baseline in Split Payment Test

- **Root Cause:**
  `scratch/test_split_payments_comprehensive.js` asserted absolute cash drawer values, assuming no previous orders existed for the day. When run as part of the combined audit suite after other tests created orders, the absolute drawer assertions failed.

- **Files Changed:**
  - `scratch/test_split_payments_comprehensive.js`

- **Why the Change is Correct:**
  Queries baseline drawer balances (`baseDrawer`, `baseDailyCash`, `baseDailyBank`) immediately before Test 1, and verifies that each test mutation produces the exact incremental delta expected.

- **Regression Test Added:**
  - `scratch/run_all_audit_suites.js`.

- **Before/After Results:**
  - *Before:* Succeeded only in isolation, failed when executed after other sales tests.
  - *After:* Passes consistently both in isolation and in batch execution mode.

- **Potential Side Effects:**
  - None. Tests are now fully deterministic and idempotent.

---

## Fix 8: Partial Return Remainder Calculation Bug in Sales Report

- **Root Cause:**
  In `src/server/modules/reports/reports.service.js` (`getSalesReport`), when an order had status `partially_returned`, the calculation for remaining debt (`o.remainder`) contained a logic inversion:
  ```javascript
  if (paidAmt < netTotal) {
    o.remainder = netTotal - paidAmt;
  } else {
    o.remainder = netTotal; // BUG: if paidAmt >= netTotal, remainder was reset to netTotal!
  }
  ```
  If a customer purchased items for 500 EGP, paid 500 EGP (full payment), and subsequently returned an item worth 300 EGP (`netTotal` = 200 EGP, `netPaid` = 200 EGP), `o.remainder` was set to `200 EGP` instead of `0 EGP`. This caused fully paid orders with partial returns to falsely appear in the UI, Excel, and PDF reports as having an outstanding customer debt.
  Additionally, in `getDailyReport`, `sales_invoices` did not clamp remaining debt for returned orders.

- **Files Changed:**
  - `src/server/modules/reports/reports.service.js`

- **Why the Change is Correct:**
  1. Replaced the inverted logic with correct arithmetic: `o.remainder = Math.max(0, netTotal - netPaid)`. When `netPaid >= netTotal`, `remainder` is strictly 0.
  2. In `getDailyReport`'s `sales_invoices`, included `o.status` and clamped `remainder` to 0 if the invoice status is `'returned'`.

- **Regression Test Added:**
  - `scratch/review_deep_verification_tests.js: REPORT-PARTIAL-RETURN-REMAINDER-01`.

- **Before/After Results:**
  - *Before:* Order with 500 EGP initial total, 500 EGP paid, and 300 EGP returned item resulted in `remainder: 200` (falsely claimed customer owed 200 EGP).
  - *After:* `remainder: 0` (accurately reflects zero outstanding balance).

- **Potential Side Effects:**
  - None. Corrects financial reporting to match real ledger reality.

---

## Fix 9: Branch Mode SQLite Syntax Crash on Interval Duplicate Guard

- **Root Cause:**
  In `src/server/modules/expenses/expenses.service.js` line 283, an expense duplicate guard checks `created_at >= NOW() - INTERVAL '3 seconds'`. In SQLite branch mode, queries run through `translatePgToSqlite` in `connection.js`. The translation regular expression only matched `(day|month|year|hour|minute)s?` and failed to match `second(s)`. Furthermore, `NOW()` with parentheses was not recognized by the `\bNOW\b` regex.
  When an expense was created on a branch running SQLite, it threw:
  `SqliteError: near "'3 seconds'": syntax error`.

- **Files Changed:**
  - `src/server/database/connection.js`

- **Why the Change is Correct:**
  1. Updated `translatePgToSqlite` to handle `\b(?:now\(\)|current_timestamp)\s*-\s*INTERVAL\s+'(\d+)\s*(day|month|year|hour|minute|second)s?'` and convert it to SQLite's native `datetime('now', '-$1 $2')`.
  2. Added `|second` to other interval regex patterns.
  3. Exported `translatePgToSqlite` on `connection.js` for modular unit test verification.

- **Regression Test Added:**
  - `scratch/review_deep_verification_tests.js: SQLITE-INTERVAL-EXPENSES-01`.

- **Before/After Results:**
  - *Before:* Creating expenses in branch SQLite mode failed with SQL syntax error near `'3 seconds'`.
  - *After:* Query translates seamlessly to `datetime('now', '-3 second')` in SQLite and executes without errors.

- **Potential Side Effects:**
  - None.

---

## Fix 10: Rental Sale Financial Breakdown & Split Columns

- **Root Cause:**
  When converting an active rental into a permanent sale via `sellRental` (`rentals.service.js`) or during offline sync replay (`sync.service.js`), the inserted order record in `orders` populated `total_amount`, `paid_amount`, and `payment_method`, but left `cash_amount`, `card_amount`, `wallet_amount`, and `bank_transfer_amount` empty/null.
  This caused rental sales to be omitted from payment-method breakdowns and physical drawer tallies in shift reports. Furthermore, `sellRental` in `rentals.service.js` threw a 400 error if called with an options object rather than positional arguments.

- **Files Changed:**
  - `src/server/modules/rentals/rentals.service.js`
  - `src/server/modules/sync/sync.service.js`

- **Why the Change is Correct:**
  1. In both `rentals.service.js` and `sync.service.js`, the payment method is normalized and the sale price is explicitly routed to `cash_amount`, `card_amount`, `wallet_amount`, or `bank_transfer_amount`.
  2. `sellRental` supports both positional arguments `(id, price, paymentMethod)` and options object `(id, { price, payment_method })`, preventing runtime TypeError / NaN issues.

- **Regression Test Added:**
  - `scratch/review_deep_verification_tests.js: RENTAL-SALE-SPLIT-COLUMNS-01`.

- **Before/After Results:**
  - *Before:* Rental sale order had `cash_amount = null`, `card_amount = null`, omitting the revenue from cash drawer settlement reports.
  - *After:* `cash_amount = 1200` correctly populated for cash rental sales, properly feeding into cash drawer closing totals.

- **Potential Side Effects:**
  - None.
