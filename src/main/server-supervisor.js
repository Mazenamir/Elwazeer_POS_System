const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');

class ServerSupervisor {
  constructor(options = {}) {
    this.appRoot = options.appRoot || path.resolve(__dirname, '../../');
    this.serverScript = options.serverScript || path.join(this.appRoot, 'src/server/server.js');
    this.port = options.port || '6253';
    this.logFile = options.logFile || null;
    this.process = null;
    this.readyCallback = null;
  }

  log(message) {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    console.log(message);
    if (this.logFile) {
      try {
        fs.appendFileSync(this.logFile, line);
      } catch {}
    }
  }

  start(onReady) {
    this.readyCallback = onReady;
    this.log(`Checking server path: ${this.serverScript}`);
    this.log(`Server root: ${this.appRoot}`);
    this.log(`Configured port: ${this.port}`);

    if (!fs.existsSync(this.serverScript)) {
      this.log(`CRITICAL: Server script NOT FOUND at ${this.serverScript}`);
    }

    const env = {
      ...process.env,
      PORT: String(this.port),
      APP_ROOT: this.appRoot,
      ELECTRON_RUN_AS_NODE: '1',
    };

    const forkOptions = {
      env,
      cwd: this.appRoot,
      stdio: ['inherit', 'pipe', 'pipe', 'ipc'],
    };

    try {
      const { execSync } = require('child_process');
      const nodePath = execSync('where.exe node', { encoding: 'utf8' }).split(/\r?\n/)[0].trim();
      if (nodePath && fs.existsSync(nodePath)) {
        forkOptions.execPath = nodePath;
        this.log(`[Supervisor] Using system Node: ${nodePath}`);
      }
    } catch (e) {
      this.log(`[Supervisor] Could not detect system node path: ${e.message}`);
    }

    this.process = fork(this.serverScript, [], forkOptions);

    this.process.stdout.on('data', (data) => {
      this.log(`[Server STDOUT]: ${data}`);
    });

    this.process.stderr.on('data', (data) => {
      this.log(`[Server STDERR]: ${data}`);
    });

    this.process.on('message', (msg) => {
      this.log(`[Server Message]: ${msg}`);
      if (msg === 'server-ready' && typeof this.readyCallback === 'function') {
        this.readyCallback();
      }
    });

    this.process.on('error', (err) => {
      this.log(`Server process FORK ERROR: ${err.message}`);
    });

    this.process.on('exit', (code, signal) => {
      this.log(`Server process exited. Code: ${code}, Signal: ${signal}`);
    });

    return this.process;
  }

  stop() {
    if (this.process) {
      this.log('Terminating server process...');
      this.process.kill();
      this.process = null;
    }
  }
}

module.exports = ServerSupervisor;
