import { execFile } from 'node:child_process';

const PROMPT = 'Select a project folder';

/**
 * Opens the OS-native "choose folder" dialog and resolves with the
 * absolute path the user picked. Only macOS is implemented (via
 * `osascript`/AppleScript) — this only makes sense when the server and
 * the browser are on the same machine, which is the case for this local
 * dev tool. `platform`/`execFileFn` are injectable for tests.
 */
export function pickFolder({ platform = process.platform, execFileFn = execFile } = {}) {
  if (platform !== 'darwin') {
    return Promise.reject(
      Object.assign(new Error('Native folder picker is only supported on macOS'), { code: 'UNSUPPORTED_PLATFORM' })
    );
  }

  return new Promise((resolve, reject) => {
    execFileFn('osascript', ['-e', `POSIX path of (choose folder with prompt "${PROMPT}")`], (err, stdout, stderr) => {
      if (err) {
        const message = String(stderr || err.message || '');
        if (/user canceled/i.test(message) || /-128/.test(message)) {
          resolve({ cancelled: true });
          return;
        }
        reject(Object.assign(new Error(message.trim() || 'Folder picker failed'), { code: 'PICKER_FAILED' }));
        return;
      }
      resolve({ path: stdout.trim() });
    });
  });
}
