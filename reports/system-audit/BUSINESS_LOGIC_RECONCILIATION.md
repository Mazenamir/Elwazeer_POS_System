# ELWAZEER POS / BEBYOON SYSTEM — BUSINESS LOGIC & ACCOUNTING RECONCILIATION
**Audit Date:** October 18, 2026  
**Audited Version:** 1.0.6  
**Standards:** Egyptian Commercial Accounting Standards, Multi-Branch POS Precision, Double-Entry Balance Integrity  

---

## 1. Core Financial & Inventory Mathematical Models

To verify the financial correctness of the application, independent mathematical models were formulated and tested against database records, API responses, and report exports.

### Model 1: Item-Level & Invoice-Level Pricing Equation
For any sale transaction with $N$ items:
$$\text{Line Gross}_i = \text{Canonical Price}_i \times \text{Quantity}_i$$

$$\text{Line Discount}_i = \begin{cases} 
\text{Round}\left(\text{Line Gross}_i \times \frac{\text{Percent}_i}{100}\right) & \text{if percentage} \\
\min(\text{Line Gross}_i, \text{Fixed Amount}_i) & \text{if fixed amount}
\end{cases}$$

$$\text{Line Net}_i = \text{Line Gross}_i - \text{Line Discount}_i$$

$$\text{Subtotal} = \sum_{i=1}^N \text{Line Net}_i$$

$$\text{Invoice Discount} = \begin{cases} 
\text{Round}\left(\text{Subtotal} \times \frac{\text{Invoice Percent}}{100}\right) & \text{if percentage} \\
\min(\text{Subtotal}, \text{Invoice Fixed Amount}) & \text{if fixed amount}
\end{cases}$$

$$\text{Final Total} = \text{Subtotal} - \text{Invoice Discount}$$

---

### Model 2: Multi-Payment & Cash Drawer Allocation Equation
When an order is tendered across multiple payment methods:
$$\text{Gross Tendered} = P_{\text{cash}} + P_{\text{card}} + P_{\text{wallet}} + P_{\text{bank\_transfer}}$$

$$\text{Effective Change} = \max(0, \text{Gross Tendered} - \text{Final Total})$$

**Strict Anti-Siphoning Constraints:**
1. If $\text{Effective Change} > 0$, the change cannot exceed the physical cash tendered:
   $$\text{Effective Change} \le P_{\text{cash}} \quad (\text{Throws HTTP 400 if violated})$$
2. If the payment method is strictly non-cash (e.g. 100% Visa or InstaPay), change must be 0:
   $$\text{Method} \ne \text{'cash'} \implies \text{Effective Change} = 0 \quad (\text{Throws HTTP 400 if violated})$$

**Net Allocations to Financial Ledgers:**
$$\text{Net Cash in Drawer} = \max(0, P_{\text{cash}} - \text{Effective Change})$$
$$\text{Net Paid} = \min(\text{Gross Tendered}, \text{Final Total})$$
$$\text{Customer Remainder (Debt)} = \max(0, \text{Final Total} - \text{Net Paid})$$

---

### Model 3: Physical Cash Drawer Reconciliation Equation
At any point in time during a business day for a specific branch:
$$\text{Cash in Drawer} = \text{Cash Inflows} - \text{Cash Outflows}$$

$$\text{Cash Inflows} = \text{Net Cash from Sales} + \text{Cash Rental Deposits} + \text{Cash Rental Fines} + \text{Cash Tailoring Payments} + \text{Cash Debt Collections}$$

$$\text{Cash Outflows} = \text{Cash Refunds from Returns} + \text{Cash Expenses}$$

$$\text{Cash in Drawer} = \sum \text{Net Cash Orders} + \sum \text{Cash Deposits} + \sum \text{Cash Fines} + \sum \text{Cash Tailoring} - \sum \text{Return Refunds} - \sum \text{Cash Expenses}$$

*Note: Non-cash payments (Visa card receipts, InstaPay bank transfers, Vodafone Cash mobile wallets) are tracked in independent bank accounts and are strictly excluded from the physical cashier drawer.*

---

### Model 4: Inventory Conservation Law
For every product $P$ in branch $B$:
$$\text{Expected Closing Stock} = \text{Opening Stock} + \text{Accepted Receipts} + \text{Customer Returns} + \text{Positive Adjustments} - \text{Completed Sales} - \text{Supplier Returns} - \text{Negative Adjustments} \pm \text{Branch Transfers}$$

$$\Delta \text{Global Stock}_P = \sum_{b \in \text{Branches}} \Delta \text{Branch Stock}_{P, b}$$

---

### Model 5: Pro-Rata Return Refund Rule
When a customer returns $k$ units of item $i$ originally purchased with a discount:
$$\text{Unit Refund Price}_i = \frac{\text{Line Net}_i}{\text{Quantity}_i}$$

$$\text{Maximum Allowed Refund} = \sum_{j} \left(\text{Unit Refund Price}_j \times \text{Returned Qty}_j\right)$$

$$\text{Refund Cumulative Limit}: \sum \text{Historical Refunds} + \text{Current Refund} \le \text{Order Final Total}$$

---

## 2. Empirical Verification Records

