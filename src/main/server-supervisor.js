const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(800);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

class ServerSupervisor {
  constructor(options = {}) {
    this.appRoot = options.appRoot || path.resolve(__dirname, '../../');
    this.serverScript = options.serverScript || path.join(this.appRoot, 'src/server/server.js');
    this.port = options.port || '6253';
    this.logFile = options.logFile || null;
    this.process = null;
    this.readyCallback = null;
    this.isExternal = false;
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

  async start(onReady) {
    this.readyCallback = onReady;
    this.log(`Checking server path: ${this.serverScript}`);
    this.log(`Server root: ${this.appRoot}`);
    this.log(`Configured port: ${this.port}`);

    // If server is already running on this port, attach to it instead of double-spawning
    const running = await isPortOpen(Number(this.port));
    if (running) {
      this.log(`[Supervisor] Server is already active on port ${this.port}. Attaching to existing instance.`);
      this.isExternal = true;
      if (typeof this.readyCallback === 'function') {
        setTimeout(() => this.readyCallback(), 50);
      }
      return null;
    }

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

    const localNodePath = path.join(this.appRoot, 'programs', 'node', 'node.exe');
    if (fs.existsSync(localNodePath)) {
      forkOptions.execPath = localNodePath;
      this.log(`[Supervisor] Using local portable Node: ${localNodePath}`);
    } else {
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
