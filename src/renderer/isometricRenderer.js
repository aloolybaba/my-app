import { createCanvas } from 'canvas';
import { getTexture } from './textureManager.js';
import { resolveFaces } from './blockFaceResolver.js';
import { getBlockColor } from './blockColors.js';
import { log } from '../utils/logger.js';

const N = 16;
const HW = 16;
const QH = 8;
const BH = 16;
const PAD = 24;
const MAX_CANVAS = 4096;

const SHADE_TOP = 1.0;
const SHADE_LEFT = 0.6;
const SHADE_RIGHT = 0.8;

const faceCanvas = createCanvas(N, N);
const faceCtx = faceCanvas.getContext('2d');
faceCtx.imageSmoothingEnabled = false;

export async function renderSchematic(schematic) {
  const { blocks, palette, size } = schematic;
  const { x: sizeX, y: sizeY, z: sizeZ } = size;

  const airIndex = palette.findIndex(block => block.name === 'minecraft:air');
  const faceCache = new Map();

  for (let i = 0; i < palette.length; i += 1) {
    if (i === airIndex) continue;
    const raw = palette[i].rawName ?? palette[i].name;
    const faces = resolveFaces(raw);

    if (faces.shape === 'model') {
      faceCache.set(i, {
        raw,
        shape: 'model',
        elements: await loadModelElements(faces.elements, raw),
      });
      continue;
    }

    const [top, left, right] = await Promise.all([
      getTexture(faces.top?.replace('.png', '')),
      getTexture(faces.left?.replace('.png', '')),
      getTexture(faces.right?.replace('.png', '')),
    ]);
    faceCache.set(i, {
      top,
      left,
      right,
      raw,
      shape: faces.shape ?? 'cube',
      half: faces.half ?? 'bottom',
      side: faces.side ?? 'both',
      facing: faces.facing ?? 'north',
    });
  }

  const drawList = [];
  for (let y = 0; y < sizeY; y += 1) {
    for (let z = 0; z < sizeZ; z += 1) {
      for (let x = 0; x < sizeX; x += 1) {
        const index = x + z * sizeX + y * (sizeX * sizeZ);
        const paletteIndex = blocks[index];
        if (paletteIndex === airIndex || !faceCache.has(paletteIndex)) continue;
        drawList.push({ x, y, z, paletteIndex });
      }
    }
  }

  if (!drawList.length) {
    throw new Error('Schematic contains no non-air blocks to render.');
  }

  if (process.env.DEBUG_BLOCKS === 'true') {
    logTextureMisses(faceCache);
  }

  drawList.sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return (b.z - b.x) - (a.z - a.x);
  });

  let tileHW = HW;
  let tileQH = QH;
  let tileBH = BH;
  let bounds = calculateBounds(drawList, tileHW, tileQH, tileBH);
  let canvasWidth = bounds.maxX - bounds.minX + tileHW * 2 + PAD * 2;
  let canvasHeight = bounds.maxY - bounds.minY + tileBH + tileQH * 2 + PAD * 2;

  if (canvasWidth > MAX_CANVAS || canvasHeight > MAX_CANVAS) {
    const scale = Math.min(MAX_CANVAS / canvasWidth, MAX_CANVAS / canvasHeight);
    tileHW = Math.max(1, Math.floor(HW * scale));
    tileQH = Math.max(1, Math.floor(QH * scale));
    tileBH = Math.max(1, Math.floor(BH * scale));

    bounds = calculateBounds(drawList, tileHW, tileQH, tileBH);
    canvasWidth = bounds.maxX - bounds.minX + tileHW * 2 + PAD * 2;
    canvasHeight = bounds.maxY - bounds.minY + tileBH + tileQH * 2 + PAD * 2;
  }

  const canvas = createCanvas(Math.ceil(canvasWidth), Math.ceil(canvasHeight));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const offsetX = -bounds.minX + PAD;
  const offsetY = -bounds.minY + PAD;
  const scaleRatio = tileHW / HW;

  for (const { x, y, z, paletteIndex } of drawList) {
    const cx = (x - z) * tileHW + offsetX;
    const cy = (x + z) * tileQH - y * tileBH + offsetY;
    drawBlock(ctx, cx, cy, faceCache.get(paletteIndex), tileHW, tileQH, tileBH, scaleRatio);
  }

  return canvas.toBuffer('image/png', { compressionLevel: 9 });
}

export const renderIsometric = renderSchematic;

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

