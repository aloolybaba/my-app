import { createCanvas } from 'canvas';
import { getTexture } from './textureManager.js';
import { resolveFaces } from './blockFaceResolver.js';
import { getBlockColor } from './blockColors.js';
import { log } from '../utils/logger.js';

const N = 16;
const BASE_HW = 16;
const BASE_QH = 8;
const BASE_BH = 16;
const RENDER_SCALE = clampNumber(process.env.RENDER_SCALE, 4, 1, 4);
const HW = BASE_HW * RENDER_SCALE;
const QH = BASE_QH * RENDER_SCALE;
const BH = BASE_BH * RENDER_SCALE;
const PAD = 24;
const MAX_CANVAS = clampNumber(process.env.MAX_RENDER_CANVAS, 10000, 2048, 12000);

const SHADE_TOP = 1.0;
const SHADE_LEFT = 0.6;
const SHADE_RIGHT = 0.8;
const FACE_BLEED = N + 0.5;

const faceCanvas = createCanvas(N, N);
const faceCtx = faceCanvas.getContext('2d');
faceCtx.imageSmoothingEnabled = false;

export async function renderSchematic(schematic, options = {}) {
  const { blocks, palette, size } = schematic;
  const { x: sizeX, y: sizeY, z: sizeZ } = size;

  const airIndex = palette.findIndex(block => block.name === 'minecraft:air');
  const paletteInfo = palette.map(block => parsePaletteBlock(block.rawName ?? block.name));
  const faceCache = new Map();

  const baseDrawList = [];
  for (let y = 0; y < sizeY; y += 1) {
    for (let z = 0; z < sizeZ; z += 1) {
      for (let x = 0; x < sizeX; x += 1) {
        const index = x + z * sizeX + y * (sizeX * sizeZ);
        const paletteIndex = blocks[index];
        const info = paletteInfo[paletteIndex];
        if (paletteIndex === airIndex || !info || isAirName(info.name)) continue;

        const raw = getEffectiveRawBlockName(info, x, y, z, blocks, paletteInfo, size, airIndex);
        const renderMode = getBlockRenderMode(raw);
        if (renderMode === 'skip') continue;

        baseDrawList.push({ x, y, z, raw });
      }
    }
  }

  if (!baseDrawList.length) {
    throw new Error('Schematic contains no non-air blocks to render.');
  }

  const viewAngle = resolveViewAngle(baseDrawList, size, options.angle);
  const drawList = baseDrawList.map(entry => rotateDrawEntry(entry, size, viewAngle));

  for (const { raw } of drawList) {
    if (!faceCache.has(raw)) {
      faceCache.set(raw, await loadFaces(raw));
    }
  }

  if (process.env.DEBUG_BLOCKS === 'true') {
    logTextureMisses(faceCache);
  }

  drawList.sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    const sumA = a.x + a.z;
    const sumB = b.x + b.z;
    if (sumA !== sumB) return sumA - sumB;
    return b.z - a.z;
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
  const scaleRatio = tileHW / N;

  ctx.globalAlpha = 1;
  for (const entry of drawList) {
    drawEntry(ctx, entry, faceCache, tileHW, tileQH, tileBH, offsetX, offsetY, scaleRatio);
  }

  return canvas.toBuffer('image/png', { compressionLevel: 9 });
}

export const renderIsometric = renderSchematic;

const VIEW_ANGLES = [0, 90, 180, 270];

function resolveViewAngle(drawList, size, requestedAngle = 'auto') {
  if (requestedAngle !== 'auto') return normalizeViewAngle(requestedAngle);

  let bestAngle = 0;
  let bestScore = Infinity;
  for (const angle of VIEW_ANGLES) {
    const rotated = drawList.map(entry => rotateDrawEntry(entry, size, angle));
    const bounds = calculateBounds(rotated, HW, QH, BH);
    const width = bounds.maxX - bounds.minX + HW * 2 + PAD * 2;
    const height = bounds.maxY - bounds.minY + BH + QH * 2 + PAD * 2;
    const ratio = width / Math.max(1, height);
    const score = Math.max(width, height) + Math.abs(ratio - 1.2) * 1000;
    if (score < bestScore) {
      bestScore = score;
      bestAngle = angle;
    }
  }

  return bestAngle;
}

