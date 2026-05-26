import fs from "node:fs/promises";
import { createCanvas } from "canvas";
import sharp from "sharp";
import { TextureManager } from "./textures.js";

const TILE_W = 32;
const TILE_H = 16;
const BLOCK_H = 28;
const FACE_SHADE = {
  top: 1.12,
  left: 0.72,
  right: 0.9
};

function iso(x, y, z) {
  return {
    x: (x - z) * (TILE_W / 2),
    y: (x + z) * (TILE_H / 2) - y * BLOCK_H
  };
}

function shade(ctx, points, amount) {
  ctx.save();
  ctx.globalCompositeOperation = amount > 1 ? "screen" : "multiply";
  ctx.fillStyle =
    amount > 1
      ? `rgba(255,255,255,${Math.min(0.22, amount - 1)})`
      : `rgba(0,0,0,${Math.min(0.5, 1 - amount)})`;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function clipPoly(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.closePath();
  ctx.clip();
}

function drawTexturedFace(ctx, texture, points, shadeAmount, alpha = 1) {
  const width = texture.width || 16;
  const height = texture.height || 16;
  const p0 = points[0];
  const p1 = points[1];
  const p3 = points[3];

  ctx.save();
  clipPoly(ctx, points);
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = false;
  ctx.transform(
    (p1.x - p0.x) / width,
    (p1.y - p0.y) / width,
    (p3.x - p0.x) / height,
    (p3.y - p0.y) / height,
    p0.x,
    p0.y
  );
  ctx.drawImage(texture, 0, 0, width, height);
  ctx.restore();

  shade(ctx, points, shadeAmount);
  ctx.strokeStyle = "rgba(0,0,0,0.26)";
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.closePath();
  ctx.stroke();
}

function shapeFor(block) {
  const name = block.name;
  const props = block.properties || {};
  const base = {
    xOffset: 0,
    yOffset: 0,
    zOffset: 0,
    width: 1,
    height: 1,
    length: 1,
    topOnly: false,
    fullCube: true,
    alpha: name.includes("glass") || name === "water" ? 0.68 : 1
  };

  if (name.endsWith("_slab") && props.type !== "double") {
    return {
      ...base,
      yOffset: props.type === "top" ? 0.5 : 0,
      height: 0.5,
      fullCube: false
    };
  }

  if (
    name === "redstone_wire" ||
    name.endsWith("_carpet") ||
    name.endsWith("_pressure_plate") ||
    name.endsWith("_rail")
  ) {
    return {
      ...base,
      xOffset: 0.04,
      zOffset: 0.04,
      width: 0.92,
      length: 0.92,
      height: 0.05,
      topOnly: true,
      fullCube: false
    };
  }

  if (name === "repeater" || name === "comparator") {
    return {
      ...base,
      xOffset: 0.03,
      zOffset: 0.03,
      width: 0.94,
      length: 0.94,
      height: 0.13,
      fullCube: false
    };
  }

  if (name.endsWith("_button")) {
    return {
      ...base,
      xOffset: 0.25,
      zOffset: 0.25,
      width: 0.5,
      length: 0.5,
      height: 0.16,
      fullCube: false
    };
  }

  if (name.endsWith("_torch") || name === "torch") {
    return {
      ...base,
      xOffset: 0.38,
      zOffset: 0.38,
      width: 0.24,
      length: 0.24,
      height: 0.72,
      fullCube: false
    };
  }

  return base;
}

function blockFaces(block, shape, ox, oy) {
  const x0 = block.rx + shape.xOffset;
  const y0 = block.ry + shape.yOffset;
  const z0 = block.rz + shape.zOffset;
  const x1 = x0 + shape.width;
  const y1 = y0 + shape.height;
  const z1 = z0 + shape.length;

  const p000 = iso(x0, y0, z0);
  const p100 = iso(x1, y0, z0);
  const p010 = iso(x0, y1, z0);
  const p110 = iso(x1, y1, z0);
  const p001 = iso(x0, y0, z1);
  const p011 = iso(x0, y1, z1);
  const p101 = iso(x1, y0, z1);
  const p111 = iso(x1, y1, z1);
  const t = (p) => ({ x: p.x + ox, y: p.y + oy });

  return {
    top: [t(p010), t(p110), t(p111), t(p011)],
    left: [t(p011), t(p111), t(p101), t(p001)],
    right: [t(p110), t(p010), t(p000), t(p100)]
  };
}

function drawShadow(ctx, blocks, ox, oy) {
  const ground = new Set(blocks.map((block) => `${block.rx},${block.rz}`));
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.filter = "blur(2px)";
  for (const key of ground) {
    const [x, z] = key.split(",").map(Number);
    const points = [
      iso(x, 0, z),
      iso(x + 1, 0, z),
      iso(x + 1, 0, z + 1),
      iso(x, 0, z + 1)
    ].map((point) => ({
      x: point.x + ox + 10,
      y: point.y + oy + 16
    }));
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function projectedBounds(size) {
  const corners = [];
  for (const x of [0, size.width]) {
    for (const y of [0, size.height]) {
      for (const z of [0, size.length]) {
        corners.push(iso(x, y, z));
      }
    }
  }
  return {
    minX: Math.min(...corners.map((point) => point.x)),
    maxX: Math.max(...corners.map((point) => point.x)),
    minY: Math.min(...corners.map((point) => point.y)),
    maxY: Math.max(...corners.map((point) => point.y))
  };
}

export async function renderIsometric(schematic, options) {
  const textures = new TextureManager(options.textureRoot);
  const { bounds, size } = schematic;
  const margin = 144;
  const projected = projectedBounds(size);
  const canvas = createCanvas(
    Math.ceil(projected.maxX - projected.minX + margin * 2),
    Math.ceil(projected.maxY - projected.minY + margin * 2)
  );
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;

  const ox = margin - projected.minX;
  const oy = margin - projected.minY;
  const normalized = schematic.blocks
    .map((block) => ({
      ...block,
      rx: block.x - bounds.minX,
      ry: block.y - bounds.minY,
      rz: block.z - bounds.minZ,
      shape: shapeFor(block)
    }))
    .sort((a, b) => a.rx + a.rz + a.ry - (b.rx + b.rz + b.ry));

  const solidOccupied = new Set(
    normalized
      .filter((block) => block.shape.fullCube && block.shape.alpha === 1)
      .map((block) => `${block.rx},${block.ry},${block.rz}`)
  );

  drawShadow(ctx, normalized, ox, oy);

  for (const block of normalized) {
    const faces = await textures.getFaces(block.name);
    const shape = block.shape;
    const geometry = blockFaces(block, shape, ox, oy);
    const hasAbove = solidOccupied.has(`${block.rx},${block.ry + 1},${block.rz}`);
    const hasLeftNeighbor = solidOccupied.has(`${block.rx},${block.ry},${block.rz + 1}`);
    const hasRightNeighbor = solidOccupied.has(`${block.rx + 1},${block.ry},${block.rz}`);

    if (!shape.topOnly && (!shape.fullCube || !hasLeftNeighbor)) {
      drawTexturedFace(ctx, faces.side, geometry.left, FACE_SHADE.left, shape.alpha);
    }
    if (!shape.topOnly && (!shape.fullCube || !hasRightNeighbor)) {
      drawTexturedFace(ctx, faces.front, geometry.right, FACE_SHADE.right, shape.alpha);
    }
    if (!shape.fullCube || !hasAbove) {
      drawTexturedFace(ctx, faces.top, geometry.top, FACE_SHADE.top, shape.alpha);
    }
  }

  const rawPng = canvas.toBuffer("image/png");
  const finalPng = await sharp(rawPng)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
    .extend({
      top: 64,
      bottom: 64,
      left: 64,
      right: 64,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .resize({
      width: Math.min(1800, canvas.width * 2),
      kernel: sharp.kernel.nearest,
      withoutEnlargement: false
    })
    .png({ quality: 100, compressionLevel: 9 })
    .toBuffer();
  await fs.writeFile(options.outputPath, finalPng);

  return {
    outputPath: options.outputPath,
    size,
    nonAirVolume: schematic.nonAirVolume,
    boundingVolume: schematic.boundingVolume
  };
}
