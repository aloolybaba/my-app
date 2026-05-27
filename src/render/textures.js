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

const specialTextures = {
  redstone_wire: {
    top: ["redstone_dust_dot.png", "redstone_dust_line0.png", "redstone_dust_line1.png"],
    side: ["redstone_dust_dot.png"]
  },
  repeater: {
    top: ["repeater.png", "repeater_on.png"],
    side: ["smooth_stone.png"]
  },
  comparator: {
    top: ["comparator.png", "comparator_on.png"],
    side: ["smooth_stone.png"]
  },
  piston: {
    top: ["piston_top.png", "piston_top_normal.png"],
    side: ["piston_side.png"],
    front: ["piston_top.png", "piston_top_normal.png"]
  },
  sticky_piston: {
    top: ["piston_top_sticky.png", "piston_top.png"],
    side: ["piston_side.png"],
    front: ["piston_top_sticky.png", "piston_top.png"]
  },
  observer: {
    top: ["observer_top.png"],
    side: ["observer_side.png"],
    front: ["observer_front.png"]
  },
  dispenser: {
    top: ["furnace_top.png"],
    side: ["furnace_side.png"],
    front: ["dispenser_front.png", "dispenser_front_vertical.png"]
  },
  dropper: {
    top: ["furnace_top.png"],
    side: ["furnace_side.png"],
    front: ["dropper_front.png", "dropper_front_vertical.png"]
  },
  hopper: {
    top: ["hopper_top.png"],
    side: ["hopper_outside.png"],
    front: ["hopper_outside.png"]
  },
  note_block: {
    top: ["note_block.png"],
    side: ["note_block.png"]
  },
  redstone_torch: {
    top: ["redstone_torch.png"],
    side: ["redstone_torch.png"]
  }
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

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function tintCanvas(image, color) {
  const canvas = createCanvas(image.width || 16, image.height || 16);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  return canvas;
}

function textureFileName(textureRef) {
  const raw =
    typeof textureRef === "object"
      ? textureRef?.sprite || textureRef?.texture
      : textureRef;
  if (!raw) return null;
  const clean = String(raw)
    .replace(/^minecraft:/, "")
    .replace(/^assets\/minecraft\/textures\//, "")
    .replace(/^textures\//, "")
    .replace(/^block\//, "")
    .replace(/\.png$/i, "");
  return `${path.basename(clean)}.png`;
}

export class TextureManager {
  constructor(textureRoot) {
    this.textureRoot = path.resolve(process.cwd(), textureRoot);
    this.cache = new Map();
  }

  async loadTexture(cacheKey, candidates, fallbackKey) {
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    for (const candidate of candidates.map((file) => path.join(this.textureRoot, file))) {
      if (fs.existsSync(candidate)) {
        const image = await loadImage(candidate);
        this.cache.set(cacheKey, image);
        return image;
      }
    }

    const color = fallbackColors[fallbackKey] || "#a97854";
    const canvas = colorCanvas(color, fallbackKey);
    this.cache.set(cacheKey, canvas);
    return canvas;
  }

  async loadTextureRef(textureRef, fallbackKey = "stone", options = {}) {
    const fileName = textureFileName(textureRef);
    const base = fileName ? path.basename(fileName) : null;
    const tint = options.tint ? "#c11212" : null;
    const cacheKey = `texture:${fileName || fallbackKey}:${tint || "plain"}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    const image = await this.loadTexture(
      `texture:${fileName || fallbackKey}`,
      fileName ? unique([fileName, base, "missing.png"]) : ["missing.png"],
      fallbackKey
    );

    if (!tint) return image;

    const tinted = tintCanvas(image, tint);
    this.cache.set(cacheKey, tinted);
    return tinted;
  }

  faceCandidates(blockName, face) {
    const key = baseName(blockName);
    const special = specialTextures[blockName]?.[face] || [];
    const generic =
      face === "top"
        ? [`${key}_top.png`, `${key}.png`, `${key}_side.png`]
        : face === "front"
          ? [`${key}_front.png`, `${key}_side.png`, `${key}.png`, `${key}_top.png`]
          : [`${key}_side.png`, `${key}.png`, `${key}_front.png`, `${key}_top.png`];

    return unique([...special, ...generic, "missing.png"]);
  }

  async getFaces(blockName) {
    const key = baseName(blockName);
    const [top, side, front] = await Promise.all([
      this.loadTexture(`${key}:top`, this.faceCandidates(blockName, "top"), key),
      this.loadTexture(`${key}:side`, this.faceCandidates(blockName, "side"), key),
      this.loadTexture(`${key}:front`, this.faceCandidates(blockName, "front"), key)
    ]);
    return { top, side, front };
  }

  async get(blockName) {
    return (await this.getFaces(blockName)).top;
  }
}