function normalizeViewAngle(angle) {
  const numeric = Number(angle);
  if (!Number.isFinite(numeric)) return 0;
  return VIEW_ANGLES.includes(numeric) ? numeric : 0;
}

function rotateDrawEntry(entry, size, angle) {
  const { x, z } = rotateHorizontalPosition(entry.x, entry.z, size.x, size.z, angle);
  return {
    x,
    y: entry.y,
    z,
    raw: rotateRawBlockName(entry.raw, angle),
  };
}

function rotateHorizontalPosition(x, z, sizeX, sizeZ, angle) {
  switch (normalizeViewAngle(angle)) {
    case 90:
      return { x: z, z: sizeX - 1 - x };
    case 180:
      return { x: sizeX - 1 - x, z: sizeZ - 1 - z };
    case 270:
      return { x: sizeZ - 1 - z, z: x };
    case 0:
    default:
      return { x, z };
  }
}

function rotateRawBlockName(rawBlockName, angle) {
  const normalizedAngle = normalizeViewAngle(angle);
  if (normalizedAngle === 0) return rawBlockName;

  const parsed = parsePaletteBlock(rawBlockName);
  return formatRawBlockName(parsed.name, rotateBlockStates(parsed.states, normalizedAngle));
}

function rotateBlockStates(states, angle) {
  const output = {};
  for (const [key, value] of Object.entries(states)) {
    const rotatedKey = rotateHorizontalDirection(key, angle);
    output[rotatedKey] = rotateStateValue(key, value, angle);
  }
  return output;
}

function rotateStateValue(key, value, angle) {
  if (value === undefined || value === null) return value;
  if (key === 'axis') return rotateAxis(value, angle);
  if (key === 'rotation') return rotateRotationState(value, angle);
  return rotateDirectionalTokens(String(value), angle);
}

function rotateAxis(value, angle) {
  if (!['x', 'z'].includes(value) || normalizeViewAngle(angle) === 0 || normalizeViewAngle(angle) === 180) return value;
  return value === 'x' ? 'z' : 'x';
}

function rotateRotationState(value, angle) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  const steps = { 0: 0, 90: -4, 180: 8, 270: 4 }[normalizeViewAngle(angle)] ?? 0;
  return String((numeric + steps + 16) % 16);
}

function rotateDirectionalTokens(value, angle) {
  return value
    .split('_')
    .map(token => rotateHorizontalDirection(token, angle))
    .join('_');
}

