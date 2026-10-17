const express = require('express');
const router = express.Router();
const syncController = require('./sync.controller');

router.get('/sync/ping', syncController.ping);
router.post('/sync/apply', syncController.apply);
router.get('/sync/catalog', syncController.getCatalog);
router.post('/sync/pull', syncController.pull);
router.get('/sync/status', syncController.getStatus);
router.post('/sync/run', syncController.run);
router.post('/sync/cycle', syncController.runCycle);
router.get('/sync/diagnostics', syncController.getDiagnostics);
router.post('/sync/configure', syncController.configure);

module.exports = router;

