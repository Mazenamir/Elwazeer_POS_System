const express = require('express');
const router = express.Router();
const expensesController = require('./expenses.controller');

// Expenses
router.get('/expenses/summary', expensesController.getExpensesSummary);
router.get('/expenses/cashiers', expensesController.listExpenseCashiers);
router.get('/expenses', expensesController.listExpenses);
router.post('/expenses', expensesController.createExpense);
router.put('/expenses/:id', expensesController.updateExpense);
router.delete('/expenses/:id', expensesController.deleteExpense);

module.exports = router;
