import { it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { HudFrame } from '../src/index.js';
const base = new URL('../demo/public/fixtures/', import.meta.url);
const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');
it('verifies the generated provenance and every scenario output timestamp', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', base), 'utf8'));
  expect(manifest.scenarios).toHaveLength(24);
  expect(hash(await readFile(new URL('../tools/generate-fixtures.ts', import.meta.url)))).toBe(
    manifest.generatorSha256,
  );
  expect(hash(await readFile(new URL('../tools/scenario-outputs.ts', import.meta.url)))).toBe(
    manifest.outputMappingSha256,
  );
  for (const scenario of manifest.scenarios) {
    const json = await readFile(new URL(`${scenario.id}.json`, base));
    expect(hash(json)).toBe(scenario.jsonSha256);
    expect(hash(await readFile(new URL(`${scenario.id}.mavlink`, base)))).toBe(scenario.wireSha256);
    const { frames } = JSON.parse(json.toString()) as { frames: HudFrame[] };
    expect(frames).toHaveLength(301);
    for (const frame of frames) {
      expect(frame.vehicleType).toBe(scenario.mavType);
      for (const output of frame.outputs ?? []) {
        expect(output.command?.at).toBe(frame.time);
        expect(output.command?.valid).toBe(true);
        expect(output.feedback).toBeUndefined();
      }
    }
  }
});
