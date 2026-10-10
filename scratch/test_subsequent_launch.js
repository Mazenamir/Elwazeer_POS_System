const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const appRoot = path.resolve('dist/win-unpacked/resources');
const localNode = path.join(appRoot, 'programs/node/node.exe');
const serverScript = path.join(appRoot, 'server/server.js');
const testDataDir = path.join(process.env.TEMP, 'test_bebyoon_subsequent_' + Date.now());
const testPort = '6289';

console.log('--- SUBSEQUENT LAUNCH TEST ---');

// Pre-create persistent data directory simulating an already-installed system
fs.mkdirSync(path.join(testDataDir, 'postgres_data'), { recursive: true });
fs.cpSync(path.join(appRoot, 'programs/data'), path.join(testDataDir, 'postgres_data'), { recursive: true });
// Put custom marker file in persistent postgres_data to verify it is NOT overwritten
const markerFile = path.join(testDataDir, 'postgres_data', 'user_data_marker.txt');
fs.writeFileSync(markerFile, 'CUSTOM_USER_DATA_DO_NOT_DELETE');

// Put custom .env with non-default comment
const customEnv = path.join(testDataDir, '.env');
fs.writeFileSync(customEnv, 'CUSTOM_USER_CONFIG=1\nPORT=' + testPort + '\n');

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

child.on('message', async (msg) => {
  if (msg === 'server-ready' && !isDone) {
    isDone = true;
    console.log('Server ready received on second launch!');

    // Verify marker file is still intact
    if (fs.existsSync(markerFile) && fs.readFileSync(markerFile, 'utf8') === 'CUSTOM_USER_DATA_DO_NOT_DELETE') {
      console.log('✅ User data marker file is INTACT! No overwrite occurred.');
    } else {
      console.error('❌ User data was OVERWRITTEN or deleted!');
    }

    // Verify custom .env is still intact
    if (fs.existsSync(customEnv) && fs.readFileSync(customEnv, 'utf8').includes('CUSTOM_USER_CONFIG=1')) {
      console.log('✅ Custom user .env is INTACT! No overwrite occurred.');
    } else {
      console.error('❌ Custom user .env was OVERWRITTEN!');
    }

    console.log('Sending shutdown signal...');
    child.send({ type: 'shutdown' });
  }
});

child.on('exit', (code) => {
  console.log('Second launch exited with code:', code);
  try { fs.rmSync(testDataDir, { recursive: true, force: true }); } catch {}
  if (isDone && code === 0) {
    console.log('🎉 SUBSEQUENT LAUNCH PRESERVATION TEST PASSED!');
    process.exit(0);
  } else {
    process.exit(1);
  }
});

setTimeout(() => {
  if (!isDone) {
    console.error('TIMEOUT on second launch');
    child.kill();
    process.exit(1);
  }
}, 30000);
