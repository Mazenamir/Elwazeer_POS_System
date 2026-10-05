const service = require('./tailoring.service');

// Alterations
async function listAlterations(req, res, next) {
  try {
    const result = await service.listAlterations(req.query, req.user, req);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function createAlteration(req, res, next) {
  try {
    const result = await service.createAlteration(req.body, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function updateAlteration(req, res, next) {
  try {
    const result = await service.updateAlteration(req.params.id, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function deleteAlteration(req, res, next) {
  try {
    const result = await service.deleteAlteration(req.params.id, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// Tailoring Orders
async function listTailoringOrders(req, res, next) {
  try {
    const result = await service.listTailoringOrders(req.query, req.user, req);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function createTailoringOrder(req, res, next) {
  try {
    const result = await service.createTailoringOrder(req.body, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function deleteTailoringOrder(req, res, next) {
  try {
    const result = await service.deleteTailoringOrder(req.params.id, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function payRemainingTailoringOrder(req, res, next) {
  try {
    const result = await service.payRemainingTailoringOrder(req.params.id, req.user, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listAlterations,
  createAlteration,
  updateAlteration,
  deleteAlteration,
  listTailoringOrders,
  createTailoringOrder,
  deleteTailoringOrder,
  payRemainingTailoringOrder,
};
