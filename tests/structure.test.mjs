// Structural tests: the router, every page module, and the backup format must agree with each other.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('routes and modules', () => {
  test('every route has a unique id and a render function', async () => {
    const { ROUTES } = await import('../js/router.js');
    const ids = ROUTES.map((route) => route.id);
    assert.equal(new Set(ids).size, ids.length, 'route ids must be unique');
    for (const route of ROUTES) {
      assert.equal(typeof route.render, 'function', `${route.id} must export render()`);
    }
    for (const required of ['overview', 'tasks', 'academics', 'projects', 'performance', 'journal', 'focus', 'settings']) {
      assert.ok(ids.includes(required), `missing route ${required}`);
    }
  });

  test('no page is marked as a placeholder', () => {
    const source = fs.readFileSync(path.join(root, 'js/router.js'), 'utf8');
    assert.equal(/milestone:/.test(source), false, 'milestone labels should be gone once every page is built');
  });

  test('every shipped JavaScript file is in the offline cache list', () => {
    const sw = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
    const files = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.js')) files.push(path.relative(root, full).split(path.sep).join('/'));
      }
    };
    walk(path.join(root, 'js'));
    for (const file of files) {
      assert.ok(sw.includes(`'./${file}'`), `${file} is missing from SHELL_ASSETS`);
    }
  });

  test('every offline asset listed by the service worker exists', () => {
    const sw = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
    for (const match of sw.matchAll(/'\.\/([^']+)'/g)) {
      if (!match[1]) continue;
      assert.ok(fs.existsSync(path.join(root, match[1])), `${match[1]} listed in service worker but missing`);
    }
  });
});

describe('backup round trip', () => {
  test('a backup created from stores validates and keeps every record', async () => {
    const { createBackupPayload, validateBackup } = await import('../js/domain/backup.js');
    const names = ['tasks', 'kv'];
    const stores = { tasks: [{ id: 'a', title: 'One' }, { id: 'b', title: 'Two' }], kv: [{ key: 'preferences', value: { name: 'X' } }] };
    const payload = JSON.parse(JSON.stringify(createBackupPayload(stores, '1.0.0')));
    const result = validateBackup(payload, names);
    assert.equal(result.ok, true);
    assert.equal(result.totalRecords, 3);
    assert.deepEqual(payload.stores.tasks.map((item) => item.id), ['a', 'b']);
  });
});
