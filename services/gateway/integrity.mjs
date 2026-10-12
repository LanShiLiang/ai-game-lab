import path from 'node:path';
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat, readdir, readFile, open} from 'node:fs/promises';

async function fileHash(filename) {
  const handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    if (!(await handle.stat()).isFile()) throw new Error('Release contains a non-regular file');
    const hash = createHash('sha256');
    for await (const chunk of handle.createReadStream({autoClose: false})) hash.update(chunk);
    return hash.digest('hex');
  } finally { await handle.close(); }
}

// Hash only when preparing a bundle, never in the HTTP request path. The envelope
// binds the exact public + private artifact file set, including release-lock.json.
export async function verifyReleaseIntegrity(directory) {
  const envelopeFile = path.join(directory, 'release-integrity.json');
  const metadata = await lstat(envelopeFile);
  if (!metadata.isFile() || metadata.size > 16 * 1024 * 1024) throw new Error('Invalid release integrity envelope');
  const envelope = JSON.parse(await readFile(envelopeFile, 'utf8'));
  if (envelope.schemaVersion !== 1 || !envelope.files || typeof envelope.files !== 'object' || Array.isArray(envelope.files) || !/^[a-f0-9]{64}$/.test(envelope.digest)) throw new Error('Invalid release integrity schema');
  const files = Object.create(null);
  async function visit(folder) {
    const entries = (await readdir(folder, {withFileTypes: true})).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      const filename = path.join(folder, entry.name);
      const relative = path.relative(directory, filename).split(path.sep).join('/');
      if (entry.isSymbolicLink()) throw new Error(`Release symlinks are forbidden: ${relative}`);
      if (entry.isDirectory()) await visit(filename);
      else if (entry.isFile()) { if (relative !== 'release-integrity.json') files[relative] = await fileHash(filename); }
      else throw new Error(`Unsupported release file: ${relative}`);
    }
  }
  await visit(directory);
  const encoded = JSON.stringify(files);
  if (JSON.stringify(envelope.files) !== encoded || createHash('sha256').update(encoded).digest('hex') !== envelope.digest) throw new Error('Release integrity verification failed: file set or contents differ');
  if (!files['release-lock.json'] || !files['public/index.html']) throw new Error('Release integrity is missing required entry files');
  return files;
}
