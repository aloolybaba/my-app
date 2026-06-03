import fs from 'fs';
import { promisify } from 'util';
import { gunzip } from 'zlib';
import { parse } from 'prismarine-nbt';

export async function parseLitematic(filePath) {
  const compressed = fs.readFileSync(filePath);
  const decompressed = await promisify(gunzip)(compressed);
  const { parsed } = await parse(decompressed);
  const root = parsed.value;

  const regions = root.Regions?.value;
  if (!regions || !Object.keys(regions).length) throw new Error('No regions found in litematic file');

  const regionName = Object.keys(regions)[0];
  const region = regions[regionName].value;
  const sizeX = Math.abs(Number(region.Size.value.x.value));
  const sizeY = Math.abs(Number(region.Size.value.y.value));
  const sizeZ = Math.abs(Number(region.Size.value.z.value));

  const palette = region.BlockStatePalette.value.value.map(entry => {
    const name = (
      entry?.Name?.value ??
      entry?.value?.Name?.value ??
      'minecraft:air'
    ).toLowerCase();

    return {
      name,
      props: entry.Properties?.value ?? entry?.value?.Properties?.value ?? {},
    };
  });

  const blockStates = normalizeLongArray(region.BlockStates.value);
  const bitsPerBlock = Math.max(2, Math.ceil(Math.log2(Math.max(palette.length, 1))));
  const totalBlocks = sizeX * sizeY * sizeZ;
  const blocks = decodePacked(blockStates, bitsPerBlock, totalBlocks, palette.length);

  const airIndex = palette.findIndex(b => b.name.split('[')[0] === 'minecraft:air');
  const filledBlocks = Array.from(blocks).filter(i => i !== airIndex).length;

  return {
    blocks,
    palette,
    size: { x: sizeX, y: sizeY, z: sizeZ },
    volume: { filled: filledBlocks, total: totalBlocks },
  };
}

function normalizeLongArray(value) {
  const raw = value.value ?? value;
  return Array.from(raw, toBigInt);
}

function toBigInt(item) {
  if (typeof item === 'bigint') return item;
  if (typeof item === 'number') return BigInt(item);
  if (typeof item === 'string') return BigInt(item);
  if (typeof item?.toBigInt === 'function') return item.toBigInt();
  if (typeof item?.valueOf === 'function') {
    const value = item.valueOf();
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return BigInt(value);
    if (typeof value === 'string') return BigInt(value);
  }
  throw new Error('Unsupported NBT long array value');
}

export function decodePacked(longArray, bitsPerBlock, count, paletteLength = null) {
  const modern = decodeModern(longArray, bitsPerBlock, count);
  if (paletteLength == null || modern.every(v => v < paletteLength)) return Uint16Array.from(modern);

  const legacy = decodeLegacy(longArray, bitsPerBlock, count);
  if (legacy.every(v => v < paletteLength)) return Uint16Array.from(legacy);

  return Uint16Array.from(modern);
}

function decodeModern(longArray, bitsPerBlock, count) {
  const mask = (1n << BigInt(bitsPerBlock)) - 1n;
  const valuesPerLong = Math.floor(64 / bitsPerBlock);
  const out = new Array(count).fill(0);
  let index = 0;

  for (const packed of longArray) {
    for (let slot = 0; slot < valuesPerLong && index < count; slot += 1) {
      out[index] = Number((packed >> BigInt(slot * bitsPerBlock)) & mask);
      index += 1;
    }
  }

  return out;
}

function decodeLegacy(longArray, bitsPerBlock, count) {
  const mask = (1n << BigInt(bitsPerBlock)) - 1n;
  const out = new Array(count).fill(0);

  for (let i = 0; i < count; i += 1) {
    const bitIndex = BigInt(i * bitsPerBlock);
    const startLong = Number(bitIndex / 64n);
    const startOffset = Number(bitIndex % 64n);
    let value = (longArray[startLong] >> BigInt(startOffset)) & mask;
    const endOffset = startOffset + bitsPerBlock;

    if (endOffset > 64 && startLong + 1 < longArray.length) {
      const bitsFromNext = endOffset - 64;
      const nextMask = (1n << BigInt(bitsFromNext)) - 1n;
      value |= (longArray[startLong + 1] & nextMask) << BigInt(64 - startOffset);
    }

    out[i] = Number(value & mask);
  }

  return out;
}
