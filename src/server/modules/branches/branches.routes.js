const express = require('express');
const controller = require('./branches.controller');
const { requireAdmin } = require('../../middleware/rbac.middleware');

const router = express.Router();

router.get('/branches', controller.listBranches);
router.post('/branches', requireAdmin, controller.createBranch);
router.put('/branches/:id', requireAdmin, controller.updateBranch);
router.delete('/branches/:id', requireAdmin, controller.deleteBranch);

module.exports = router;
