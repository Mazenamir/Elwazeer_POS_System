const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const appRoot = path.resolve('dist/win-unpacked/resources');
const localNode = path.join(appRoot, 'programs/node/node.exe');
const serverScript = path.join(appRoot, 'server/server.js');
const testDataDir = path.join(process.env.TEMP, 'test_bebyoon_pkg_' + Date.now());
const testPort = '6288';

console.log('--- PACKAGED SERVER E2E TEST ---');
console.log('App Root:', appRoot);
console.log('Local Node:', localNode);
console.log('Server Script:', serverScript);
console.log('Test DATA_DIR:', testDataDir);

if (!fs.existsSync(localNode)) {
  console.error('FAIL: localNode not found');
  process.exit(1);
}
if (!fs.existsSync(serverScript)) {
  console.error('FAIL: serverScript not found');
  process.exit(1);
}

fs.mkdirSync(testDataDir, { recursive: true });

const env = {
  ...process.env,
  PORT: testPort,
  DB_PORT: '5432',
  APP_ROOT: appRoot,
  DATA_DIR: testDataDir,
  ELECTRON_RUN_AS_NODE: '1',
  NODE_PATH: path.join(appRoot, 'node_modules'),
};

const child = fork(serverScript, [], {
  execPath: localNode,
  cwd: appRoot,
  env,
  stdio: ['inherit', 'pipe', 'pipe', 'ipc'],
});

child.stdout.on('data', d => console.log('[STDOUT]', d.toString().trim()));
child.stderr.on('data', d => console.error('[STDERR]', d.toString().trim()));

let isDone = false;

function verifyHttp() {
  return new Promise((resolve) => {
    http.get(`http://127.0.0.1:${testPort}/api/server-time`, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        console.log('HTTP Status:', res.statusCode);
        console.log('HTTP Response:', data);
        resolve(res.statusCode === 200);
      });
    }).on('error', (err) => {
      console.error('HTTP Request failed:', err.message);
      resolve(false);
    });
  });
}

child.on('message', async (msg) => {
  console.log('[IPC Message Received]:', msg);
  if (msg === 'server-ready' && !isDone) {
    isDone = true;
    console.log('✅ Server signalled ready. Testing HTTP endpoint...');
    const ok = await verifyHttp();
    if (ok) {
      console.log('✅ Packaged server successfully responded to HTTP!');
    } else {
      console.error('❌ Packaged server HTTP check failed!');
    }

    console.log('Sending graceful shutdown signal to packaged server...');
    child.send({ type: 'shutdown' });
  }
});

child.on('exit', (code, signal) => {
  console.log(`Packaged server child exited with code: ${code}, signal: ${signal}`);
  // Clean up test data dir
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
    console.log('Cleaned up test data directory.');
  } catch (e) {
    console.warn('Could not clean up test data dir:', e.message);
  }

  if (isDone && code === 0) {
    console.log('🎉 PACKAGED SERVER E2E TEST PASSED WITH EXIT CODE 0!');
    process.exit(0);
  } else {
    console.error('❌ PACKAGED SERVER E2E TEST FAILED!');
    process.exit(1);
  }
});

// Safety timeout: 40 seconds
setTimeout(() => {
  if (!isDone) {
    console.error('TIMEOUT: Server did not signal ready within 40 seconds.');
    child.kill();
    process.exit(1);
  }
}, 40000);
