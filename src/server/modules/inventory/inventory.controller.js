const inventoryService = require('./inventory.service');

async function getMetadata(req, res, next) {
  try {
    const metadata = await inventoryService.getMetadata();
    res.json(metadata);
  } catch (err) {
    next(err);
  }
}

async function getModels(req, res, next) {
  try {
    const models = await inventoryService.getModels(req.user);
    res.json(models);
  } catch (err) {
    next(err);
  }
}

async function getBarcodes(req, res, next) {
  try {
    const barcodes = await inventoryService.getBarcodes();
    res.json(barcodes);
  } catch (err) {
    next(err);
  }
}

async function getVariants(req, res, next) {
  try {
    const variants = await inventoryService.getVariants(req.query.name, req.query.branch_id, req.user);
    res.json(variants);
  } catch (err) {
    next(err);
  }
}

async function listInventory(req, res, next) {
  try {
    const items = await inventoryService.listInventory(req, req.user);
    res.json(items);
  } catch (err) {
    next(err);
  }
}

async function createProduct(req, res, next) {
  try {
    const item = await inventoryService.createProduct(req.body, req.user);
    res.json(item);
  } catch (err) {
    next(err);
  }
}

async function updateProduct(req, res, next) {
  try {
    const item = await inventoryService.updateProduct(req.params.id, req.body, req.user);
    res.json(item);
  } catch (err) {
    next(err);
  }
}

async function deleteProduct(req, res, next) {
  try {
    const result = await inventoryService.deleteProduct(req.params.id, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function transferStock(req, res, next) {
  try {
    const result = await inventoryService.transferStock(req.body, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function listTransferRequests(req, res, next) {
  try {
    const requests = await inventoryService.listTransferRequests(req.user, req.query.branch_id);
    res.json(requests);
  } catch (err) {
    next(err);
  }
}

async function approveTransfer(req, res, next) {
  try {
    const result = await inventoryService.approveTransfer(req.params.id, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function rejectTransfer(req, res, next) {
  try {
    const result = await inventoryService.rejectTransfer(req.params.id, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function listIncomingTransfers(req, res, next) {
  try {
    const transfers = await inventoryService.listIncomingTransfers(req.user, req.query.branch_id);
    res.json(transfers);
  } catch (err) {
    next(err);
  }
}

async function receiveTransfer(req, res, next) {
  try {
    const result = await inventoryService.receiveTransfer(req.params.id, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMetadata,
  getModels,
  getBarcodes,
  getVariants,
  listInventory,
  createProduct,
  updateProduct,
  deleteProduct,
  transferStock,
  listTransferRequests,
  approveTransfer,
  rejectTransfer,
  listIncomingTransfers,
  receiveTransfer,
};