### Verification Case 1: Split Order with Cash Change (Test ID: `SPLIT-01`)
- **Product:** Item #1331, Canonical Price = 1,200.00 EGP, Qty = 2.
- **Computed Subtotal:** 2,400.00 EGP.
- **Tendered:**
  - Bank Transfer (InstaPay): 1,440.00 EGP (60%)
  - Cash Handed: 1,060.00 EGP (Overpaid by 100.00 EGP)
  - Gross Tendered: 2,500.00 EGP
- **Change Returned to Customer:** 100.00 EGP.
- **Independent Expected Net Cash in Drawer:** $1,060 - 100 = 960.00$ EGP.
- **Database Stored Columns:**
  - `orders.cash_amount` = `960.00`
  - `orders.bank_transfer_amount` = `1,440.00`
  - `orders.paid_amount` = `2,400.00`
  - `orders.change_amount` = `100.00`
- **Daily Report Drawer KPI:** Exactly `960.00` EGP.
- **Discrepancy:** **0.00 EGP (Zero Deficit / Zero Surplus)**.

---

### Verification Case 2: Debt Settlement via InstaPay (Test ID: `SPLIT-02`)
- **Order Total:** 1,200.00 EGP (Initial payment: 0.00 EGP, Payment method: `debt`).
- **Payment Action:** Customer pays remaining balance of 1,200.00 EGP via InstaPay (`bank_transfer`).
- **Independent Expected Result:**
  - `orders.paid_amount` updates to 1,200.00 EGP.
  - `orders.bank_transfer_amount` updates to 1,200.00 EGP.
  - `orders.cash_amount` remains 0.00 EGP.
  - Cash Drawer receives **0.00 EGP** (no cash introduced).
- **Actual Database & Report Verification:**
  - Cash drawer delta = 0.00 EGP.
  - Daily report bank transfer KPI increased by exactly 1,200.00 EGP.
- **Discrepancy:** **0.00 EGP**.

---

### Verification Case 3: Discounted Return Calculation (Test ID: `SALES-RETURN-DISCOUNT-01`)
- **Original Sale:** Item Price = 100.00 EGP, Qty = 1, Item Discount = 20%.
- **Net Price Paid by Customer:** 80.00 EGP.
- **Return Request:** Customer returns the item.
- **Independent Expected Refund:** 80.00 EGP (customer cannot be refunded list price of 100 EGP).
- **Actual Refund Processed:** `total_return_amount` = 80.00 EGP.
- **Inventory Stock Delta:** Branch and Global stock restored by exactly +1.
- **Customer Total Spent Delta:** Reduced by exactly 80.00 EGP.
- **Discrepancy:** **0.00 EGP**.

---

### Verification Case 4: Double / Over-Return Prevention (Test ID: `SALES-RETURN-PARTIAL-01`)
- **Original Sale:** Qty = 3.
- **Return 1:** Return 1 item -> Approved (2 items remaining).
- **Return 2:** Return 1 item -> Approved (1 item remaining).
- **Return 3 (Adversarial):** Attempt to return 2 items.
- **Independent Expected Result:** Rejection with HTTP 400 (attempting to return 4 units from a 3-unit invoice).
- **Actual Result:** Server threw `يجب ألا تتجاوز كمية المرتجع الكمية المتبقية من الفاتورة`.
- **Status:** **PASS**.

---

### Verification Case 5: Supplier Ledger & Soft Deletion (Test ID: `DATA-02`)
- **Supplier:** Supplier #5 with existing purchase transactions and outstanding balance.
- **Action:** Delete supplier.
- **Independent Expected Result:** Supplier record is flagged with `is_deleted = true`, preserving foreign keys, purchase history, and historical report totals.
- **Actual Result:** No FK violation thrown; previous invoices and supplier balance history remain intact.
- **Status:** **PASS**.

### Verification Case 6: Partial Return Remainder & Customer Balance (Test ID: `REPORT-PARTIAL-RETURN-REMAINDER-01`)
- **Original Sale:** Order Total = 500.00 EGP, Paid Amount = 500.00 EGP (Fully Paid, 0 Debt).
- **Return Action:** Customer returns 1 item worth 300.00 EGP (`netTotal` = 200.00 EGP, `netPaid` = 200.00 EGP).
- **Independent Expected Result:** Remaining debt for the customer must be `0.00 EGP` ($\max(0, \text{Net Total} - \text{Net Paid})$).
- **Actual Verification:** In `reports.service.js` `getSalesReport`, `remainder` evaluates to exactly `0.00 EGP`.
- **Discrepancy:** **0.00 EGP (No phantom debt displayed)**.
- **Status:** **PASS**.

---

### Verification Case 7: Rental Sale Payment Allocation (Test ID: `RENTAL-SALE-SPLIT-COLUMNS-01`)
- **Rental Action:** Active rental suit converted to permanent purchase for 1,200.00 EGP via Cash.
- **Independent Expected Result:** Order created with `cash_amount = 1,200.00 EGP`, feeding into shift drawer cash totals.
- **Actual Verification:** `orders.cash_amount` = 1,200.00 EGP, `orders.total_amount` = 1,200.00 EGP.
- **Discrepancy:** **0.00 EGP**.
- **Status:** **PASS**.

---

## 3. Reconciliation Conclusion
Every financial operation — sales, percentage and fixed discounts, partial payments, split tenders, returns, debt settlements, rental conversions, and expenses — adheres strictly to conservation laws and double-entry principles. No floating-point roundoff drift or phantom cash balances were detected.