function drawBlock(ctx, cx, cy, faces, halfWidth, quarterHeight, blockHeight, scaleRatio) {
  if (faces.shape === 'top_flat') {
    drawTopFace(ctx, cx, cy + blockHeight - 1, faces, scaleRatio);
    return;
  }

  if (faces.shape === 'side_flat') {
    drawVisibleSides(ctx, cx, cy, faces, halfWidth, quarterHeight, scaleRatio, 1);
    return;
  }

  if (faces.shape === 'cross') {
    drawSideFace(ctx, cx, cy, faces.left, faces.raw, SHADE_LEFT, 'left', halfWidth, quarterHeight, scaleRatio, 1);
    drawSideFace(ctx, cx, cy, faces.right, faces.raw, SHADE_RIGHT, 'right', halfWidth, quarterHeight, scaleRatio, 1);
    return;
  }

  if (faces.shape === 'slab') {
    const slabCy = faces.half === 'top' ? cy : cy + blockHeight / 2;
    drawCube(ctx, cx, slabCy, faces, halfWidth, quarterHeight, scaleRatio, 0.5);
    return;
  }

  if (faces.shape === 'stairs') {
    drawStairs(ctx, cx, cy, faces, halfWidth, quarterHeight, blockHeight, scaleRatio);
    return;
  }

  if (faces.shape === 'model') {
    drawModel(ctx, cx, cy, faces, halfWidth, quarterHeight, blockHeight, scaleRatio);
    return;
  }

  drawCube(ctx, cx, cy, faces, halfWidth, quarterHeight, scaleRatio, 1);
}

async function loadModelElements(elements, rawBlockName) {
  return Promise.all(elements.map(async element => ({
    from: element.from,
    to: element.to,
    top: {
      image: await getTexture(element.top?.texture?.replace('.png', '')),
      uv: element.top?.uv,
    },
    left: {
      image: await getTexture(element.left?.texture?.replace('.png', '')),
      uv: element.left?.uv,
    },
    right: {
      image: await getTexture(element.right?.texture?.replace('.png', '')),
      uv: element.right?.uv,
    },
    raw: rawBlockName,
  })));
}

function drawModel(ctx, cx, cy, faces, halfWidth, quarterHeight, blockHeight, scaleRatio) {
  const elements = [...faces.elements].sort((a, b) => {
    const ay = a.to[1] - a.from[1];
    const by = b.to[1] - b.from[1];
    return ay - by || (a.to[2] - a.to[0]) - (b.to[2] - b.to[0]);
  });

  for (const element of elements) {
    drawModelElement(ctx, cx, cy, element, halfWidth, quarterHeight, blockHeight, scaleRatio);
  }
}

function drawModelElement(ctx, cx, cy, element, halfWidth, quarterHeight, blockHeight, scaleRatio) {
  const fromX = element.from[0] / 16;
  const fromY = element.from[1] / 16;
  const fromZ = element.from[2] / 16;
  const toX = element.to[0] / 16;
  const toY = element.to[1] / 16;
  const toZ = element.to[2] / 16;
  const sizeX = Math.max(0.01, toX - fromX);
  const sizeY = Math.max(0.01, toY - fromY);
  const sizeZ = Math.max(0.01, toZ - fromZ);

  const topX = cx + (fromX - fromZ) * halfWidth;
  const topY = cy + (fromX + fromZ) * quarterHeight - (toY - 1) * blockHeight;
  drawModelTopFace(ctx, topX, topY, element.top, element.raw, scaleRatio, sizeX, sizeZ);

  const leftX = cx + (fromX - toZ) * halfWidth;
  const leftY = cy + (fromX + toZ) * quarterHeight - (toY - 1) * blockHeight;
  drawModelSideFace(ctx, leftX, leftY, element.left, element.raw, SHADE_LEFT, scaleRatio, sizeX, sizeY, 'left');

  const rightX = cx + (toX - toZ) * halfWidth;
  const rightY = cy + (toX + toZ) * quarterHeight - (toY - 1) * blockHeight;
  drawModelSideFace(ctx, rightX, rightY, element.right, element.raw, SHADE_RIGHT, scaleRatio, sizeZ, sizeY, 'right');
}

function drawModelTopFace(ctx, x, y, face, rawBlockName, scaleRatio, sizeX, sizeZ) {
  ctx.save();
  ctx.setTransform(scaleRatio * sizeX, scaleRatio * 0.5 * sizeX, -scaleRatio * sizeZ, scaleRatio * 0.5 * sizeZ, x, y);
  drawFace(ctx, face.image, rawBlockName, SHADE_TOP, face.uv);
  ctx.restore();
}

function drawModelSideFace(ctx, x, y, face, rawBlockName, shade, scaleRatio, widthRatio, heightRatio, side) {
  ctx.save();
  if (side === 'left') {
    ctx.setTransform(scaleRatio * widthRatio, scaleRatio * 0.5 * widthRatio, 0, scaleRatio * heightRatio, x, y);
  } else {
    ctx.setTransform(scaleRatio * widthRatio, -scaleRatio * 0.5 * widthRatio, 0, scaleRatio * heightRatio, x, y);
  }
  drawFace(ctx, face.image, rawBlockName, shade, face.uv);
  ctx.restore();
}

function drawStairs(ctx, cx, cy, faces, halfWidth, quarterHeight, blockHeight, scaleRatio) {
  const baseCy = faces.half === 'top' ? cy : cy + blockHeight / 2;
  drawCube(ctx, cx, baseCy, faces, halfWidth, quarterHeight, scaleRatio, 0.5);

  const lipOffset = stairLipOffset(faces.facing, halfWidth, quarterHeight);
  const lipCy = faces.half === 'top' ? cy + blockHeight / 2 : cy;
  drawTopFace(ctx, cx + lipOffset.x, lipCy + lipOffset.y, faces, scaleRatio);
}

