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
    top: await loadModelFace(element.top),
    left: await loadModelFace(element.left),
    right: await loadModelFace(element.right),
    raw: rawBlockName,
  })));
}

async function loadModelFace(face) {
  if (!face?.texture) return null;
  return {
    image: await getTexture(face.texture.replace('.png', '')),
    uv: face.uv,
    rotation: face.rotation ?? 0,
  };
}

function drawModel(ctx, cx, cy, faces, halfWidth, quarterHeight, blockHeight, scaleRatio) {
  const elements = [...faces.elements].sort((a, b) => {
    const ac = elementCenter(a);
    const bc = elementCenter(b);
    if (ac.y !== bc.y) return ac.y - bc.y;
    return (bc.z - bc.x) - (ac.z - ac.x);
  });

  for (const element of elements) {
    drawModelElement(ctx, cx, cy, element, halfWidth, quarterHeight, blockHeight, scaleRatio);
  }
}

function drawModelElement(ctx, cx, cy, element, halfWidth, quarterHeight, blockHeight, scaleRatio) {
  const [fx, fy, fz] = element.from.map(value => value / 16);
  const [tx, ty, tz] = element.to.map(value => value / 16);

  const top = [
    projectModelPoint(cx, cy, fx, ty, fz, halfWidth, quarterHeight, blockHeight),
    projectModelPoint(cx, cy, tx, ty, fz, halfWidth, quarterHeight, blockHeight),
    projectModelPoint(cx, cy, fx, ty, tz, halfWidth, quarterHeight, blockHeight),
  ];
  drawParallelogramFace(ctx, element.top, element.raw, SHADE_TOP, top);

  const south = [
    projectModelPoint(cx, cy, fx, ty, tz, halfWidth, quarterHeight, blockHeight),
    projectModelPoint(cx, cy, tx, ty, tz, halfWidth, quarterHeight, blockHeight),
    projectModelPoint(cx, cy, fx, fy, tz, halfWidth, quarterHeight, blockHeight),
  ];
  drawParallelogramFace(ctx, element.left, element.raw, SHADE_LEFT, south);

  const east = [
    projectModelPoint(cx, cy, tx, ty, tz, halfWidth, quarterHeight, blockHeight),
    projectModelPoint(cx, cy, tx, ty, fz, halfWidth, quarterHeight, blockHeight),
    projectModelPoint(cx, cy, tx, fy, tz, halfWidth, quarterHeight, blockHeight),
  ];
  drawParallelogramFace(ctx, element.right, element.raw, SHADE_RIGHT, east);
}

function projectModelPoint(cx, cy, x, y, z, halfWidth, quarterHeight, blockHeight) {
  return {
    x: cx + (x - z) * halfWidth,
    y: cy + (x + z) * quarterHeight - (y - 1) * blockHeight,
  };
}

function drawParallelogramFace(ctx, face, rawBlockName, shade, points) {
  if (!face) return;

  const [origin, axisX, axisY] = points;
  ctx.save();
  ctx.setTransform(
    (axisX.x - origin.x) / N,
    (axisX.y - origin.y) / N,
    (axisY.x - origin.x) / N,
    (axisY.y - origin.y) / N,
    origin.x,
    origin.y,
  );
  drawFace(ctx, face.image, rawBlockName, shade, face.uv, face.rotation);
  ctx.restore();
}

function elementCenter(element) {
  return {
    x: (element.from[0] + element.to[0]) / 32,
    y: (element.from[1] + element.to[1]) / 32,
    z: (element.from[2] + element.to[2]) / 32,
  };
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

function drawFace(ctx, image, rawBlockName, shade, uv = null, rotation = 0) {
  if (image) {
    const source = textureSource(image, uv);

    faceCtx.globalCompositeOperation = 'source-over';
    faceCtx.setTransform(1, 0, 0, 1, 0, 0);
    faceCtx.clearRect(0, 0, N, N);
    faceCtx.save();
    faceCtx.translate(N / 2, N / 2);
    faceCtx.rotate(normalizeDegrees(rotation) * Math.PI / 180);
    faceCtx.scale(source.flipX ? -1 : 1, source.flipY ? -1 : 1);
    faceCtx.drawImage(image, source.x, source.y, source.width, source.height, -N / 2, -N / 2, N, N);
    faceCtx.restore();

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
    return faces.elements.some(element => [element.top, element.left, element.right].some(face => face && !face.image));
  }
  return !faces.top || !faces.left || !faces.right;
}

function textureSource(image, uv) {
  if (!Array.isArray(uv) || uv.length !== 4) {
    return { x: 0, y: 0, width: Math.min(N, image.width), height: Math.min(N, image.height), flipX: false, flipY: false };
  }

  const [u1, v1, u2, v2] = uv;
  const x = Math.max(0, Math.min(image.width, Math.min(u1, u2)));
  const y = Math.max(0, Math.min(image.height, Math.min(v1, v2)));
  const width = Math.max(1, Math.min(image.width - x, Math.abs(u2 - u1)));
  const height = Math.max(1, Math.min(image.height - y, Math.abs(v2 - v1)));
  return { x, y, width, height, flipX: u2 < u1, flipY: v2 < v1 };
}

function normalizeDegrees(degrees) {
  return ((Number(degrees) % 360) + 360) % 360;
}
