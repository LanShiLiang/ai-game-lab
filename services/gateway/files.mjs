import {rename} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';

// Windows may temporarily deny replacement while a reader or antivirus owns a
// sharing lock. Keep the previous file intact; never unlink it to force a swap.
export async function replaceFile(source, target, {platform = process.platform, operation = rename, wait = delay} = {}) {
  for (let attempt = 0; ; attempt++) {
    try { await operation(source, target); return; }
    catch (error) {
      if (platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 7) throw error;
      await wait(20 * (attempt + 1));
    }
  }
}
