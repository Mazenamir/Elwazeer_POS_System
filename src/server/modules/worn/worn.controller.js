const service = require('./worn.service');

async function getSummary(req, res, next) {
  try {
    const result = await service.getSummary(req.query, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function listWornProducts(req, res, next) {
  try {
    const result = await service.listWornProducts(req.query, req.user, req);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function createWornProduct(req, res, next) {
  try {
    const result = await service.createWornProduct(req.body, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function updateWornProduct(req, res, next) {
  try {
    const result = await service.updateWornProduct(req.params.id, req.body, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSummary,
  listWornProducts,
  createWornProduct,
  updateWornProduct,
};
