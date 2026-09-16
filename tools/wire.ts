import { PassThrough } from 'node:stream';
import {
  MavLinkPacketParser,
  MavLinkPacketSplitter,
  minimal,
  standard,
  common,
} from 'node-mavlink';
import type { MavLinkPacket } from 'node-mavlink';
import type { MavlinkEnvelope } from '../src/adapters.js';

const registry = { ...minimal.REGISTRY, ...standard.REGISTRY, ...common.REGISTRY };
export function decodeBytes(bytes: Buffer): Promise<MavlinkEnvelope[]> {
  return new Promise((resolve, reject) => {
    const input = new PassThrough();
    const splitter = new MavLinkPacketSplitter();
    const parser = new MavLinkPacketParser();
    const result: MavlinkEnvelope[] = [];
    input.pipe(splitter).pipe(parser);
    for (const stream of [input, splitter, parser]) stream.on('error', reject);
    parser.on('data', (packet: MavLinkPacket) => {
      const cls = registry[packet.header.msgid];
      if (!cls) return;
      const decoded = packet.protocol.data(packet.payload, cls) as unknown as Record<
        string,
        number
      >;
      result.push({
        systemId: packet.header.sysid,
        componentId: packet.header.compid,
        time: 0,
        message: cls.MSG_NAME,
        ...(cls.MSG_NAME === 'STATUSTEXT'
          ? {
              text: new Uint8Array(packet.payload.subarray(1, 51)),
            }
          : {}),
        fields: Object.fromEntries(
          cls.FIELDS.filter((field) => typeof decoded[field.name] === 'number').map((field) => [
            field.source,
            decoded[field.name]!,
          ]),
        ),
      });
    });
    parser.on('end', () => resolve(result));
    input.end(bytes);
  });
}
