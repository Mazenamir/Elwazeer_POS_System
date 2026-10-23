const express = require('express');
const router = express.Router();
const expensesController = require('./expenses.controller');
const { requirePermission } = require('../../middleware/auth.middleware');

// Expenses (requires Expenses.html permission or admin)
router.get('/expenses/summary', requirePermission('Expenses.html'), expensesController.getExpensesSummary);
router.get('/expenses/cashiers', requirePermission('Expenses.html'), expensesController.listExpenseCashiers);
router.get('/expenses', requirePermission('Expenses.html'), expensesController.listExpenses);
router.post('/expenses', requirePermission('Expenses.html'), expensesController.createExpense);
router.put('/expenses/:id', requirePermission('Expenses.html'), expensesController.updateExpense);
router.delete('/expenses/:id', requirePermission('Expenses.html'), expensesController.deleteExpense);

module.exports = router;
