const searchService = require('./search.service');

async function handleGlobalSearch(req, res, next) {
  try {
    const { q, branch_id, type } = req.query;
    const results = await searchService.globalSearch(
      { q, branchId: branch_id, type },
      req.user
    );
    res.json(results);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleGlobalSearch,
};
