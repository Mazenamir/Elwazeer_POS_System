const expensesService = require('./expenses.service');

async function getExpensesSummary(req, res, next) {
  try {
    const summary = await expensesService.getExpensesSummary(req.query, req.user);
    res.json(summary);
  } catch (err) {
    next(err);
  }
}

async function listExpenses(req, res, next) {
  try {
    const data = await expensesService.listExpenses(req.query, req.user);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function createExpense(req, res, next) {
  try {
    const expense = await expensesService.createExpense(req.body, req.user, req);
    res.json(expense);
  } catch (err) {
    next(err);
  }
}

async function updateExpense(req, res, next) {
  try {
    const updated = await expensesService.updateExpense(req.params.id, req.body, req.user, req);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

async function deleteExpense(req, res, next) {
  try {
    const deleted = await expensesService.deleteExpense(req.params.id, req.user, req);
    res.json({ success: true, deleted });
  } catch (err) {
    next(err);
  }
}

async function listExpenseCashiers(req, res, next) {
  try {
    const cashiers = await expensesService.listExpenseCashiers(req.user);
    res.json(cashiers);
  } catch (err) {
    next(err);
  }
}

async function getWornProductsSummary(req, res, next) {
  try {
    const summary = await expensesService.getWornProductsSummary(req.query, req.user);
    res.json(summary);
  } catch (err) {
    next(err);
  }
}

async function listWornProducts(req, res, next) {
  try {
    const data = await expensesService.listWornProducts(req.query, req.user);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function createWornProduct(req, res, next) {
  try {
    const wornProduct = await expensesService.createWornProduct(req.body, req.user);
    res.json(wornProduct);
  } catch (err) {
    next(err);
  }
}

async function updateWornProduct(req, res, next) {
  try {
    const updated = await expensesService.updateWornProduct(req.params.id, req.body, req.user);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getExpensesSummary,
  listExpenses,
  listExpenseCashiers,
  createExpense,
  updateExpense,
  deleteExpense,
  getWornProductsSummary,
  listWornProducts,
  createWornProduct,
  updateWornProduct,
};
