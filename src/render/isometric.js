import fs from "node:fs/promises";
import { createCanvas } from "canvas";
import sharp from "sharp";
import { TextureManager } from "./textures.js";

const TILE_W = 32;
const TILE_H = 16;
const BLOCK_H = 24;
const FACE_SHADE = {
  top: 1.14,
  left: 0.78,
  right: 0.92
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
      ? `rgba(255,255,255,${Math.min(0.24, amount - 1)})`
      : `rgba(0,0,0,${Math.min(0.45, 1 - amount)})`;
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

function drawTexturedFace(ctx, texture, points, shadeAmount) {
  ctx.save();
  clipPoly(ctx, points);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(texture, minX, minY, maxX - minX, maxY - minY);
  ctx.restore();
  shade(ctx, points, shadeAmount);
  ctx.strokeStyle = "rgba(0,0,0,0.10)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.closePath();
  ctx.stroke();
}

function blockFaces(x, y, z, ox, oy) {
  const p000 = iso(x, y, z);
  const p100 = iso(x + 1, y, z);
  const p010 = iso(x, y + 1, z);
  const p110 = iso(x + 1, y + 1, z);
  const p001 = iso(x, y, z + 1);
  const p011 = iso(x, y + 1, z + 1);
  const p101 = iso(x + 1, y, z + 1);
  const p111 = iso(x + 1, y + 1, z + 1);
  const t = (p) => ({ x: p.x + ox, y: p.y + oy });
  return {
    top: [t(p010), t(p110), t(p111), t(p011)],
    left: [t(p011), t(p111), t(p101), t(p001)],
    right: [t(p110), t(p010), t(p000), t(p100)]
  };
}

export async function renderIsometric(schematic, options) {
  const textures = new TextureManager(options.textureRoot);
  const { bounds, size } = schematic;
  const margin = 96;
  const projected = [
    iso(0, 0, 0),
    iso(size.width, 0, 0),
    iso(0, 0, size.length),
    iso(size.width, 0, size.length),
    iso(0, size.height, 0),
    iso(size.width, size.height, size.length)
  ];
  const minPX = Math.min(...projected.map((p) => p.x));
  const maxPX = Math.max(...projected.map((p) => p.x));
  const minPY = Math.min(...projected.map((p) => p.y));
  const maxPY = Math.max(...projected.map((p) => p.y));
  const canvas = createCanvas(
    Math.ceil(maxPX - minPX + margin * 2),
    Math.ceil(maxPY - minPY + margin * 2)
  );
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;

  const ox = margin - minPX;
  const oy = margin - minPY;
  const normalized = schematic.blocks
    .map((block) => ({
      ...block,
      rx: block.x - bounds.minX,
      ry: block.y - bounds.minY,
      rz: block.z - bounds.minZ
    }))
    .sort((a, b) => a.rx + a.rz + a.ry - (b.rx + b.rz + b.ry));

  for (const block of normalized) {
    const texture = await textures.get(block.name);
    const faces = blockFaces(block.rx, block.ry, block.rz, ox, oy);
    drawTexturedFace(ctx, texture, faces.left, FACE_SHADE.left);
    drawTexturedFace(ctx, texture, faces.right, FACE_SHADE.right);
    drawTexturedFace(ctx, texture, faces.top, FACE_SHADE.top);
  }

  const rawPng = canvas.toBuffer("image/png");
  const finalPng = await sharp(rawPng)
    .resize({ width: Math.min(1800, canvas.width * 2), withoutEnlargement: false })
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
