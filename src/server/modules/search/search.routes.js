const express = require('express');
const router = express.Router();
const controller = require('./search.controller');

router.get('/search', controller.handleGlobalSearch);

module.exports = router;
