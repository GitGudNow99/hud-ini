import { createSocket } from 'node:dgram';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { decodeBytes } from './wire.js';

const dir = new URL('../demo/public/fixtures/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', dir), 'utf8')) as {
  scenarios: { id: string; wireSha256: string; packets: number }[];
};
const receiver = createSocket('udp4'),
  sender = createSocket('udp4');
await new Promise<void>((resolve, reject) => {
  receiver.once('error', reject);
  receiver.bind(0, '127.0.0.1', resolve);
});
const address = receiver.address();
let count = 0;
try {
  for (const scenario of manifest.scenarios) {
    const bytes = await readFile(new URL(`${scenario.id}.mavlink`, dir));
    const chunks: Buffer[] = [];
    for (let offset = 0; offset < bytes.length; offset += 1024) {
      const received = await new Promise<Buffer>((resolve, reject) => {
        const timer = setTimeout(() => {
          receiver.removeListener('message', onMessage);
          reject(new Error('UDP capture timeout'));
        }, 3000);
        function onMessage(data: Buffer) {
          clearTimeout(timer);
          resolve(data);
        }
        receiver.once('message', onMessage);
        sender.send(bytes.subarray(offset, offset + 1024), address.port, '127.0.0.1', (error) => {
          if (error) {
            clearTimeout(timer);
            reject(error);
          }
        });
      });
      chunks.push(received);
    }
    const received = Buffer.concat(chunks);
    if (createHash('sha256').update(received).digest('hex') !== scenario.wireSha256)
      throw new Error(`UDP bytes differ: ${scenario.id}`);
    const packets = await decodeBytes(received);
    if (packets.length !== scenario.packets)
      throw new Error(`Packet count differs: ${scenario.id}`);
    count += packets.length;
  }
  console.log(
    `${manifest.scenarios.length} scenarios, ${count} MAVLink packets verified over loopback UDP.`,
  );
} finally {
  receiver.close();
  sender.close();
}
