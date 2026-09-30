const customersService = require('./customers.service');

async function listCustomers(req, res, next) {
  try {
    const result = await customersService.listCustomers(req, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function createCustomer(req, res, next) {
  try {
    const customer = await customersService.createCustomer(req.body, req.user);
    res.json(customer);
  } catch (err) {
    next(err);
  }
}

async function updateCustomer(req, res, next) {
  try {
    const customer = await customersService.updateCustomer(req.params.id, req.body, req.user);
    res.json(customer);
  } catch (err) {
    next(err);
  }
}

async function deleteCustomer(req, res, next) {
  try {
    const result = await customersService.deleteCustomer(req.params.id, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getCustomerHistory(req, res, next) {
  try {
    const history = await customersService.getCustomerHistory(req.params.id, req.user, req.query.limit);
    res.json(history);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerHistory,
};
