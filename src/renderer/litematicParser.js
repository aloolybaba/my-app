import { parse } from 'prismarine-nbt';
import { promisify } from 'util';
import { gunzip } from 'zlib';
import fs from 'fs';

const gunzipAsync = promisify(gunzip);

export async function parseLitematic(filePath) {
  const compressed = fs.readFileSync(filePath);
  const decompressed = await gunzipAsync(compressed);
  const { parsed } = await parse(decompressed);

  const regionsNBT = parsed.value.Regions?.value;
  if (!regionsNBT) throw new Error('No regions found in litematic file');

  const regionNames = Object.keys(regionsNBT);
  if (!regionNames.length) throw new Error('No regions found in litematic file');

  const regions = regionNames.map(name => parseRegion(regionsNBT[name].value));
  return mergeRegions(regions);
}

function parseRegion(region) {
  const sizeX = Math.abs(Number(region.Size.value.x.value));
  const sizeY = Math.abs(Number(region.Size.value.y.value));
  const sizeZ = Math.abs(Number(region.Size.value.z.value));

  if (sizeX === 0 || sizeY === 0 || sizeZ === 0) {
    throw new Error(`Invalid schematic size: ${sizeX}x${sizeY}x${sizeZ}`);
  }

  const paletteRaw = region.BlockStatePalette.value.value;
  const palette = paletteRaw.map(entry => {
    const compound = entry.value ?? entry;
    const name = (compound.Name?.value ?? 'minecraft:air')
      .toLowerCase()
      .split('[')[0]
      .trim();
    return { name };
  });

  const rawStates = region.BlockStates.value;
  const bitsPerBlock = Math.max(2, Math.ceil(Math.log2(Math.max(palette.length, 2))));
  const blocks = decodePacked(rawStates, bitsPerBlock, sizeX * sizeY * sizeZ);

  const ox = Number(region.Position?.value?.x?.value ?? 0);
  const oy = Number(region.Position?.value?.y?.value ?? 0);
  const oz = Number(region.Position?.value?.z?.value ?? 0);

  return { blocks, palette, sizeX, sizeY, sizeZ, ox, oy, oz };
}

function mergeRegions(regions) {
  let minX = 0;
  let minY = 0;
  let minZ = 0;
  let maxX = 0;
  let maxY = 0;
  let maxZ = 0;

  for (const region of regions) {
    minX = Math.min(minX, region.ox);
    minY = Math.min(minY, region.oy);
    minZ = Math.min(minZ, region.oz);
    maxX = Math.max(maxX, region.ox + region.sizeX);
    maxY = Math.max(maxY, region.oy + region.sizeY);
    maxZ = Math.max(maxZ, region.oz + region.sizeZ);
  }

  const totalX = maxX - minX;
  const totalY = maxY - minY;
  const totalZ = maxZ - minZ;
  if (totalX <= 0 || totalY <= 0 || totalZ <= 0) {
    throw new Error(`Invalid merged schematic size: ${totalX}x${totalY}x${totalZ}`);
  }

  const airIndex = 0;
  const mergedPalette = [{ name: 'minecraft:air' }];
  const paletteMap = new Map([['minecraft:air', airIndex]]);
  const mergedBlocks = new Uint16Array(totalX * totalY * totalZ);

  for (const region of regions) {
    const regionAirIndex = region.palette.findIndex(block => block.name === 'minecraft:air');

    for (let y = 0; y < region.sizeY; y += 1) {
      for (let z = 0; z < region.sizeZ; z += 1) {
        for (let x = 0; x < region.sizeX; x += 1) {
          const localIndex = x + z * region.sizeX + y * (region.sizeX * region.sizeZ);
          const paletteIndex = region.blocks[localIndex];
          if (paletteIndex === regionAirIndex || paletteIndex >= region.palette.length) continue;

          const blockName = region.palette[paletteIndex].name;
          let mergedIndex = paletteMap.get(blockName);
          if (mergedIndex === undefined) {
            mergedIndex = mergedPalette.length;
            mergedPalette.push({ name: blockName });
            paletteMap.set(blockName, mergedIndex);
          }

          const globalX = x + region.ox - minX;
          const globalY = y + region.oy - minY;
          const globalZ = z + region.oz - minZ;
          const globalIndex = globalX + globalZ * totalX + globalY * (totalX * totalZ);
          mergedBlocks[globalIndex] = mergedIndex;
        }
      }
    }
  }

  let filledBlocks = 0;
  for (const block of mergedBlocks) {
    if (block !== airIndex) filledBlocks += 1;
  }

  return {
    blocks: mergedBlocks,
    palette: mergedPalette,
    size: { x: totalX, y: totalY, z: totalZ },
    volume: { filled: filledBlocks, total: totalX * totalY * totalZ },
  };
}

export function decodePacked(rawStates, bitsPerBlock, count) {
  const raw = rawStates?.value ?? rawStates;
  const longs = Array.from(raw, toLongBigUint64);
  const mask = (1n << BigInt(bitsPerBlock)) - 1n;
  const result = new Uint16Array(count);

  let bitIndex = 0;
  for (let i = 0; i < count; i += 1) {
    const longIndex = Math.floor(bitIndex / 64);
    const bitOffset = bitIndex % 64;

    if (longIndex >= longs.length) break;

    let value;
    if (bitOffset + bitsPerBlock <= 64) {
      value = (longs[longIndex] >> BigInt(bitOffset)) & mask;
    } else {
      const bitsInFirst = 64 - bitOffset;
      const bitsInSecond = bitsPerBlock - bitsInFirst;
      const lowMask = (1n << BigInt(bitsInFirst)) - 1n;
      const highMask = (1n << BigInt(bitsInSecond)) - 1n;
      const low = (longs[longIndex] >> BigInt(bitOffset)) & lowMask;
      const high = (longIndex + 1 < longs.length ? longs[longIndex + 1] : 0n) & highMask;
      value = low | (high << BigInt(bitsInFirst));
    }

    result[i] = Number(value);
    bitIndex += bitsPerBlock;
  }

  return result;
}

function toLongBigUint64(value) {
  if (typeof value === 'bigint') return BigInt.asUintN(64, value);
  if (typeof value === 'number') return BigInt.asUintN(64, BigInt(Math.trunc(value)));
  if (typeof value === 'string') return BigInt.asUintN(64, BigInt(value));

  if (value !== null && typeof value === 'object') {
    const inner = value.value ?? value;
    if (Array.isArray(inner) && inner.length === 2) {
      const high = BigInt(Number(inner[0]) >>> 0);
      const low = BigInt(Number(inner[1]) >>> 0);
      return BigInt.asUintN(64, (high << 32n) | low);
    }

    if ('high' in inner && 'low' in inner) {
      const high = BigInt(Number(inner.high) >>> 0);
      const low = BigInt(Number(inner.low) >>> 0);
      return BigInt.asUintN(64, (high << 32n) | low);
    }
  }

  return 0n;
}
