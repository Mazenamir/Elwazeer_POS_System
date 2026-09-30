const branchesService = require('./branches.service');

async function listBranches(req, res, next) {
  try {
    const branches = await branchesService.listBranches();
    res.json(branches);
  } catch (err) {
    next(err);
  }
}

async function createBranch(req, res, next) {
  try {
    const branch = await branchesService.createBranch(req.body);
    res.json(branch);
  } catch (err) {
    next(err);
  }
}

async function updateBranch(req, res, next) {
  try {
    const branch = await branchesService.updateBranch(req.params.id, req.body);
    res.json(branch);
  } catch (err) {
    next(err);
  }
}

async function deleteBranch(req, res, next) {
  try {
    const result = await branchesService.deleteBranch(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listBranches,
  createBranch,
  updateBranch,
  deleteBranch,
};
