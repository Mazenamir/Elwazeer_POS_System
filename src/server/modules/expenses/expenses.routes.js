const express = require('express');
const router = express.Router();
const expensesController = require('./expenses.controller');

// Expenses
router.get('/expenses/summary', expensesController.getExpensesSummary);
router.get('/expenses', expensesController.listExpenses);
router.post('/expenses', expensesController.createExpense);

// Worn Products
router.get('/worn-products/summary', expensesController.getWornProductsSummary);
router.get('/worn-products', expensesController.listWornProducts);
router.post('/worn-products', expensesController.createWornProduct);
router.patch('/worn-products/:id', expensesController.updateWornProduct);

module.exports = router;
