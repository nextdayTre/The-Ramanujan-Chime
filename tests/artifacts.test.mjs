// Static artifact tests: deterministic, byte-stable, generated from the one registry.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  artifactContents, buildArtifacts, checkArtifacts, main,
  AGENT_DIR, EXAMPLES_DIR, EXAMPLE_DEFINITIONS
} from '../scripts/gen-agent-artifacts.mjs';

const require = createRequire(import.meta.url);
const AgentCore = require('../js/agent-core.js');

const SUCCESS_KEYS = ['ok', 'schemaVersion', 'tool', 'data', 'deeplink', 'warnings'];

test('generator writes manifest + one example per tool + index', () => {
  const files = buildArtifacts();
  assert.equal(files.size, AgentCore.TOOL_NAMES.length + 2, 'manifest + 9 examples + README');
  assert.equal(checkArtifacts(), 0);
});

test('manifest artifact is byte-identical to the registry serialization', () => {
  const expected = AgentCore.serialize(AgentCore.getManifest());
  const actual = readFileSync(join(AGENT_DIR, 'manifest.json'), 'utf8');
  assert.equal(actual, expected);
  assert.equal(actual.endsWith('\n'), true);
  assert.equal(actual.includes('\r'), false);
});

test('example envelopes are real, successful, canonical key order', () => {
  for (const [fileName, def] of Object.entries(EXAMPLE_DEFINITIONS)) {
    const env = JSON.parse(readFileSync(join(EXAMPLES_DIR, fileName + '.json'), 'utf8'));
    assert.deepEqual(Object.keys(env), SUCCESS_KEYS, fileName + ' key order');
    assert.equal(env.ok, true, fileName);
    assert.equal(env.schemaVersion, 1, fileName);
    assert.equal(env.tool, def.tool, fileName);
    const expected = AgentCore.callTool(def.tool, def.args);
    // Transport equality is JSON equality: -0/NaN encoding is normalised by JSON.
    assert.deepEqual(env, JSON.parse(JSON.stringify(expected)), fileName + ' equals a fresh registry call');
  }
});

test('generated example index lists every tool', () => {
  const readme = readFileSync(join(EXAMPLES_DIR, 'README.md'), 'utf8');
  for (const name of AgentCore.TOOL_NAMES) {
    assert.ok(readme.includes(name + '.json'), 'README missing ' + name);
  }
});

test('generation is idempotent and byte-deterministic', () => {
  const first = artifactContents();
  const second = artifactContents();
  assert.deepEqual([...second.keys()], [...first.keys()]);
  for (const [path, content] of first) {
    assert.equal(second.get(path), content, 'unstable output: ' + path);
  }
  // A second build on disk produces the same bytes and a clean --check.
  buildArtifacts();
  assert.equal(checkArtifacts(), 0);
  assert.equal(main(['--check']), 0);
});

test('no timestamps, randomness or functions in any generated file', () => {
  const files = artifactContents();
  for (const [path, content] of files) {
    assert.equal(/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}/.test(content), false, 'timestamp in ' + path);
    assert.equal(content.includes('"function"'), false, 'function in ' + path);
    assert.equal(content.includes('undefined'), false, 'undefined in ' + path);
    assert.equal(content.endsWith('\n'), true, 'trailing newline in ' + path);
  }
});

test('--check detects a stale artifact', () => {
  buildArtifacts();
  const manifestPath = join(AGENT_DIR, 'manifest.json');
  const original = readFileSync(manifestPath, 'utf8');
  try {
    require('node:fs').writeFileSync(manifestPath, original.replace('"schemaVersion": 1', '"schemaVersion": 2'));
    assert.ok(checkArtifacts() >= 1, 'stale manifest must be reported');
  } finally {
    require('node:fs').writeFileSync(manifestPath, original);
  }
  assert.equal(checkArtifacts(), 0);
});
