const express = require('express');
const router = express.Router();
const controller = require('./search.controller');
const { searchLimiter } = require('../../middleware/rateLimit.middleware');

router.get('/search', searchLimiter, controller.handleGlobalSearch);

module.exports = router;