function stairLipOffset(facing, halfWidth, quarterHeight) {
  switch (facing) {
    case 'west':
      return { x: -halfWidth / 2, y: quarterHeight / 2 };
    case 'east':
      return { x: halfWidth / 2, y: -quarterHeight / 2 };
    case 'south':
      return { x: halfWidth / 2, y: quarterHeight / 2 };
    case 'north':
    default:
      return { x: -halfWidth / 2, y: -quarterHeight / 2 };
  }
}

function drawCube(ctx, cx, cy, faces, halfWidth, quarterHeight, scaleRatio, heightRatio) {
  drawTopFace(ctx, cx, cy, faces, scaleRatio);
  drawSideFace(ctx, cx, cy, faces.left, faces.raw, SHADE_LEFT, 'left', halfWidth, quarterHeight, scaleRatio, heightRatio);
  drawSideFace(ctx, cx, cy, faces.right, faces.raw, SHADE_RIGHT, 'right', halfWidth, quarterHeight, scaleRatio, heightRatio);
}

function drawTopFace(ctx, cx, cy, faces, scaleRatio) {
  ctx.save();
  ctx.setTransform(scaleRatio, scaleRatio * 0.5, -scaleRatio, scaleRatio * 0.5, cx, cy);
  drawFace(ctx, faces.top, faces.raw, SHADE_TOP);
  ctx.restore();
}

function drawVisibleSides(ctx, cx, cy, faces, halfWidth, quarterHeight, scaleRatio, heightRatio) {
  if (faces.side === 'left' || faces.side === 'both') {
    drawSideFace(ctx, cx, cy, faces.left, faces.raw, SHADE_LEFT, 'left', halfWidth, quarterHeight, scaleRatio, heightRatio);
  }

  if (faces.side === 'right' || faces.side === 'both') {
    drawSideFace(ctx, cx, cy, faces.right, faces.raw, SHADE_RIGHT, 'right', halfWidth, quarterHeight, scaleRatio, heightRatio);
  }
}

function drawSideFace(ctx, cx, cy, image, rawBlockName, shade, side, halfWidth, quarterHeight, scaleRatio, heightRatio) {
  ctx.save();
  if (side === 'left') {
    ctx.setTransform(scaleRatio, scaleRatio * 0.5, 0, scaleRatio * heightRatio, cx - halfWidth, cy + quarterHeight);
  } else {
    ctx.setTransform(scaleRatio, -scaleRatio * 0.5, 0, scaleRatio * heightRatio, cx, cy + quarterHeight * 2);
  }
  drawFace(ctx, image, rawBlockName, shade);
  ctx.restore();
}

function drawFace(ctx, image, rawBlockName, shade, uv = null) {
  if (image) {
    const source = textureSource(image, uv);
    faceCtx.globalCompositeOperation = 'source-over';
    faceCtx.clearRect(0, 0, N, N);
    faceCtx.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, N, N);
    if (shade < 1) {
      faceCtx.globalCompositeOperation = 'source-atop';
      faceCtx.fillStyle = `rgba(0,0,0,${1 - shade})`;
      faceCtx.fillRect(0, 0, N, N);
      faceCtx.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(faceCanvas, 0, 0, N, N);
    return;
  }

  const color = getBlockColor(rawBlockName);
  const fallback = shade >= 1 ? color?.top : shade >= 0.75 ? color?.right : color?.left;
  ctx.fillStyle = fallback ?? '#808080';
  ctx.fillRect(0, 0, N, N);
}

function logTextureMisses(faceCache) {
  const misses = new Set();
  for (const faces of faceCache.values()) {
    if (hasMissingRequiredTexture(faces)) misses.add(faces.raw);
  }

  if (!misses.size) return;
  log.warn('[RENDERER] Blocks with missing texture faces:');
  for (const block of [...misses].sort()) log.warn(`  - ${block}`);
}

function hasMissingRequiredTexture(faces) {
  if (faces.shape === 'top_flat') return !faces.top;
  if (faces.shape === 'side_flat') {
    if (faces.side === 'left') return !faces.left;
    if (faces.side === 'right') return !faces.right;
    return !faces.left || !faces.right;
  }
  if (faces.shape === 'cross') return !faces.left || !faces.right;
  if (faces.shape === 'model') {
    return faces.elements.some(element => !element.top.image && !element.left.image && !element.right.image);
  }
  return !faces.top || !faces.left || !faces.right;
}

function textureSource(image, uv) {
  if (!Array.isArray(uv) || uv.length !== 4) {
    return { x: 0, y: 0, width: Math.min(N, image.width), height: Math.min(N, image.height) };
  }

  const [u1, v1, u2, v2] = uv;
  const x = Math.max(0, Math.min(image.width, Math.min(u1, u2)));
  const y = Math.max(0, Math.min(image.height, Math.min(v1, v2)));
  const width = Math.max(1, Math.min(image.width - x, Math.abs(u2 - u1)));
  const height = Math.max(1, Math.min(image.height - y, Math.abs(v2 - v1)));
  return { x, y, width, height };
}
