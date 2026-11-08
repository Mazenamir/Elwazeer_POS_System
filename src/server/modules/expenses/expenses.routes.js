const express = require('express');
const router = express.Router();
const expensesController = require('./expenses.controller');
const { requirePermission } = require('../../middleware/auth.middleware');

// Expenses summary & cashiers
router.get(
  '/expenses/summary',
  requirePermission('expenses.list.view', 'cash_drawer.settlement.view', 'expenses.create', 'pos.sales.view'),
  expensesController.getExpensesSummary
);
router.get(
  '/expenses/cashiers',
  requirePermission('expenses.list.view', 'cash_drawer.settlement.view'),
  expensesController.listExpenseCashiers
);

// Expenses CRUD
router.get('/expenses', requirePermission('expenses.list.view', 'expenses.create'), expensesController.listExpenses);
router.post('/expenses', requirePermission('expenses.create'), expensesController.createExpense);
router.put('/expenses/:id', requirePermission('expenses.create'), expensesController.updateExpense);
router.delete('/expenses/:id', requirePermission('expenses.delete'), expensesController.deleteExpense);

module.exports = router;
