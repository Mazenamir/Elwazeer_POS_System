# Reference Field Mapping Specification

Maps each column and field from the Excel workbook to Elwazeer POS database tables and services.

## 1. Daily Operations Sheet & MASTER SHEET Columns (A to T)

| Col | Excel Header | Formula / Type | Database Table & Field | Service Logic |
|-----|--------------|----------------|------------------------|---------------|
| A | التاريخ | Date string | `orders.order_date`, `rentals.booking_date`, etc. | Formatted YYYY-MM-DD |
| B | رقم الفاتورة | Invoice Ref | `orders.branch_invoice_number`, `rentals.id` | Branch-specific or entity invoice number |
| C | البيان  | Text | `order_items` aggregated + `alterations.description` | Detailed line item description |
| D | الأجمالي | Number | `orders.total_amount`, `rentals.total_price` | Gross invoice amount |
| E | المدفوع  | Number | `orders.paid_amount`, `rentals.deposit` | Collected amount at invoice time |
| F | الباقي | `=D - E` | Derived | Remaining balance unpaid |
| G | أسم البائع | Text | `employees.name` via `seller_id` | Seller/Salesperson name |
| H | تاريخ الأستلام | Date | `alterations.due_date`, `rentals.pickup_date` | Delivery/Pickup date |
| I | الموظف | `=P` | `employees.name` | Assigned employee for advance tracking |
| J | السلف | Number | `employee_transactions.amount` (type='advance') | Daily cash advance drawn by staff |
| K | مصروفات آخرى | Text | `expenses.notes` / `expenses.category` | Expense description |
| L | المبلغ | Number | `expenses.amount` | Expense amount drawn from drawer |
| M | نوع الدفع الإلكتروني | Text | `orders.payment_method` / splits | visa, instapay, wallet, vodafone_cash |
| N | رقم المرجع / الفاتورة | Ref / Time | Check-in or electronic ref | Attendance check-in / ref |
| O | المبلغ الإلكتروني | Number / Time | Check-out or electronic amount | Non-cash collected amount |
| P | أسماء الموظفين  | Text | `employees.name` | Active branch employees list |
| Q | وقت الحضور  | Time | `attendance.check_in` | Formatted HH:MI AM |
| R | وقت الانصراف | Time | `attendance.check_out` | Formatted HH:MI AM |
| S | عداد الساعات | `=MOD(O-N,1)` or `=MOD(Q-R,1)` | `attendance.total_hours` | Worked hours duration |
| T | ملاحظات | Text | `attendance.notes` | Status indicators: غياب, جاز, نص يوم |

## 2. Daily Summary Rows (Rows 76 & 77)

- **Row 76 (اجمالى اليوم ):**
  - `D76 = SUM(D3:D75)`: إجمالي المبيعات والعقود
  - `E76 = SUM(E3:E75)`: إجمالي المقبوضات
  - `J76 = SUM(J3:J75)`: إجمالي سلف الموظفين
  - `L76 = SUM(L3:L75)`: إجمالي المصروفات الأخرى
  - `O76 = SUM(O3:O75)`: إجمالي المقبوضات الإلكترونية
- **Row 77 (صافي توريد الدرج النقدي):**
  - `K77 = J76 + L76 + O76`: إجمالي المنصرف والتحويلات غير النقدية
  - `D77 = E76 - K77`: صافي الكاش الفعلي المتبقي بالدرج للتوريد

## 3. Payroll (SALARY) Invariants & Formulas

- **Standard Hours (D):** 268 hours
- **Daily Wage (J):** `=I / 30` (Basic Salary / 30)
- **Delay Hours (E):** `=IF(C*24 < D, C*24 - D, 0)`
- **Overtime Hours (G):** `=IF(C > D/24, C - D/24, 0)`
- **Overtime Pay (H):** `=((J / 10) * 1.35) * (G * 24)`
- **Gross Salary (K):** `=J * L + H + M + N`
- **Advances (Q):** `=SUMIF('MASTER SHEET'!I:I, B, 'MASTER SHEET'!J:J)`
- **Absence (R) & Deduction (S):** `=COUNTIFS(...)` and `=R * J * 2` (double daily rate)
- **Leave (T) & Excess Deduction (U):** Allowed 4 days; `=IF(T > 4, (T - 4) * J, 0)`
- **Half-Day (V) & Deduction (W):** `=V * (J / 2)`
- **Net Salary (Y):** `=K - P - Q - S - U - W - F - X`

## 4. Attendance & Advances (OHDA)

- Daily Columns 1 to 30: Alternating حضور (Presence) and سلفة (Advance)
- Period Subtotals: `BJ` (1-10), `BK` (11-20), `BL` (21-End)
- Monthly Total Advances: `BM = BJ + BK + BL`
- Monthly Attendance Total: `BN = SUM(B, D, F, ...)`
- Month Entitlement: `BO`
- Daily Average: `BP = BO / 30`
