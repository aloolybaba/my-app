import { createCanvas } from 'canvas';
import { getBlockColor } from './blockColors.js';

const MAX_CANVAS_SIDE = 4096;
const PAD = 20;

export async function renderIsometric(schematic) {
  const { blocks, palette, size } = schematic;
  const { x: sizeX, y: sizeY, z: sizeZ } = size;

  const drawList = [];
  for (let y = 0; y < sizeY; y += 1) {
    for (let z = 0; z < sizeZ; z += 1) {
      for (let x = 0; x < sizeX; x += 1) {
        const index = x + z * sizeX + y * (sizeX * sizeZ);
        const paletteIndex = blocks[index];
        if (paletteIndex === undefined || paletteIndex >= palette.length) continue;

        const color = getBlockColor(palette[paletteIndex]?.name);
        if (!color) continue;
        drawList.push({ x, y, z, color });
      }
    }
  }

  if (!drawList.length) {
    const canvas = createCanvas(128, 128);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toBuffer('image/png');
  }

  if (process.env.DEBUG_BLOCKS === 'true') {
    logUnknownBlocks(drawList, blocks, palette, sizeX, sizeZ);
  }

  drawList.sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return (b.z - b.x) - (a.z - a.x);
  });

  let halfWidth = 16;
  let quarterHeight = 8;
  let blockHeight = 16;
  let bounds = calculateBounds(drawList, halfWidth, quarterHeight, blockHeight);

  let canvasWidth = bounds.maxX - bounds.minX + halfWidth * 2 + PAD * 2;
  let canvasHeight = bounds.maxY - bounds.minY + blockHeight + quarterHeight + PAD * 2;

  if (Math.ceil(canvasWidth) > MAX_CANVAS_SIDE || Math.ceil(canvasHeight) > MAX_CANVAS_SIDE) {
    const scaleFactor = Math.min(
      MAX_CANVAS_SIDE / Math.ceil(canvasWidth),
      MAX_CANVAS_SIDE / Math.ceil(canvasHeight),
    );

    halfWidth = Math.max(1, Math.floor(halfWidth * scaleFactor));
    quarterHeight = Math.max(1, Math.floor(quarterHeight * scaleFactor));
    blockHeight = Math.max(1, Math.floor(blockHeight * scaleFactor));

    bounds = calculateBounds(drawList, halfWidth, quarterHeight, blockHeight);
    canvasWidth = bounds.maxX - bounds.minX + halfWidth * 2 + PAD * 2;
    canvasHeight = bounds.maxY - bounds.minY + blockHeight + quarterHeight + PAD * 2;
  }

  const canvas = createCanvas(Math.ceil(canvasWidth), Math.ceil(canvasHeight));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const offsetX = -bounds.minX + PAD;
  const offsetY = -bounds.minY + PAD;

  for (const { x, y, z, color } of drawList) {
    const cx = (x - z) * halfWidth + offsetX;
    const cy = (x + z) * quarterHeight - y * blockHeight + offsetY;
    drawBlock(ctx, cx, cy, color, halfWidth, quarterHeight, blockHeight);
  }

  return canvas.toBuffer('image/png', { compressionLevel: 9 });
}

function calculateBounds(drawList, halfWidth, quarterHeight, blockHeight) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const { x, y, z } of drawList) {
    const screenX = (x - z) * halfWidth;
    const screenY = (x + z) * quarterHeight - y * blockHeight;
    minX = Math.min(minX, screenX);
    minY = Math.min(minY, screenY);
    maxX = Math.max(maxX, screenX);
    maxY = Math.max(maxY, screenY);
  }

  return { minX, minY, maxX, maxY };
}

function drawBlock(ctx, cx, cy, color, halfWidth, quarterHeight, blockHeight) {
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + halfWidth, cy + quarterHeight);
  ctx.lineTo(cx, cy + quarterHeight * 2);
  ctx.lineTo(cx - halfWidth, cy + quarterHeight);
  ctx.closePath();
  ctx.fillStyle = color.top;
  ctx.fill();
  ctx.strokeStyle = darken(color.top, 0.75);
  ctx.lineWidth = 0.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - halfWidth, cy + quarterHeight);
  ctx.lineTo(cx, cy + quarterHeight * 2);
  ctx.lineTo(cx, cy + quarterHeight * 2 + blockHeight);
  ctx.lineTo(cx - halfWidth, cy + quarterHeight + blockHeight);
  ctx.closePath();
  ctx.fillStyle = color.left;
  ctx.fill();
  ctx.strokeStyle = darken(color.left, 0.75);
  ctx.lineWidth = 0.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx, cy + quarterHeight * 2);
  ctx.lineTo(cx + halfWidth, cy + quarterHeight);
  ctx.lineTo(cx + halfWidth, cy + quarterHeight + blockHeight);
  ctx.lineTo(cx, cy + quarterHeight * 2 + blockHeight);
  ctx.closePath();
  ctx.fillStyle = color.right;
  ctx.fill();
  ctx.strokeStyle = darken(color.right, 0.75);
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

function darken(hex, factor) {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function logUnknownBlocks(drawList, blocks, palette, sizeX, sizeZ) {
  const unknown = new Set();

  for (const { x, y, z } of drawList) {
    const index = x + z * sizeX + y * (sizeX * sizeZ);
    const name = palette[blocks[index]]?.name;
    if (name && !getBlockColor(name)) unknown.add(name);
  }

  if (unknown.size > 0) {
    console.warn('[RENDERER] Blocks with no colour entry:');
    for (const name of [...unknown].sort()) console.warn('  -', name);
  }
}
