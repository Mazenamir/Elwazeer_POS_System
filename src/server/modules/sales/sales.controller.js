const service = require('./sales.service');

async function getNextOrderId(req, res, next) {
  try {
    const result = await service.getNextOrderId(req.query.branch_id, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function listOrders(req, res, next) {
  try {
    const result = await service.listOrders(req.query, req.user, req);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function createOrder(req, res) {
  try {
    const result = await service.createOrder(req.body, req.user, req);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 400).json({
      error: err.message,
      ...(err.code ? { code: err.code } : {}),
      ...(err.retry_after ? { retry_after: err.retry_after } : {}),
    });
  }
}

async function payRemaining(req, res, next) {
  try {
    const result = await service.payRemaining(req.params.id, req.body.amount, req.body.payment_method, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getOrderDetails(req, res, next) {
  try {
    const result = await service.getOrderDetails(req.params.id, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function updateOrder(req, res, next) {
  try {
    const result = await service.updateOrder(req.params.id, req.body, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function searchOrders(req, res, next) {
  try {
    const result = await service.searchOrders(req.query.query, req.query.branch_id, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function createReturn(req, res) {
  try {
    const result = await service.createReturn(req.body, req.user, req);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 400).json({
      error: err.message,
      ...(err.code ? { code: err.code } : {}),
      ...(err.retry_after ? { retry_after: err.retry_after } : {}),
    });
  }
}

async function listReturns(req, res, next) {
  try {
    const result = await service.listReturns(req.query, req.user, req);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getNextOrderId,
  listOrders,
  createOrder,
  payRemaining,
  getOrderDetails,
  updateOrder,
  searchOrders,
  createReturn,
  listReturns,
};
