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

function fallbackColorFor(key) {
  const name = String(key || "").toLowerCase();
  if (fallbackColors[name]) return fallbackColors[name];
  if (name.includes("white") || name.includes("quartz") || name.includes("snow")) return "#e7ecec";
  if (name.includes("light_gray") || name.includes("iron")) return "#c9cccc";
  if (name.includes("gray") || name.includes("observer") || name.includes("dispenser") || name.includes("dropper")) return "#777a7a";
  if (name.includes("black") || name.includes("deepslate") || name.includes("hopper")) return "#303236";
  if (name.includes("redstone") || name.includes("red_")) return "#b81818";
  if (name.includes("slime") || name.includes("lime") || name.includes("green")) return "#5fa64c";
  if (name.includes("honey")) return "#d48b2f";
  if (name.includes("wood") || name.includes("planks") || name.includes("barrel") || name.includes("chest")) return "#a97854";
  return "#8a8d8e";
}

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
    front: ["piston_top.png", "piston_top_normal.png"],
    back: ["piston_bottom.png", "piston_side.png"]
  },
  sticky_piston: {
    top: ["piston_top_sticky.png", "piston_top.png"],
    side: ["piston_side.png"],
    front: ["piston_top_sticky.png", "piston_top.png"],
    back: ["piston_bottom.png", "piston_side.png"]
  },
  observer: {
    top: ["observer_top.png"],
    side: ["observer_side.png"],
    front: ["observer_front.png"],
    back: ["observer_back.png", "observer_back_on.png"]
  },
  dispenser: {
    top: ["furnace_top.png"],
    side: ["furnace_side.png"],
    front: ["dispenser_front.png", "dispenser_front_vertical.png"],
    back: ["furnace_side.png"]
  },
  dropper: {
    top: ["furnace_top.png"],
    side: ["furnace_side.png"],
    front: ["dropper_front.png", "dropper_front_vertical.png"],
    back: ["furnace_side.png"]
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
  },
  target: {
    top: ["target_top.png"],
    side: ["target_side.png"],
    front: ["target_side.png"],
    back: ["target_side.png"]
  },
  command_block: {
    top: ["command_block_side.png"],
    side: ["command_block_side.png"],
    front: ["command_block_front.png"],
    back: ["command_block_back.png"]
  },
  chain_command_block: {
    top: ["chain_command_block_side.png"],
    side: ["chain_command_block_side.png"],
    front: ["chain_command_block_front.png"],
    back: ["chain_command_block_back.png"]
  },
  repeating_command_block: {
    top: ["repeating_command_block_side.png"],
    side: ["repeating_command_block_side.png"],
    front: ["repeating_command_block_front.png"],
    back: ["repeating_command_block_back.png"]
  },
  furnace: {
    top: ["furnace_top.png"],
    side: ["furnace_side.png"],
    front: ["furnace_front.png"],
    back: ["furnace_side.png"]
  },
  blast_furnace: {
    top: ["blast_furnace_top.png"],
    side: ["blast_furnace_side.png"],
    front: ["blast_furnace_front.png"],
    back: ["blast_furnace_side.png"]
  },
  smoker: {
    top: ["smoker_top.png"],
    side: ["smoker_side.png"],
    front: ["smoker_front.png"],
    back: ["smoker_side.png"]
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

function tintColorFor(key) {
  const name = String(key || "").toLowerCase();
  if (name.includes("redstone")) return "#b80f0f";
  if (name.includes("grass") || name.includes("leaves") || name.includes("vine")) return "#5fa64c";
  if (name.includes("water")) return "#4a74d6";
  return "#ffffff";
}

function tintCanvas(image, color, fallbackKey = "") {
  if (color === "#ffffff") return image;
  const canvas = createCanvas(image.width || 16, image.height || 16);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = color;
  ctx.globalAlpha = String(fallbackKey).toLowerCase().includes("redstone") ? 1 : 0.86;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  return canvas;
}

function firstAnimationFrame(image) {
  if (!image.width || !image.height) return image;
  if (image.height <= image.width || image.height % image.width !== 0) return image;

  const canvas = createCanvas(image.width, image.width);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, image.width, image.width, 0, 0, image.width, image.width);
  return canvas;
}

function normalizeRotation(rotation = 0) {
  return (((Number(rotation) || 0) % 360) + 360) % 360;
}

