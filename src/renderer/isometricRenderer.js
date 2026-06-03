import { createCanvas } from 'canvas';
import { getBlockColor } from './blockColors.js';

const TW = 32;
const TH = 16;
const SH = 16;
const PADDING = 24;

export async function renderIsometric(parsed) {
  const visible = [];
  const airIndex = parsed.palette.findIndex(b => b.name.split('[')[0] === 'minecraft:air');

  for (let y = 0; y < parsed.size.y; y += 1) {
    for (let z = 0; z < parsed.size.z; z += 1) {
      for (let x = 0; x < parsed.size.x; x += 1) {
        const index = x + z * parsed.size.x + y * parsed.size.x * parsed.size.z;
        const paletteIndex = parsed.blocks[index];
        if (paletteIndex === airIndex) continue;
        const paletteEntry = parsed.palette[paletteIndex];
        if (!paletteEntry) continue;
        const colorEntry = getBlockColor(paletteEntry.name);
        if (!colorEntry) continue;
        visible.push({ x, y, z, color: colorEntry });
      }
    }
  }

  if (!visible.length) {
    const canvas = createCanvas(128, 128);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toBuffer('image/png');
  }

  const projected = visible.map(block => ({ ...block, ...project(block.x, block.y, block.z) }));
  const bounds = getBounds(projected);
  const width = Math.ceil(bounds.maxX - bounds.minX + PADDING * 2);
  const height = Math.ceil(bounds.maxY - bounds.minY + PADDING * 2);
  let canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  projected
    .sort((a, b) => a.y - b.y || (a.x + a.z) - (b.x + b.z))
    .forEach(block => {
      const cx = block.sx - bounds.minX + PADDING;
      const cy = block.sy - bounds.minY + PADDING;
      drawBlock(ctx, cx, cy, block.color);
    });

  const buffer = canvas.toBuffer('image/png', { compressionLevel: 9 });
  canvas = null;
  return buffer;
}

function project(bx, by, bz) {
  return {
    sx: (bx - bz) * (TW / 2),
    sy: (bx + bz) * (TH / 2) - by * SH,
  };
}

function getBounds(blocks) {
  const xs = [];
  const ys = [];
  for (const block of blocks) {
    xs.push(block.sx - TW / 2, block.sx + TW / 2);
    ys.push(block.sy, block.sy + TH + SH);
  }
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function drawBlock(ctx, cx, cy, color) {
  if (!color) return;
  drawFace(ctx, [
    [cx, cy],
    [cx + TW / 2, cy + TH / 2],
    [cx, cy + TH],
    [cx - TW / 2, cy + TH / 2],
  ], shade(color.top, 1), shade(color.top, 0.65));
  drawFace(ctx, [
    [cx - TW / 2, cy + TH / 2],
    [cx, cy + TH],
    [cx, cy + TH + SH],
    [cx - TW / 2, cy + TH / 2 + SH],
  ], shade(color.left, 0.7), shade(color.left, 0.5));
  drawFace(ctx, [
    [cx, cy + TH],
    [cx + TW / 2, cy + TH / 2],
    [cx + TW / 2, cy + TH / 2 + SH],
    [cx, cy + TH + SH],
  ], shade(color.right, 0.85), shade(color.right, 0.55));
}

function drawFace(ctx, points, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function shade(hex, factor) {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * factor)));
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}
