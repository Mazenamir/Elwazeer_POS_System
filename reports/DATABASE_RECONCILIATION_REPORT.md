# تقرير مطابقة وتدقيق قاعدة البيانات والمزامنة (Database Reconciliation Report)

**تاريخ التقرير:** `2026-11-08T01:31:35.123Z`  
**وضع التشغيل:** `DRY-RUN`  
**رقم الفرع:** `1`  
**الحالة العامة للمطابقة:** `ACTION_REQUIRED`  

---

## 1. ملخص النتائج التنفيذية (Executive Summary)

| المعيار | القيمة |
| :--- | :--- |
| **إجمالي الجداول المدققة** | `24` |
| **الجداول المتطابقة بالكامل** | `2` |
| **الجداول التي بها فروق عددية** | `22` |
| **مفاتيح أجنبية يتيمة (Orphaned FKs)** | `0` |
| **العمليات المعلقة بقائمة المزامنة (Unsynced Ops)** | `11` |
| **سجلات مكررة (Duplicate Identifiers)** | `0` |
| **شذوذ بالمخزون (Negative Stock)** | `0` |

---

## 2. جدول مطابقة عدد السجلات (Table Counts Reconciliation)

| اسم الجدول | عدد سجلات الفرع (SQLite) | إجمالي سجلات السيرفر (PG) | سجلات الفرع بالسيرفر | الحالة |
| :--- | :--- | :--- | :--- | :--- |
| `branches` | 19 | 11 | N/A | **DIFF (+8)** |
| `users` | 19 | 20 | N/A | **DIFF (-1)** |
| `inventory` | 1587 | 1363 | N/A | **DIFF (+224)** |
| `inventory_sizes` | 35 | 12849 | 1284 | **DIFF (-1249)** |
| `customers` | 183 | 29 | N/A | **DIFF (+154)** |
| `suppliers` | 267 | 52 | N/A | **DIFF (+215)** |
| `supplier_transactions` | 306 | 1567 | N/A | **DIFF (-1261)** |
| `orders` | 218 | 65 | 48 | **DIFF (+170)** |
| `order_items` | 206 | 22 | N/A | **DIFF (+184)** |
| `order_payments` | 0 | 0 | 0 | **MATCH** |
| `returns` | 13 | 42 | 38 | **DIFF (-25)** |
| `return_items` | 13 | 8 | N/A | **DIFF (+5)** |
| `expenses` | 6 | 6 | 1 | **DIFF (+5)** |
| `tailoring_orders` | 123 | 5 | 0 | **DIFF (+123)** |
| `rental_inventory` | 171 | 323 | N/A | **DIFF (-152)** |
| `rentals` | 192 | 12 | 0 | **DIFF (+192)** |
| `rental_payments` | 0 | 0 | 0 | **MATCH** |
| `employees` | 155 | 46 | N/A | **DIFF (+109)** |
| `attendance` | 138 | 132 | N/A | **DIFF (+6)** |
| `employee_transactions` | 180 | 22 | N/A | **DIFF (+158)** |
| `worn_products` | 162 | 50 | 50 | **DIFF (+112)** |
| `stock_transfers` | 0 | 17 | N/A | **DIFF (-17)** |
| `settings` | 45 | 22 | N/A | **DIFF (+23)** |
| `sync_queue` | 1955 | 0 | N/A | **DIFF (+1955)** |

---

## 3. تحليل قائمة المزامنة (Sync Queue Health)

| حالة العملية | العدد |
| :--- | :--- |
| `pending` | 11 |
| `synced` | 1944 |

### العمليات المعلقة وغير المزامنة:

| معرف العملية | الكيان | الإجراء | المحاولات | آخر خطأ |
| :--- | :--- | :--- | :--- | :--- |
| `#2372` | `order` | `create` | 0 | `لا يوجد` |
| `#2374` | `tailoring_order` | `create` | 0 | `لا يوجد` |
| `#2375` | `tailoring_order` | `update` | 0 | `لا يوجد` |
| `#2376` | `alteration` | `create` | 0 | `لا يوجد` |
| `#2377` | `attendance` | `upsert` | 0 | `لا يوجد` |
| `#2378` | `employee_transaction` | `create` | 0 | `لا يوجد` |
| `#2379` | `worn_product` | `create` | 0 | `لا يوجد` |
| `#2380` | `worn_product` | `update` | 0 | `لا يوجد` |
| `#2381` | `supplier_transaction` | `create` | 0 | `لا يوجد` |
| `#2382` | `settings` | `update` | 0 | `لا يوجد` |
| `#2383` | `supplier` | `create` | 0 | `لا يوجد` |

---

## 4. تدقيق المفاتيح الأجنبية والكيانات اليتيمة (Orphaned Foreign Keys)

> [!TIP]
> لا توجد أي مفاتيح أجنبية يتيمة في جداول الفرع الرئيسية.

---

## 5. قواعد المحاسبة وتقفيل الدرج (Elwazeer Accounting Invariants)

- **إجمالي المدفوعات النقدية (Cash In):** `69700.00 EGP`
- **إجمالي الإيراد البنكي (Visa / InstaPay):** `0.00 EGP` (مفصول تماماً عن الدرج)
- **إجمالي المصروفات النقدية:** `595.00 EGP`
- **إجمالي سلف الموظفين:** `52667.00 EGP`
- **صافي الكاش المتبقي للتوريد بالدرج:** `16438.00 EGP`

> **القاعدة المطبقة:** صافي الكاش للتوريد بالدرج = إجمالي المدفوعات النقدية - (المصروفات النقدية + سلف الموظفين)

---

## 6. التوصيات والإجراءات التصحيحية (Recommendations)

1. There are 11 unsettled operations in sync_queue. Run sync cycle to upload them to Master PostgreSQL.

---
*تم إنشاء هذا التقرير تلقائياً بواسطة أداة المطابقة والتدقيق `scripts/reconcile_databases.js`*