function rotateHorizontalDirection(direction, angle) {
  const directions = ['north', 'east', 'south', 'west'];
  const index = directions.indexOf(direction);
  if (index === -1) return direction;
  const steps = { 0: 0, 90: -1, 180: 2, 270: 1 }[normalizeViewAngle(angle)] ?? 0;
  return directions[(index + steps + directions.length) % directions.length];
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

function drawEntry(ctx, entry, faceCache, tileHW, tileQH, tileBH, offsetX, offsetY, scaleRatio) {
  const faces = faceCache.get(entry.raw);
  if (!faces) return;

  const heightScale = faces.shape === 'model' ? 1 : getBlockHeightScale(entry.raw);
  const blockHeight = Math.max(1, Math.round(tileBH * heightScale));
  const cx = (entry.x - entry.z) * tileHW + offsetX;
  const cy = (entry.x + entry.z) * tileQH - entry.y * tileBH + offsetY + (tileBH - blockHeight);
  drawBlock(ctx, cx, cy, faces, tileHW, tileQH, blockHeight, scaleRatio);
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

async function loadFaces(raw) {
  const faces = resolveFaces(raw);

  if (faces.shape === 'model') {
    return {
      raw,
      shape: 'model',
      elements: await loadModelElements(faces.elements, raw),
    };
  }

  const [top, left, right] = await Promise.all([
    getTexture(faces.top?.replace('.png', '')),
    getTexture(faces.left?.replace('.png', '')),
    getTexture(faces.right?.replace('.png', '')),
  ]);
  return {
    top,
    left,
    right,
    raw,
    tint: faces.tint ?? null,
    shape: faces.shape ?? 'cube',
    half: faces.half ?? 'bottom',
    side: faces.side ?? 'both',
    facing: faces.facing ?? 'north',
  };
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
    tint: face.tint ?? null,
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
  drawFace(ctx, face.image, rawBlockName, shade, face.uv, face.rotation, face.tint, FACE_BLEED, FACE_BLEED);
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
  drawFace(ctx, faces.top, faces.raw, SHADE_TOP, null, 0, faces.tint, FACE_BLEED, FACE_BLEED);
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
  drawFace(ctx, image, rawBlockName, shade, null, 0, null, FACE_BLEED, FACE_BLEED);
  ctx.restore();
}

function drawFace(ctx, image, rawBlockName, shade, uv = null, rotation = 0, tint = null, width = N, height = N) {
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

    if (tint) {
      faceCtx.globalCompositeOperation = 'source-in';
      faceCtx.fillStyle = tint;
      faceCtx.fillRect(0, 0, N, N);
      faceCtx.globalCompositeOperation = 'source-over';
    }

    if (shade < 1) {
      faceCtx.globalCompositeOperation = 'source-atop';
      faceCtx.fillStyle = `rgba(0,0,0,${1 - shade})`;
      faceCtx.fillRect(0, 0, N, N);
      faceCtx.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(faceCanvas, 0, 0, width, height);
    return;
  }

  const color = getBlockColor(rawBlockName);
  const fallback = shade >= 1 ? color?.top : shade >= 0.75 ? color?.right : color?.left;
  ctx.fillStyle = fallback ?? '#808080';
  ctx.fillRect(0, 0, width, height);
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

const RENDER_SKIP_BLOCKS = new Set(['air', 'cave_air', 'void_air']);

const THIN_HEIGHT_BLOCKS = new Set([
  'repeater',
  'comparator',
  'lever',
  'daylight_detector',
  'cauldron',
  'composter',
]);

function getBlockRenderMode(blockName) {
  const name = cleanBlockName(blockName);
  if (RENDER_SKIP_BLOCKS.has(name)) return 'skip';
  return 'opaque';
}

function getBlockHeightScale(blockName) {
  const name = cleanBlockName(blockName);
  if (name.endsWith('_slab')) return 0.5;
  if (name === 'snow') return 0.125;
  if (name === 'dirt_path' || name === 'farmland') return 0.94;
  if (name === 'cake') return 0.5;
  if (THIN_HEIGHT_BLOCKS.has(name)) return 0.125;
  return 1;
}

function cleanBlockName(blockName) {
  return String(blockName ?? '')
    .replace(/^minecraft:/, '')
    .split('[')[0]
    .trim()
    .toLowerCase();
}

const HORIZONTAL_DIRECTIONS = [
  { key: 'north', dx: 0, dz: -1 },
  { key: 'east', dx: 1, dz: 0 },
  { key: 'south', dx: 0, dz: 1 },
  { key: 'west', dx: -1, dz: 0 },
];

const NON_SOLID_BLOCKS = new Set([
  'air',
  'cave_air',
  'void_air',
  'water',
  'lava',
  'redstone_wire',
  'repeater',
  'comparator',
  'torch',
  'redstone_torch',
  'soul_torch',
  'wall_torch',
  'redstone_wall_torch',
  'soul_wall_torch',
  'lever',
  'ladder',
  'snow',
  'lily_pad',
  'scaffolding',
]);

const NON_SOLID_SUFFIXES = [
  '_button',
  '_pressure_plate',
  '_carpet',
  '_rail',
  '_sapling',
  '_flower',
  '_mushroom',
  '_sign',
  '_hanging_sign',
  '_banner',
  '_bed',
  '_door',
  '_trapdoor',
  '_slab',
  '_stairs',
];

const REDSTONE_COMPONENTS = new Set([
  'redstone_wire',
  'repeater',
  'comparator',
  'redstone_torch',
  'redstone_wall_torch',
]);

function parsePaletteBlock(rawBlockName) {
  const raw = String(rawBlockName ?? 'minecraft:air').toLowerCase().trim();
  const stateStart = raw.indexOf('[');
  const fullName = (stateStart === -1 ? raw : raw.slice(0, stateStart)).trim();
  const name = fullName.replace(/^minecraft:/, '');
  const stateString = stateStart === -1 ? '' : raw.slice(stateStart + 1, raw.lastIndexOf(']'));

  return {
    raw,
    name,
    states: parseStateString(stateString),
  };
}

function parseStateString(stateString) {
  return Object.fromEntries(
    stateString
      .split(',')
      .filter(Boolean)
      .map(part => {
        const [key, value] = part.split('=');
        return [key?.trim(), value?.trim()];
      })
      .filter(([key, value]) => key && value !== undefined),
  );
}

function getEffectiveRawBlockName(info, x, y, z, blocks, paletteInfo, size, airIndex) {
  if (isWallName(info.name)) {
    if (hasStates(info.states, ['north', 'east', 'south', 'west', 'up'])) return info.raw;
    return formatRawBlockName(info.name, inferWallStates(info.states, x, y, z, blocks, paletteInfo, size, airIndex));
  }

  if (isFenceName(info.name)) {
    if (hasStates(info.states, ['north', 'east', 'south', 'west'])) return info.raw;
    return formatRawBlockName(info.name, inferBooleanConnectionStates(info.states, x, y, z, blocks, paletteInfo, size, airIndex, connectsToFence));
  }

  if (isPaneName(info.name)) {
    if (hasStates(info.states, ['north', 'east', 'south', 'west'])) return info.raw;
    return formatRawBlockName(info.name, inferBooleanConnectionStates(info.states, x, y, z, blocks, paletteInfo, size, airIndex, connectsToPane));
  }

  if (info.name === 'fire') {
    const below = getNeighborInfo(x, y, z, 0, -1, 0, blocks, paletteInfo, size, airIndex);
    if (below?.name === 'soul_sand' || below?.name === 'soul_soil') {
      return formatRawBlockName('soul_fire', info.states);
    }
  }

  if (info.name === 'scaffolding') {
    if (hasStates(info.states, ['bottom'])) return info.raw;
    return formatRawBlockName(info.name, inferScaffoldingStates(info.states, x, y, z, blocks, paletteInfo, size, airIndex));
  }

  if (info.name === 'redstone_wire') {
    if (hasStates(info.states, ['north', 'east', 'south', 'west'])) return info.raw;
    return formatRawBlockName(info.name, inferRedstoneStates(info.states, x, y, z, blocks, paletteInfo, size, airIndex));
  }

  return info.raw;
}

function inferWallStates(baseStates, x, y, z, blocks, paletteInfo, size, airIndex) {
  const states = { ...baseStates };
  const connected = {};

  for (const direction of HORIZONTAL_DIRECTIONS) {
    if (baseStates[direction.key] !== undefined) {
      states[direction.key] = baseStates[direction.key];
      connected[direction.key] = !['none', 'false'].includes(baseStates[direction.key]);
    } else {
      const neighbor = getNeighborInfo(x, y, z, direction.dx, 0, direction.dz, blocks, paletteInfo, size, airIndex);
      connected[direction.key] = connectsToWall(neighbor);
      states[direction.key] = connected[direction.key] ? 'low' : 'none';
    }
  }

  if (baseStates.up === undefined) {
    const straightNorthSouth = connected.north && connected.south && !connected.east && !connected.west;
    const straightEastWest = connected.east && connected.west && !connected.north && !connected.south;
    const verticalWall = isWallName(getNeighborInfo(x, y, z, 0, 1, 0, blocks, paletteInfo, size, airIndex)?.name)
      || isWallName(getNeighborInfo(x, y, z, 0, -1, 0, blocks, paletteInfo, size, airIndex)?.name);
    states.up = verticalWall || (!straightNorthSouth && !straightEastWest) ? 'true' : 'false';
  }

  return states;
}

function inferBooleanConnectionStates(baseStates, x, y, z, blocks, paletteInfo, size, airIndex, predicate) {
  const states = { ...baseStates };
  for (const direction of HORIZONTAL_DIRECTIONS) {
    if (baseStates[direction.key] !== undefined) continue;
    const neighbor = getNeighborInfo(x, y, z, direction.dx, 0, direction.dz, blocks, paletteInfo, size, airIndex);
    states[direction.key] = predicate(neighbor) ? 'true' : 'false';
  }
  return states;
}

function inferScaffoldingStates(baseStates, x, y, z, blocks, paletteInfo, size, airIndex) {
  const states = { ...baseStates };
  if (baseStates.bottom !== undefined) return states;

  const below = getNeighborInfo(x, y, z, 0, -1, 0, blocks, paletteInfo, size, airIndex);
  states.bottom = below?.name === 'scaffolding' ? 'false' : 'true';
  return states;
}

function inferRedstoneStates(baseStates, x, y, z, blocks, paletteInfo, size, airIndex) {
  const states = { ...baseStates, power: baseStates.power ?? '15' };

  for (const direction of HORIZONTAL_DIRECTIONS) {
    if (baseStates[direction.key] !== undefined) continue;
    const neighbor = getNeighborInfo(x, y, z, direction.dx, 0, direction.dz, blocks, paletteInfo, size, airIndex);
    states[direction.key] = connectsToRedstone(neighbor)
      ? baseStates[direction.key] === 'up' ? 'up' : 'side'
      : 'none';
  }

  return states;
}

function getNeighborInfo(x, y, z, dx, dy, dz, blocks, paletteInfo, size, airIndex) {
  const nx = x + dx;
  const ny = y + dy;
  const nz = z + dz;
  if (nx < 0 || ny < 0 || nz < 0 || nx >= size.x || ny >= size.y || nz >= size.z) return null;

  const index = nx + nz * size.x + ny * (size.x * size.z);
  const paletteIndex = blocks[index];
  if (paletteIndex === airIndex) return null;

  const info = paletteInfo[paletteIndex];
  return info && !isAirName(info.name) ? info : null;
}

function formatRawBlockName(name, states) {
  const entries = Object.entries(states)
    .filter(([key, value]) => key && value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${String(value).toLowerCase()}`);

  return entries.length ? `minecraft:${name}[${entries.join(',')}]` : `minecraft:${name}`;
}

function isAirName(name) {
  return ['air', 'cave_air', 'void_air'].includes(name);
}

function isWallName(name) {
  return typeof name === 'string' && name.endsWith('_wall');
}

function isFenceName(name) {
  return typeof name === 'string' && name.endsWith('_fence');
}

function isFenceGateName(name) {
  return typeof name === 'string' && name.endsWith('_fence_gate');
}

function isPaneName(name) {
  return name === 'iron_bars' || (typeof name === 'string' && name.endsWith('_pane'));
}

function connectsToWall(info) {
  return Boolean(info && (
    isWallName(info.name)
    || isFenceName(info.name)
    || isFenceGateName(info.name)
    || isPaneName(info.name)
  ));
}

function connectsToFence(info) {
  return Boolean(info && (
    isFenceName(info.name)
    || isFenceGateName(info.name)
    || isWallName(info.name)
  ));
}

function connectsToPane(info) {
  return Boolean(info && (
    isPaneName(info.name)
    || isWallName(info.name)
    || isFenceName(info.name)
  ));
}

function connectsToRedstone(info) {
  return Boolean(info && (
    REDSTONE_COMPONENTS.has(info.name)
  ));
}

function hasStates(states, keys) {
  return keys.every(key => states[key] !== undefined);
}

function isSolidConnectionBlock(name) {
  if (!name || NON_SOLID_BLOCKS.has(name)) return false;
  if (NON_SOLID_SUFFIXES.some(suffix => name.endsWith(suffix))) return false;
  if (name.includes('sapling') || name.includes('leaves') || name.includes('coral') || name.includes('kelp')) return false;
  return true;
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}
