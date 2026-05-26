import fs from "node:fs";
import path from "node:path";
import { createCanvas, loadImage } from "canvas";

const fallbackColors = {
  stone: "#7d7d7d",
  cobblestone: "#6f6f6f",
  dirt: "#8a5a35",
  grass_block: "#5f9f3f",
  oak_planks: "#b88a4a",
  spruce_planks: "#73502f",
  glass: "#9fd8ff",
  redstone_block: "#b81818",
  iron_block: "#d8d8d8",
  gold_block: "#f6c743",
  diamond_block: "#62d5c8",
  emerald_block: "#30b85a",
  blackstone: "#25222a",
  deepslate: "#4d4d55",
  water: "#2d63c8",
  lava: "#e66a22"
};

function baseName(blockName) {
  return blockName
    .replace(/_stairs$|_slab$|_wall$|_fence$|_button$|_pressure_plate$/, "")
    .replace(/^potted_/, "");
}

function colorCanvas(color, key) {
  const canvas = createCanvas(16, 16);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 16, 16);
  const seed = [...key].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const n = (x * 17 + y * 31 + seed * 13) % 23;
      if (n < 7) {
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(x, y, 1, 1);
      } else if (n > 18) {
        ctx.fillStyle = "rgba(0,0,0,0.10)";
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  return canvas;
}

export class TextureManager {
  constructor(textureRoot) {
    this.textureRoot = path.resolve(process.cwd(), textureRoot);
    this.cache = new Map();
  }

  async get(blockName) {
    const key = baseName(blockName);
    if (this.cache.has(key)) return this.cache.get(key);

    const candidates = [
      `${key}.png`,
      `${key}_top.png`,
      `${key}_side.png`,
      "missing.png"
    ].map((file) => path.join(this.textureRoot, file));

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        const image = await loadImage(candidate);
        this.cache.set(key, image);
        return image;
      }
    }

    const color = fallbackColors[key] || fallbackColors[blockName] || "#a97854";
    const canvas = colorCanvas(color, key);
    this.cache.set(key, canvas);
    return canvas;
  }
}
