const reportsService = require('./reports.service');

async function getDashboard(req, res, next) {
  try {
    const data = await reportsService.getDashboard(req.query, req.user);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function getTopProductsByBranch(req, res, next) {
  try {
    const data = await reportsService.getTopProductsByBranch(req.query, req.user);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function getProfitReport(req, res, next) {
  try {
    const report = await reportsService.getProfitReport(req.query, req.user);
    res.json(report);
  } catch (err) {
    next(err);
  }
}

async function getMonthlyHistory(req, res, next) {
  try {
    const history = await reportsService.getMonthlyHistory(req.query, req.user);
    res.json(history);
  } catch (err) {
    next(err);
  }
}

async function getDailyHistory(req, res, next) {
  try {
    const history = await reportsService.getDailyHistory(req.query, req.user);
    res.json(history);
  } catch (err) {
    next(err);
  }
}

async function getTopProductsReport(req, res, next) {
  try {
    const report = await reportsService.getTopProductsReport(req.query, req.user);
    res.json(report);
  } catch (err) {
    next(err);
  }
}

async function getDailyReport(req, res, next) {
  try {
    const report = await reportsService.getDailyReport(req.query, req.user);
    res.json(report);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getDashboard,
  getTopProductsByBranch,
  getProfitReport,
  getMonthlyHistory,
  getDailyHistory,
  getTopProductsReport,
  getDailyReport,
};
