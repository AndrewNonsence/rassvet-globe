// Keep each browser run in a unique profile and bound its lifetime, including startup.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const {setTimeout: sleep} = require('node:timers/promises');

async function withTestBrowser(executable, args, run, timeoutMs = 600000) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rassvet-browser-test-'));
  let child, timer, onInterrupt, onTerminate;
  const alive = () => child?.pid && child.exitCode === null && child.signalCode === null;
  function stop() {
    if (!alive()) return;
    if (process.platform === 'win32') {
      const result = spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'],
        {windowsHide:true, stdio:'ignore', timeout:10000});
      if (result.status === 0) return;
    }
    child.kill('SIGKILL');
  }
  try {
    child = spawn(executable, [...args, '--headless=new', '--remote-debugging-port=0',
      '--user-data-dir=' + profile, '--no-first-run', 'about:blank'], {stdio:'ignore', windowsHide:true});
    const stopped = new Promise((_, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => reject(new Error('Test browser exited: ' + (signal || code))));
      onInterrupt = () => reject(new Error('Browser test interrupted'));
      onTerminate = () => reject(new Error('Browser test terminated'));
      process.once('SIGINT', onInterrupt);
      process.once('SIGTERM', onTerminate);
      timer = setTimeout(() => reject(new Error('Browser test exceeded its time limit')), timeoutMs);
    });
    process.once('exit', stop);
    const session = async () => {
      const portFile = path.join(profile, 'DevToolsActivePort');
      for (let attempt=0; attempt<120 && alive(); attempt++) {
        if (fs.existsSync(portFile)) {
          const port = Number(fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0]);
          if (port > 0 && port <= 65535) return run(port);
        }
        await sleep(250);
      }
      throw new Error('Test browser did not open its debugging port');
    };
    return await Promise.race([session(), stopped]);
  } finally {
    clearTimeout(timer);
    try {
      stop();
      for (let attempt=0; attempt<40 && alive(); attempt++) await sleep(100);
      if (alive()) throw new Error('Test browser did not exit');
      fs.rmSync(profile, {recursive:true, force:true, maxRetries:5, retryDelay:200});
    } finally {
      process.removeListener('exit', stop);
      if (onInterrupt) process.removeListener('SIGINT', onInterrupt);
      if (onTerminate) process.removeListener('SIGTERM', onTerminate);
    }
  }
}
module.exports = {withTestBrowser};
