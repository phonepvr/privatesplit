import { describe, expect, it } from 'vitest';
import {
  DEVICE_BACKUP_FORMAT,
  DEVICE_BACKUP_VERSION,
} from '../../src/features/export-import/device-backup';

// Compile-time / value sanity check; the full round-trip needs IndexedDB which
// happy-dom doesn't provide. The integration is covered by manual smoke testing
// after each deploy.
describe('device backup constants', () => {
  it('exposes a stable format string', () => {
    expect(DEVICE_BACKUP_FORMAT).toBe('privshare-device-backup');
  });
  it('starts at version 1', () => {
    expect(DEVICE_BACKUP_VERSION).toBe(1);
  });
});
