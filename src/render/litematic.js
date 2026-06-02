import fs from "node:fs/promises";
import nbt from "prismarine-nbt";

function unwrapLong(value) {
  if (typeof value === "bigint") return BigInt.asUintN(64, value);
  if (typeof value === "number") return BigInt.asUintN(64, BigInt(value));
  if (Array.isArray(value)) {
    return (BigInt(value[0] >>> 0) << 32n) | BigInt(value[1] >>> 0);
  }
  if (value && typeof value === "object" && "value" in value) return unwrapLong(value.value);
  return BigInt.asUintN(64, BigInt(value || 0));
}

function dimensionInfo(value) {
  const signed = Number(value);
  return {
    size: Math.abs(signed),
    startOffset: signed < 0 ? signed + 1 : 0
  };
}

function getPackedPaletteIndex(longs, index, bitsPerEntry) {
  const bitIndex = BigInt(index * bitsPerEntry);
  const startLong = Number(bitIndex / 64n);
  const startOffset = Number(bitIndex % 64n);
  const mask = (1n << BigInt(bitsPerEntry)) - 1n;
  let value = unwrapLong(longs[startLong]) >> BigInt(startOffset);
  const spill = startOffset + bitsPerEntry - 64;
  if (spill > 0) {
    value |= unwrapLong(longs[startLong + 1]) << BigInt(bitsPerEntry - spill);
  }
  return Number(value & mask);
}

function normalizeBlockName(name) {
  return String(name || "minecraft:air").replace(/^minecraft:/, "");
}

export async function parseLitematic(filePath) {
  const buffer = await fs.readFile(filePath);
  const parsed = await nbt.parse(buffer);
  const data = nbt.simplify(parsed.parsed);
  const regions = data.Regions || data.regions;
  if (!regions || typeof regions !== "object") {
    throw new Error("No Litematica regions found in file.");
  }

  const blocks = [];
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const region of Object.values(regions)) {
    const size = region.Size || region.size;
    const pos = region.Position || region.position || { x: 0, y: 0, z: 0 };
    const xDim = dimensionInfo(size.x);
    const yDim = dimensionInfo(size.y);
    const zDim = dimensionInfo(size.z);
    const width = xDim.size;
    const height = yDim.size;
    const length = zDim.size;
    const originX = Number(pos.x || 0);
    const originY = Number(pos.y || 0);
    const originZ = Number(pos.z || 0);
    const palette = region.BlockStatePalette || region.blockStatePalette;
    const states = region.BlockStates || region.blockStates;
    if (!palette || !states) continue;

    const bits = Math.max(2, Math.ceil(Math.log2(palette.length)));
    const total = width * height * length;

    for (let i = 0; i < total; i++) {
      const paletteIndex = getPackedPaletteIndex(states, i, bits);
      const blockState = palette[paletteIndex] || palette[0];
      const name = normalizeBlockName(blockState.Name || blockState.name);
      if (name === "air" || name === "cave_air" || name === "void_air") continue;

      const localX = i % width;
      const localZ = Math.floor(i / width) % length;
      const localY = Math.floor(i / (width * length));
      const block = {
        x: originX + xDim.startOffset + localX,
        y: originY + yDim.startOffset + localY,
        z: originZ + zDim.startOffset + localZ,
        name,
        properties: blockState.Properties || blockState.properties || {}
      };
      blocks.push(block);
      minX = Math.min(minX, block.x);
      minY = Math.min(minY, block.y);
      minZ = Math.min(minZ, block.z);
      maxX = Math.max(maxX, block.x);
      maxY = Math.max(maxY, block.y);
      maxZ = Math.max(maxZ, block.z);
    }
  }

  if (blocks.length === 0) {
    throw new Error("The schematic contains no renderable blocks.");
  }

  return {
    blocks,
    bounds: { minX, minY, minZ, maxX, maxY, maxZ },
    size: {
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      length: maxZ - minZ + 1
    },
    nonAirVolume: blocks.length,
    boundingVolume: (maxX - minX + 1) * (maxY - minY + 1) * (maxZ - minZ + 1)
  };
}
