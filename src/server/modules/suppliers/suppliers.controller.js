const service = require('./suppliers.service');
const { hasInventoryAdminAccess } = require('../../../shared/constants/permissions');

async function getOptions(req, res, next) {
  try {
    const rows = await service.getSupplierOptions(req.query);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function listSuppliers(req, res, next) {
  try {
    const result = await service.listSuppliers(req.query, req.user, req);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function createSupplier(req, res, next) {
  try {
    const result = await service.createSupplier(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function updateSupplier(req, res, next) {
  try {
    const result = await service.updateSupplier(req.params.id, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function deleteSupplier(req, res, next) {
  try {
    const result = await service.deleteSupplier(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function listSupplyRecords(req, res, next) {
  try {
    if (!hasInventoryAdminAccess(req.user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const result = await service.listSupplyRecords(req);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function createSupplyRecord(req, res, next) {
  try {
    const result = await service.createSupplyRecord(req.body, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function bulkRestock(req, res, next) {
  try {
    const result = await service.bulkRestock(req.body, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function createTransaction(req, res, next) {
  try {
    if (!hasInventoryAdminAccess(req.user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const result = await service.createSupplierTransaction(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function processReturn(req, res) {
  try {
    if (!hasInventoryAdminAccess(req.user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const result = await service.processSupplierReturn(req.body);
    res.json(result);
  } catch (err) {
    console.error('Return Error:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'حدث خطأ أثناء تسجيل المرتجع' });
  }
}

async function getStatement(req, res, next) {
  try {
    if (!hasInventoryAdminAccess(req.user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const result = await service.getSupplierStatement(req.params.id, req.query.limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getOptions,
  listSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  listSupplyRecords,
  createSupplyRecord,
  bulkRestock,
  createTransaction,
  processReturn,
  getStatement,
};
