import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { expect, test } from 'vitest';
import { documentation } from '../demo/docs-content';
import { createSpecimens, type Scenario } from '../demo/catalogue';
import { vehiclePresets } from '../src/index.js';

test('documentation examples compile against the public package APIs', () => {
  const snippets = documentation.flatMap((page) =>
    page.sections.flatMap((section) =>
      (section.code ?? [])
        .filter((code) => /^(TypeScript|React)/.test(code.label))
        .map(
          (code, i) =>
            [resolve(`tests/doc-${page.id}-${section.id}-${i}.tsx`), code.value] as const,
        ),
    ),
  );
  const files = new Map(snippets);
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    strict: true,
    noUncheckedIndexedAccess: true,
    skipLibCheck: true,
    allowImportingTsExtensions: true,
    noEmit: true,
    paths: Object.fromEntries(
      ['index', 'react', 'element', 'adapters', 'terrain'].map((name) => [
        name === 'index' ? 'hud-ini' : `hud-ini/${name}`,
        [resolve(`src/${name}`)],
      ]),
    ),
  };
  const host = ts.createCompilerHost(options);
  const read = host.readFile.bind(host);
  const exists = host.fileExists.bind(host);
  const source = host.getSourceFile.bind(host);
  host.readFile = (path) => files.get(path) ?? read(path);
  host.fileExists = (path) => files.has(path) || exists(path);
  host.getSourceFile = (path, version, onError, fresh) =>
    files.has(path)
      ? ts.createSourceFile(path, files.get(path)!, options.target!, true, ts.ScriptKind.TSX)
      : source(path, version, onError, fresh);
  const program = ts.createProgram([...files.keys()], options, host);
  const errors = ts
    .getPreEmitDiagnostics(program)
    .map(
      (error) =>
        `${error.file?.fileName}:${error.start}: ${ts.flattenDiagnosticMessageText(error.messageText, '\n')}`,
    );
  expect(errors).toEqual([]);
}, 15000);

test('documentation links point to existing pages, sections and specimens', () => {
  const manifest = JSON.parse(readFileSync('demo/public/fixtures/manifest.json', 'utf8')) as {
    scenarios: Scenario[];
  };
  const specimens = createSpecimens(manifest.scenarios);
  for (const page of documentation) {
    expect(new Set(page.sections.map((section) => section.id)).size).toBe(page.sections.length);
    for (const link of page.sections.flatMap((section) => section.links ?? [])) {
      if (!link.href.startsWith('#')) continue;
      const [area, slug, anchor] = link.href.slice(1).split('/');
      if (area === 'docs') {
        const target = documentation.find((page) => page.id === slug);
        expect(target, link.href).toBeDefined();
        if (anchor)
          expect(
            target?.sections.some((section) => section.id === anchor),
            link.href,
          ).toBe(true);
      } else if (area === 'components' && slug) {
        expect(
          specimens.some((item) => item.id === slug),
          link.href,
        ).toBe(true);
      } else if (area === 'lab' && slug) {
        expect(
          vehiclePresets.some((preset) => preset.id === slug),
          link.href,
        ).toBe(true);
      }
    }
  }
});
