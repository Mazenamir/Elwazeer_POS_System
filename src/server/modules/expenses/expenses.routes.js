const express = require('express');
const router = express.Router();
const expensesController = require('./expenses.controller');

// Expenses
router.get('/expenses/summary', expensesController.getExpensesSummary);
router.get('/expenses', expensesController.listExpenses);
router.post('/expenses', expensesController.createExpense);

module.exports = router;
