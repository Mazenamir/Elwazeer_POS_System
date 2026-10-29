const service = require('./rentals.service');

async function listRentalInventory(req, res, next) {
  try {
    const result = await service.listRentalInventory(req.query, req.user, req);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function createRentalInventory(req, res, next) {
  try {
    const result = await service.createRentalInventory(req.body, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function checkAvailability(req, res, next) {
  try {
    const result = await service.checkAvailability(
      req.params.id,
      req.query.branch_id,
      req.query.pickup_date,
      req.query.return_date,
      req.user
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function updateRentalInventory(req, res, next) {
  try {
    const result = await service.updateRentalInventory(req.params.id, req.body, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function deleteRentalInventory(req, res, next) {
  try {
    const result = await service.deleteRentalInventory(req.params.id, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function transferFromSales(req, res, next) {
  try {
    const result = await service.transferFromSales(req.body, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getRentalsSummary(req, res, next) {
  try {
    const result = await service.getRentalsSummary(req.query.branch_id, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function listRentals(req, res, next) {
  try {
    const result = await service.listRentals(req.query, req.user, req);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function createRental(req, res, next) {
  try {
    const result = await service.createRental(req.body, req.user, req);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function pickupRental(req, res, next) {
  try {
    const result = await service.pickupRental(req.params.id, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function cancelRental(req, res, next) {
  try {
    const result = await service.cancelRental(req.params.id, req.user, req);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function returnRental(req, res, next) {
  try {
    const result = await service.returnRental(req.params.id, req.body, req.user, req);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function settleRentalPayment(req, res, next) {
  try {
    const result = await service.settleRentalPayment(req.params.id, req.body, req.user, req);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function sellRental(req, res, next) {
  try {
    const result = await service.sellRental(
      req.params.id,
      req.body.sell_price,
      req.body.payment_method,
      req.body.offline_uuid,
      req.user,
      req
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function updateRentalStatus(req, res, next) {
  try {
    const result = await service.updateRentalStatus(
      req.params.id,
      req.body.status,
      { notes: req.body.notes },
      req.user,
      req
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function handleScanAction(req, res, next) {
  try {
    const result = await service.handleScanAction(req.body, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function setRentalPrepared(req, res, next) {
  try {
    const result = await service.setRentalPrepared(req.params.id, req.body, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getRentalPreparationList(req, res, next) {
  try {
    const result = await service.getRentalPreparationList(req.query, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getRentalHistoryLedger(req, res, next) {
  try {
    const result = await service.getRentalHistoryLedger(req.query, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getRentalCategories(req, res, next) {
  try {
    const branchId = req.query.branch_id && req.query.branch_id !== 'all' ? parseInt(req.query.branch_id, 10) : null;
    const result = await service.getRentalMetadata(branchId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}


async function addRentalItems(req, res, next) {
  try {
    const result = await service.addRentalItems(req.params.id, req.body, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  addRentalItems,
  listRentalInventory,
  createRentalInventory,
  checkAvailability,
  updateRentalInventory,
  deleteRentalInventory,
  transferFromSales,
  getRentalsSummary,
  listRentals,
  createRental,
  pickupRental,
  cancelRental,
  returnRental,
  settleRentalPayment,
  sellRental,
  updateRentalStatus,
  handleScanAction,
  setRentalPrepared,
  getRentalPreparationList,
  getRentalHistoryLedger,
  getRentalCategories,
};
