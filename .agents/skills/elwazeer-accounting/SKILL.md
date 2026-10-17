---
name: elwazeer-accounting
description: >-
  Use this skill when auditing, implementing, or modifying the Elwazeer POS accounting module,
  financial reports, payroll, bonuses, expenses, cash reconciliation, permissions, or Excel exports.
---

# Elwazeer Accounting Skill

Before making changes, inspect the actual repository, database schema, existing accounting-related modules, and supplied Excel workbook.

## Rules

- Reuse existing sales, expenses, employee, payroll, and payment records.
- Never create duplicate financial transactions.
- Separate sales from collections and employee advances from expenses.
- Use balanced double-entry accounting for posted journal entries.
- Use database transactions and idempotent posting.
- Preserve existing authentication, RBAC, branch isolation, and synchronization.
- Review workbook formulas before implementing payroll calculations.
- Treat bonuses, deductions, and salary payments as separate financial events.
- Provide accurate Excel and PDF reports based on real database records.
- Validate exports against the underlying report data.
- Test financial workflows against a disposable database.
- Never claim tests passed unless they were actually executed.
- Document ambiguous accounting rules rather than inventing them.
- Never delete or reset production data.
