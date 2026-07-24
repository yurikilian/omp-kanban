import { describe, it, expect, vi } from 'vitest';
import { pickFolder } from './folder-picker.js';

describe('pickFolder', () => {
  it('rejects with UNSUPPORTED_PLATFORM off macOS, without touching execFileFn', async () => {
    const execFileFn = vi.fn();
    await expect(pickFolder({ platform: 'linux', execFileFn })).rejects.toMatchObject({ code: 'UNSUPPORTED_PLATFORM' });
    expect(execFileFn).not.toHaveBeenCalled();
  });

  it('resolves with the trimmed path osascript printed', async () => {
    const execFileFn = (cmd, args, cb) => cb(null, '/Users/me/project\n', '');
    const result = await pickFolder({ platform: 'darwin', execFileFn });
    expect(result).toEqual({ path: '/Users/me/project' });
  });

  it('invokes osascript with the expected AppleScript command', async () => {
    const execFileFn = vi.fn((cmd, args, cb) => cb(null, '/x\n', ''));
    await pickFolder({ platform: 'darwin', execFileFn });
    expect(execFileFn).toHaveBeenCalledWith(
      'osascript',
      ['-e', expect.stringContaining('choose folder')],
      expect.any(Function)
    );
  });

  it('resolves { cancelled: true } when the user dismisses the dialog', async () => {
    const execFileFn = (cmd, args, cb) => cb(new Error('exit 1'), '', 'execution error: User canceled. (-128)');
    const result = await pickFolder({ platform: 'darwin', execFileFn });
    expect(result).toEqual({ cancelled: true });
  });

  it('rejects with PICKER_FAILED for any other osascript error', async () => {
    const execFileFn = (cmd, args, cb) => cb(new Error('boom'), '', 'some other AppleScript error');
    await expect(pickFolder({ platform: 'darwin', execFileFn })).rejects.toMatchObject({
      code: 'PICKER_FAILED',
      message: 'some other AppleScript error'
    });
  });
});