function rotateCanvas(source, rotation = 0) {
  const normalized = normalizeRotation(rotation);
  if (normalized === 0) return source;

  const swap = normalized === 90 || normalized === 270;
  const canvas = createCanvas(
    swap ? source.height : source.width,
    swap ? source.width : source.height
  );
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((normalized * Math.PI) / 180);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

function cropTextureRegion(image, uv, rotation = 0) {
  if (!uv || uv.length !== 4) return rotateCanvas(image, rotation);

  const [u0, v0, u1, v1] = uv.map(Number);
  if (![u0, v0, u1, v1].every(Number.isFinite)) return rotateCanvas(image, rotation);

  const scaleX = image.width / 16;
  const scaleY = image.height / 16;
  const sourceX = Math.max(0, Math.min(u0, u1) * scaleX);
  const sourceY = Math.max(0, Math.min(v0, v1) * scaleY);
  const sourceWidth = Math.max(1, Math.abs(u1 - u0) * scaleX);
  const sourceHeight = Math.max(1, Math.abs(v1 - v0) * scaleY);
  const width = Math.max(1, Math.round(sourceWidth));
  const height = Math.max(1, Math.round(sourceHeight));
  const flipX = u1 < u0;
  const flipY = v1 < v0;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  ctx.translate(flipX ? width : 0, flipY ? height : 0);
  ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
  ctx.restore();
  return rotateCanvas(canvas, rotation);
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
        const image = firstAnimationFrame(await loadImage(candidate));
        this.cache.set(cacheKey, image);
        return image;
      }
    }

    const color = fallbackColorFor(fallbackKey);
    const canvas = colorCanvas(color, fallbackKey);
    this.cache.set(cacheKey, canvas);
    return canvas;
  }

  async loadTextureRef(textureRef, fallbackKey = "stone", options = {}) {
    const fileName = textureFileName(textureRef);
    const base = fileName ? path.basename(fileName) : null;
    const tint = options.tint ? tintColorFor(fallbackKey) : null;
    const cacheKey = `texture:${fileName || fallbackKey}:${tint || "plain"}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    const image = await this.loadTexture(
      `texture:${fileName || fallbackKey}`,
      fileName ? unique([fileName, base, "missing.png"]) : ["missing.png"],
      fallbackKey
    );

    if (!tint) return image;

    const tinted = tintCanvas(image, tint, fallbackKey);
    this.cache.set(cacheKey, tinted);
    return tinted;
  }

  async loadTextureRegion(textureRef, fallbackKey = "stone", options = {}) {
    const rotation = normalizeRotation(options.rotation || 0);
    const uv = Array.isArray(options.uv) ? options.uv.map(Number) : null;
    if (!uv && rotation === 0) {
      return this.loadTextureRef(textureRef, fallbackKey, options);
    }

    const fileName = textureFileName(textureRef);
    const tint = options.tint ? tintColorFor(fallbackKey) : null;
    const cacheKey = `region:${fileName || fallbackKey}:${tint || "plain"}:${uv?.join(",") || "full"}:${rotation}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    const image = await this.loadTextureRef(textureRef, fallbackKey, {
      tint: options.tint
    });
    const region = cropTextureRegion(image, uv, rotation);
    this.cache.set(cacheKey, region);
    return region;
  }

  faceCandidates(blockName, face) {
    const key = baseName(blockName);
    const special = specialTextures[blockName]?.[face] || [];
    const generic =
      face === "top"
        ? [`${key}_top.png`, `${key}.png`, `${key}_side.png`]
        : face === "front"
          ? [`${key}_front.png`, `${key}_side.png`, `${key}.png`, `${key}_top.png`]
          : face === "back"
            ? [`${key}_back.png`, `${key}_side.png`, `${key}.png`, `${key}_front.png`]
            : [`${key}_side.png`, `${key}.png`, `${key}_front.png`, `${key}_top.png`];

    return unique([...special, ...generic, "missing.png"]);
  }

  async getFaces(blockName) {
    const key = baseName(blockName);
    const [top, side, front, back] = await Promise.all([
      this.loadTexture(`${key}:top`, this.faceCandidates(blockName, "top"), key),
      this.loadTexture(`${key}:side`, this.faceCandidates(blockName, "side"), key),
      this.loadTexture(`${key}:front`, this.faceCandidates(blockName, "front"), key),
      this.loadTexture(`${key}:back`, this.faceCandidates(blockName, "back"), key)
    ]);
    return { top, side, front, back };
  }

  async get(blockName) {
    return (await this.getFaces(blockName)).top;
  }
}
