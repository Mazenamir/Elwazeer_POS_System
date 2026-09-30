const express = require('express');
const router = express.Router();
const syncController = require('./sync.controller');

router.get('/sync/ping', syncController.ping);
router.post('/sync/apply', syncController.apply);
router.get('/sync/status', syncController.getStatus);
router.post('/sync/run', syncController.run);

module.exports = router;
