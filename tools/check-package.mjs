import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'hud-ini-package-'));
const npmCli = process.env.npm_execpath;
assert(npmCli, 'Run this check with npm run test:package.');

function npm(args, cwd) {
  return execFileSync(process.execPath, [npmCli, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

function run(source, cwd) {
  execFileSync(process.execPath, ['--input-type=module', '--eval', source], {
    cwd,
    stdio: 'inherit',
  });
}

try {
  const [archive] = JSON.parse(npm(['pack', '--json', '--pack-destination', temporary], root));
  const files = new Set(archive.files.map((file) => file.path));
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.deepEqual(manifest.dependencies ?? {}, {}, 'The core must have no runtime dependencies.');
  assert.equal(manifest.peerDependenciesMeta.react.optional, true);
  assert.equal(manifest.sideEffects, false);
  assert.equal(manifest.private, undefined);

  const documents = new Set([
    'package.json',
    'README.md',
    'CONTRIBUTING.md',
    'LICENSE',
    'NOTICE.md',
    'tsconfig.build.json',
    'tools/build-package.mjs',
    'docs/api.md',
    'docs/terrain.md',
    'docs/replay.md',
    'demo/README.md',
    'demo/public/replay/README.md',
    'demo/public/licenses/rajdhani.txt',
    'demo/public/licenses/tabler-icons.txt',
    'assets/brand/hud-ini-icon.svg',
    'assets/brand/hud-ini-logo.svg',
    'assets/brand/hud-ini-logo-dark.svg',
    'assets/brand/hud-ini-lockup.svg',
    'assets/brand/hud-ini-lockup-dark.svg',
  ]);
  for (const file of files) {
    assert(
      documents.has(file) ||
        /^dist\/[^/]+\.(js|d\.ts)$/.test(file) ||
        /^src\/[^/]+\.tsx?$/.test(file) ||
        /^examples\/[^/]+\.ts$/.test(file),
      `Unexpected package file: ${file}`,
    );
  }
  for (const file of documents) assert(files.has(file), `Missing package file: ${file}`);
  for (const file of readdirSync(join(root, 'src'))) {
    assert(files.has(`src/${file}`), `Missing source: ${file}`);
    const stem = file.replace(/\.tsx?$/, '');
    assert(files.has(`dist/${stem}.js`), `Missing JavaScript: ${stem}`);
    assert(files.has(`dist/${stem}.d.ts`), `Missing declarations: ${stem}`);
  }
  for (const entry of Object.values(manifest.exports)) {
    for (const target of Object.values(entry)) {
      assert(files.has(target.replace(/^\.\//, '')), `Missing export target: ${target}`);
    }
  }

  const consumer = join(temporary, 'consumer');
  mkdirSync(consumer);
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  npm(
    [
      'install',
      '--offline',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--no-package-lock',
      join(temporary, archive.filename),
    ],
    consumer,
  );
  assert(!existsSync(join(consumer, 'node_modules/react')), 'React must remain optional.');
  run(
    `import assert from 'node:assert/strict';
     import { renderHud, HudController, readingStatus, presetForMavType } from '@gitgudnow99/hud-ini';
     import { defineHudIni } from '@gitgudnow99/hud-ini/element';
     import { MavlinkTelemetry, fromPtz } from '@gitgudnow99/hud-ini/adapters';
     import { ArVisibilityResolver, createHeightfieldProvider } from '@gitgudnow99/hud-ini/terrain';
     assert.equal(typeof window, 'undefined');
     assert.equal(typeof document, 'undefined');
     for (const fn of [renderHud, HudController, MavlinkTelemetry, fromPtz,
                       ArVisibilityResolver, createHeightfieldProvider]) {
       assert.equal(typeof fn, 'function');
     }
     defineHudIni();
     assert.equal(readingStatus({ value: 0, at: 5 }, 5), 'valid');
     assert.equal(presetForMavType(11).id, 'boat');`,
    consumer,
  );

  const installed = join(consumer, 'node_modules', manifest.name);
  for (const file of files) {
    if (!/\.md$/.test(file)) continue;
    const content = readFileSync(join(installed, file), 'utf8');
    const prose = content.replace(/^```[^\n]*\n[\s\S]*?^```/gm, '');
    const links = [
      ...prose.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g),
      ...prose.matchAll(/\b(?:src|srcset)=["']([^"']+)["']/g),
    ];
    for (const [, target] of links) {
      if (/^(?:[a-z]+:|#)/i.test(target)) continue;
      const path = target.split('#')[0];
      assert(
        existsSync(join(dirname(join(installed, file)), path)),
        `Broken link in ${file}: ${target}`,
      );
    }
  }

  const modules = join(consumer, 'node_modules');
  for (const name of ['react', 'react-dom', '@types/react', '@types/react-dom', 'csstype']) {
    const target = join(modules, name);
    mkdirSync(dirname(target), { recursive: true });
    symlinkSync(join(root, 'node_modules', name), target, 'junction');
  }
  run(
    `import assert from 'node:assert/strict';
     import { createElement } from 'react';
     import { renderToStaticMarkup } from 'react-dom/server';
     import { HudIni } from '@gitgudnow99/hud-ini/react';
     const html = renderToStaticMarkup(createElement(HudIni, {
       frame: { time: 0, source: 'demo', label: 'Preview' },
     }));
     assert.match(html, /^<canvas/);`,
    consumer,
  );
  writeFileSync(
    join(consumer, 'index.tsx'),
    `import { HudController, type HudFrame, type HudOptions } from '@gitgudnow99/hud-ini';
     import { HudIni, type HudIniProps } from '@gitgudnow99/hud-ini/react';
     import { defineHudIni, type HudIniElement } from '@gitgudnow99/hud-ini/element';
     import { MavlinkTelemetry, type MavlinkOptions } from '@gitgudnow99/hud-ini/adapters';
     import { ArVisibilityResolver, createHeightfieldProvider } from '@gitgudnow99/hud-ini/terrain';
     const frame: HudFrame = { time: 0, source: 'demo', label: 'Preview' };
     const options: HudOptions = { preset: 'boat' };
     const props: HudIniProps = { frame, options };
     const view = <HudIni {...props} />;
     const feedOptions: MavlinkOptions = { systemId: 1, componentId: 1 };
     const feed = new MavlinkTelemetry(feedOptions);
     declare const canvas: HTMLCanvasElement;
     declare const element: HudIniElement;
     new HudController(canvas).update(feed.snapshot(1), options);
     element.frame = frame;
     defineHudIni();
     void [view, ArVisibilityResolver, createHeightfieldProvider];`,
  );
  const tsc = fileURLToPath(import.meta.resolve('typescript/bin/tsc'));
  for (const resolution of ['NodeNext', 'Bundler']) {
    execFileSync(
      process.execPath,
      [
        tsc,
        '--noEmit',
        '--strict',
        '--target',
        'ES2022',
        '--jsx',
        'react-jsx',
        '--module',
        resolution === 'NodeNext' ? 'NodeNext' : 'ESNext',
        '--moduleResolution',
        resolution,
        'index.tsx',
      ],
      { cwd: consumer, stdio: 'inherit' },
    );
  }
  console.log(
    `Verified ${manifest.name}@${manifest.version}: ${files.size} files, optional React, five SSR-safe entry points, NodeNext and Bundler declarations, and documentation links.`,
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
