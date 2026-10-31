import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {migrateRigDocument} from '@standrig/core/migration';

const dist = new URL('../dist/', import.meta.url);
const html = await fs.readFile(new URL('index.html', dist), 'utf8');
const links = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"?#]+)"/g)].map(m=>m[1]);
assert.ok(links.length >= 2, 'Expected relative built script and stylesheet');
for (const link of links) await fs.access(new URL(link, dist));
const entry = links.find(p=>p.endsWith('.js'));
assert.ok(entry, 'Missing built entry script');
const js = await fs.readFile(new URL(entry, dist), 'utf8');
assert.doesNotMatch(js, /\/api\/(?:rig|bundle)|127\.0\.0\.1|localhost/, 'Static site depends on a local service');
const model = migrateRigDocument(JSON.parse(await fs.readFile(new URL('model/sora-v0.3.1.json', dist), 'utf8')));
assert.ok(model.parts.length > 0 && model.assets.length > 0, 'Empty model');
for (const asset of model.assets) {
  assert.match(asset.src, /^data:image\/png;base64,/, `External model texture: ${asset.id}`);
  assert.equal(Buffer.from(asset.src.split(',')[1], 'base64').subarray(0,8).toString('hex'), '89504e470d0a1a0a');
}
assert.equal(new URL('./model/sora-v0.3.1.json', 'https://Nhckdvrl.github.io/sora/').pathname, '/sora/model/sora-v0.3.1.json');
console.log(`Static deployment checked: ${model.parts.length} parts, ${model.assets.length} embedded textures; ${fileURLToPath(dist)}`);
