import { describe, expect, it } from 'vitest';
import { parseTripUpdates, parseVehiclePositions } from './index';

function varint(value: number): Uint8Array {
  const bytes: number[] = [];
  let remaining = value;
  do {
    const byte = remaining & 0x7f;
    remaining >>>= 7;
    bytes.push(remaining ? byte | 0x80 : byte);
  } while (remaining);
  return Uint8Array.from(bytes);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function bytesField(fieldNum: number, value: Uint8Array): Uint8Array {
  return concat(varint(fieldNum << 3 | 2), varint(value.length), value);
}

function stringField(fieldNum: number, value: string): Uint8Array {
  return bytesField(fieldNum, new TextEncoder().encode(value));
}

function varintField(fieldNum: number, value: number): Uint8Array {
  return concat(varint(fieldNum << 3), varint(value));
}

function fixed32Field(fieldNum: number, value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setFloat32(0, value, true);
  return concat(varint(fieldNum << 3 | 5), bytes);
}

function asArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

describe('gtfs-rt-archiver trip parser', () => {
  it('extracts the trip descriptor and first stop delay', () => {
    const descriptor = concat(
      stringField(1, 'trip-1'),
      stringField(5, 'route-1'),
      varintField(6, 1),
    );
    const stopTimeEvent = varintField(1, 120);
    const stopTimeUpdate = bytesField(2, stopTimeEvent);
    const tripUpdate = concat(
      bytesField(1, descriptor),
      bytesField(2, stopTimeUpdate),
    );
    const entity = bytesField(3, tripUpdate);
    const feed = bytesField(2, entity);

    expect(parseTripUpdates(asArrayBuffer(feed))).toEqual([
      { id: 'trip-1', r: 'route-1', d: 1, delay: 120 },
    ]);
  });

  it('extracts vehicle positions from fixed-width protobuf fields', () => {
    const descriptor = concat(
      stringField(1, 'trip-1'),
      stringField(5, 'route-1'),
      varintField(6, 1),
    );
    const position = concat(
      fixed32Field(1, 43.3),
      fixed32Field(2, -79.8),
      fixed32Field(3, 90),
      fixed32Field(5, 2),
    );
    const vehicleDescriptor = stringField(1, 'vehicle-1');
    const vehiclePosition = concat(
      bytesField(1, descriptor),
      bytesField(2, position),
      varintField(3, 12),
      varintField(5, 1_700_000_000),
      stringField(6, 'stop-1'),
      bytesField(8, vehicleDescriptor),
    );
    const entity = bytesField(4, vehiclePosition);
    const feed = bytesField(2, entity);

    expect(parseVehiclePositions(asArrayBuffer(feed), /^route-1$/)).toMatchObject([
      {
        id: 'vehicle-1',
        r: 'route-1',
        tripId: 'trip-1',
        d: 1,
        lat: 43.3,
        lon: -79.8,
        stopId: 'stop-1',
        stopSequence: 12,
        t: 1_700_000_000,
      },
    ]);
  });
});
