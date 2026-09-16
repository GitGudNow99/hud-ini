import type { Fixture } from './catalogue.js';

const fixtures = new Map<string, Promise<Fixture>>();
export function loadFixture(id: string): Promise<Fixture> {
  const cached = fixtures.get(id);
  if (cached) return cached;
  const pending = fetch(`./fixtures/${encodeURIComponent(id)}.json`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`${id}: HTTP ${response.status}`);
      return (await response.json()) as Fixture;
    })
    .catch((error: unknown) => {
      fixtures.delete(id);
      throw error;
    });
  fixtures.set(id, pending);
  return pending;
}
