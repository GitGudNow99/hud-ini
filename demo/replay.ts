import { replayFrame, replayIndexAt } from '../tools/replay-ar.js';
import type { ReplayScenario } from '../tools/replay-ar.js';

/** A recorded flight the website can play, with the provenance the page has to display. */
export interface Recording {
  /** Scenario file served from `public/replay`, without the extension. */
  id: string;
  /** Recording file name. A scenario rebuilt through the adapter reuses the original video. */
  video: string;
  label: string;
  /** Short credit rendered beside the player. */
  credit: string;
  href: string;
  license: string;
  licenseHref: string;
  /** Fields the converter resolved rather than recorded. Empty when every value is measured. */
  derived: readonly string[];
}

export const recordings: readonly Recording[] = [
  {
    id: 'uzh-fpv-outdoor-1-mavlink',
    video: 'uzh-fpv-outdoor-1.mp4',
    label: 'UZH-FPV outdoor 1',
    credit: 'Delmerico, Cieslewski, Rebecq, Faessler and Scaramuzza, ICRA 2019',
    href: 'https://fpv.ifi.uzh.ch/datasets/',
    license: 'CC BY-NC-SA 3.0',
    licenseHref: 'https://creativecommons.org/licenses/by-nc-sa/3.0/',
    derived: ['rotor demands', 'stick positions', 'flight mode'],
  },
  {
    id: 'agz-zurich',
    video: 'agz-zurich.mp4',
    label: 'Zurich Urban MAV',
    credit: 'Majdik, Till and Scaramuzza, IJRR 2017',
    href: 'https://rpg.ifi.uzh.ch/zurichmavdataset.html',
    license: 'No restriction',
    licenseHref: 'https://rpg.ifi.uzh.ch/zurichmavdataset.html',
    derived: [],
  },
];

const cache = new Map<string, Promise<ReplayScenario>>();

/** Fetch a recorded scenario. The website serves these beside the synthetic fixtures. */
export function loadRecording(id: string): Promise<ReplayScenario> {
  const cached = cache.get(id);
  if (cached) return cached;
  const pending = fetch(`./replay/${encodeURIComponent(id)}.json`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`${id}: HTTP ${response.status}`);
      return (await response.json()) as ReplayScenario;
    })
    .catch((error: unknown) => {
      cache.delete(id);
      throw error;
    });
  cache.set(id, pending);
  return pending;
}

export { replayFrame, replayIndexAt };
export type { ReplayScenario };
