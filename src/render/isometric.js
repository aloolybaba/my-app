import fs from "node:fs/promises";
import { createCanvas } from "canvas";
import sharp from "sharp";
import { BlockModelManager } from "./models.js";
import { TextureManager } from "./textures.js";

const TILE_W = 32;
const TILE_H = 16;
const BLOCK_H = 28;
const OUTPUT_WIDTH = 1280;
const OUTPUT_HEIGHT = 768;
const MAX_RENDER_WIDTH = 900;
const MAX_RENDER_HEIGHT = 640;
const FACE_SHADE = {
  top: 1.06,
  left: 0.78,
  right: 0.93
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

function drawTexturedFace(ctx, texture, points, shadeAmount, alpha = 1, decorate = true) {
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

  if (!decorate) return;

  shade(ctx, points, shadeAmount);
  ctx.strokeStyle = "rgba(0,0,0,0.26)";
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.closePath();
  ctx.stroke();
}

function boolProp(props, name) {
  return props?.[name] === true || props?.[name] === "true";
}

function connectProp(props, name) {
  const value = props?.[name];
  return value === true || value === "true" || value === "low" || value === "tall";
}

function topTextureFor(block, faces) {
  const facing = block.properties?.facing;
  return facing === "up" || facing === "down" ? faces.front : faces.top;
}

function sideTextureFor(block, faces, faceName) {
  const facing = block.properties?.facing;
  if (faceName === facing) return faces.front;
  return faces.side;
}

function cubeShape(overrides = {}) {
  const base = {
    xOffset: 0,
    yOffset: 0,
    zOffset: 0,
    width: 1,
    height: 1,
    length: 1,
    topOnly: false,
    fullCube: true,
    alpha: 1,
    cutout: false,
    decorate: true
  };
  return { ...base, ...overrides };
}

function paneShapes(block) {
  const props = block.properties || {};
  const alpha = block.name.includes("glass") ? 0.58 : 1;
  const shapes = [
    cubeShape({
      xOffset: 0.4375,
      zOffset: 0.4375,
      width: 0.125,
      length: 0.125,
      fullCube: false,
      cutout: true,
      alpha
    })
  ];
  const north = boolProp(props, "north");
  const south = boolProp(props, "south");
  const west = boolProp(props, "west");
  const east = boolProp(props, "east");

  if (north || (!north && !south && !west && !east)) {
    shapes.push(
      cubeShape({
        xOffset: 0.4375,
        zOffset: 0,
        width: 0.125,
        length: 0.5,
        fullCube: false,
        cutout: true,
        alpha
      })
    );
  }
  if (south || (!north && !south && !west && !east)) {
    shapes.push(
      cubeShape({
        xOffset: 0.4375,
        zOffset: 0.5,
        width: 0.125,
        length: 0.5,
        fullCube: false,
        cutout: true,
        alpha
      })
    );
  }
  if (west || (!north && !south && !west && !east)) {
    shapes.push(
      cubeShape({
        xOffset: 0,
        zOffset: 0.4375,
        width: 0.5,
        length: 0.125,
        fullCube: false,
        cutout: true,
        alpha
      })
    );
  }
  if (east || (!north && !south && !west && !east)) {
    shapes.push(
      cubeShape({
        xOffset: 0.5,
        zOffset: 0.4375,
        width: 0.5,
        length: 0.125,
        fullCube: false,
        cutout: true,
        alpha
      })
    );
  }

  return shapes;
}

function fenceShapes(block) {
  const props = block.properties || {};
  const shapes = [
    cubeShape({
      xOffset: 0.375,
      zOffset: 0.375,
      width: 0.25,
      length: 0.25,
      fullCube: false
    })
  ];
  if (connectProp(props, "north")) {
    shapes.push(
      cubeShape({ xOffset: 0.375, zOffset: 0, width: 0.25, length: 0.5, fullCube: false })
    );
  }
  if (connectProp(props, "south")) {
    shapes.push(
      cubeShape({ xOffset: 0.375, zOffset: 0.5, width: 0.25, length: 0.5, fullCube: false })
    );
  }
  if (connectProp(props, "west")) {
    shapes.push(
      cubeShape({ xOffset: 0, zOffset: 0.375, width: 0.5, length: 0.25, fullCube: false })
    );
  }
  if (connectProp(props, "east")) {
    shapes.push(
      cubeShape({ xOffset: 0.5, zOffset: 0.375, width: 0.5, length: 0.25, fullCube: false })
    );
  }
  return shapes;
}

function hopperShapes() {
  return [
    cubeShape({
      yOffset: 0.625,
      height: 0.375,
      fullCube: false
    }),
    cubeShape({
      xOffset: 0.25,
      zOffset: 0.25,
      width: 0.5,
      height: 0.625,
      length: 0.5,
      fullCube: false
    })
  ];
}

function trapdoorShapes(block) {
  const props = block.properties || {};
  if (boolProp(props, "open")) {
    const facing = props.facing || "north";
    if (facing === "south") {
      return [
        cubeShape({
          zOffset: 0.8125,
          length: 0.1875,
          fullCube: false,
          cutout: true
        })
      ];
    }
    if (facing === "east") {
      return [
        cubeShape({
          xOffset: 0.8125,
          width: 0.1875,
          fullCube: false,
          cutout: true
        })
      ];
    }
    if (facing === "west") {
      return [
        cubeShape({
          width: 0.1875,
          fullCube: false,
          cutout: true
        })
      ];
    }
    return [
      cubeShape({
        length: 0.1875,
        fullCube: false,
        cutout: true
      })
    ];
  }

  return [
    cubeShape({
      yOffset: props.half === "top" ? 0.8125 : 0,
      height: 0.1875,
      fullCube: false,
      cutout: true
    })
  ];
}

function shapesFor(block) {
  const name = block.name;
  const props = block.properties || {};
  const alpha =
    name.includes("glass") || name === "water"
      ? 0.68
      : name === "slime_block" || name === "honey_block"
        ? 0.82
        : 1;

  if (name.endsWith("_slab") && props.type !== "double") {
    return [
      cubeShape({
      yOffset: props.type === "top" ? 0.5 : 0,
      height: 0.5,
        fullCube: false,
        alpha
      })
    ];
  }

  if (
    name === "redstone_wire" ||
    name.endsWith("_carpet") ||
    name.endsWith("_pressure_plate") ||
    name.endsWith("_rail")
  ) {
    return [
      cubeShape({
        xOffset: 0.04,
        zOffset: 0.04,
        width: 0.92,
        length: 0.92,
        height: 0.05,
        topOnly: true,
        fullCube: false,
        cutout: true,
        alpha
      })
    ];
  }

  if (name === "repeater" || name === "comparator") {
    return [
      cubeShape({
        xOffset: 0.03,
        zOffset: 0.03,
        width: 0.94,
        length: 0.94,
        height: 0.13,
        fullCube: false,
        alpha
      })
    ];
  }

  if (name.endsWith("_button")) {
    return [
      cubeShape({
        xOffset: 0.25,
        zOffset: 0.25,
        width: 0.5,
        length: 0.5,
        height: 0.16,
        fullCube: false,
        alpha
      })
    ];
  }

  if (name.endsWith("_torch") || name === "torch") {
    return [
      cubeShape({
        xOffset: 0.38,
        zOffset: 0.38,
        width: 0.24,
        length: 0.24,
        height: 0.72,
        fullCube: false,
        cutout: true,
        alpha
      })
    ];
  }

  if (name === "iron_bars" || name.endsWith("_glass_pane")) {
    return paneShapes(block);
  }

  if (name.endsWith("_trapdoor")) {
    return trapdoorShapes(block);
  }

  if (name.endsWith("_fence") || name.endsWith("_wall")) {
    return fenceShapes(block);
  }

  if (name === "hopper") {
    return hopperShapes();
  }

  if (name === "chest" || name === "trapped_chest" || name === "barrel") {
    return [
      cubeShape({
        xOffset: 0.0625,
        zOffset: 0.0625,
        width: 0.875,
        height: 0.875,
        length: 0.875,
        fullCube: false,
        alpha
      })
    ];
  }

  return [cubeShape({ alpha })];
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
    south: [t(p011), t(p111), t(p101), t(p001)],
    east: [t(p111), t(p110), t(p100), t(p101)]
  };
}

function modelFaceGeometry(block, face, ox, oy) {
  return face.vertices.map((vertex) => {
    const projected = iso(
      block.rx + vertex.x,
      block.ry + vertex.y,
      block.rz + vertex.z
    );
    return {
      x: projected.x + ox,
      y: projected.y + oy
    };
  });
}

function modelFaceShade(face) {
  const normal = face.normal || { x: 0, y: 1, z: 0 };
  if (normal.y > 0.55) return FACE_SHADE.top;
  if (normal.z >= normal.x) return FACE_SHADE.left;
  return FACE_SHADE.right;
}

function shapeFaceVertices(block, shape, faceName) {
  const x0 = block.rx + shape.xOffset;
  const y0 = block.ry + shape.yOffset;
  const z0 = block.rz + shape.zOffset;
  const x1 = x0 + shape.width;
  const y1 = y0 + shape.height;
  const z1 = z0 + shape.length;

  switch (faceName) {
    case "top":
      return [
        { x: x0, y: y1, z: z0 },
        { x: x1, y: y1, z: z0 },
        { x: x1, y: y1, z: z1 },
        { x: x0, y: y1, z: z1 }
      ];
    case "south":
      return [
        { x: x0, y: y1, z: z1 },
        { x: x1, y: y1, z: z1 },
        { x: x1, y: y0, z: z1 },
        { x: x0, y: y0, z: z1 }
      ];
    case "east":
      return [
        { x: x1, y: y1, z: z1 },
        { x: x1, y: y1, z: z0 },
        { x: x1, y: y0, z: z0 },
        { x: x1, y: y0, z: z1 }
      ];
    default:
      return [];
  }
}

function projectVertices(vertices, ox, oy) {
  return vertices.map((vertex) => {
    const point = iso(vertex.x, vertex.y, vertex.z);
    return {
      x: point.x + ox,
      y: point.y + oy
    };
  });
}

function modelWorldVertices(block, face) {
  return face.vertices.map((vertex) => ({
    x: block.rx + vertex.x,
    y: block.ry + vertex.y,
    z: block.rz + vertex.z
  }));
}

function faceBias(faceName) {
  if (faceName === "up" || faceName === "top") return 0.35;
  if (faceName === "east") return 0.18;
  if (faceName === "south") return 0.16;
  return 0;
}

function faceDepth(vertices, faceName) {
  const average = vertices.reduce(
    (sum, vertex) => ({
      x: sum.x + vertex.x,
      y: sum.y + vertex.y,
      z: sum.z + vertex.z
    }),
    { x: 0, y: 0, z: 0 }
  );
  const count = Math.max(1, vertices.length);
  const x = average.x / count;
  const y = average.y / count;
  const z = average.z / count;
  return x + z + y * 2 + faceBias(faceName);
}

function neighborKey(block, faceName) {
  switch (faceName) {
    case "up":
    case "top":
      return `${block.rx},${block.ry + 1},${block.rz}`;
    case "south":
      return `${block.rx},${block.ry},${block.rz + 1}`;
    case "east":
      return `${block.rx + 1},${block.ry},${block.rz}`;
    case "north":
      return `${block.rx},${block.ry},${block.rz - 1}`;
    case "west":
      return `${block.rx - 1},${block.ry},${block.rz}`;
    case "down":
      return `${block.rx},${block.ry - 1},${block.rz}`;
    default:
      return null;
  }
}

function drawShadow(ctx, blocks, ox, oy) {
  const ground = new Set(blocks.map((block) => `${block.rx},${block.rz}`));
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.1)";
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

function integerScaleFor(width, height) {
  const widthScale = Math.floor(MAX_RENDER_WIDTH / Math.max(1, width));
  const heightScale = Math.floor(MAX_RENDER_HEIGHT / Math.max(1, height));
  return Math.max(1, Math.min(widthScale, heightScale));
}

export async function renderIsometric(schematic, options) {
  const textures = new TextureManager(options.textureRoot);
  const models = new BlockModelManager(options.textureRoot);
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
  const normalized = (
    await Promise.all(schematic.blocks.map(async (block) => {
      const modelShapes = await models.elementsFor(block).catch(() => null);
      return {
      ...block,
      rx: block.x - bounds.minX,
      ry: block.y - bounds.minY,
      rz: block.z - bounds.minZ,
        shapes: modelShapes || shapesFor(block)
      };
    }))
  )
    .sort((a, b) => a.rx + a.rz + a.ry - (b.rx + b.rz + b.ry));

  const solidOccupied = new Set(
    normalized
      .filter(
        (block) =>
          block.shapes.length === 1 && block.shapes[0].fullCube && block.shapes[0].alpha === 1
      )
      .map((block) => `${block.rx},${block.ry},${block.rz}`)
  );

  drawShadow(ctx, normalized, ox, oy);

  const drawFaces = [];
  let serial = 0;
  for (const block of normalized) {
    const faces = await textures.getFaces(block.name);
    const shapes = [...block.shapes].sort(
      (a, b) => a.xOffset + a.zOffset + a.yOffset - (b.xOffset + b.zOffset + b.yOffset)
    );

    for (const shape of shapes) {
      if (shape.modelFaces?.length) {
        for (const face of shape.modelFaces) {
          if (face.cullface) {
            const cullKey = neighborKey(block, face.cullface);
            if (cullKey && solidOccupied.has(cullKey)) continue;
          }

          const texture = await textures.loadTextureRegion(face.texture, block.name, {
            tint: face.tint,
            uv: face.uv,
            rotation: face.rotation
          });
          const vertices = modelWorldVertices(block, face);
          drawFaces.push({
            texture,
            points: projectVertices(vertices, ox, oy),
            shade: modelFaceShade(face),
            alpha: shape.alpha,
            decorate: shape.decorate !== false && !shape.cutout,
            depth: faceDepth(vertices, face.face),
            serial: serial++
          });
        }
        continue;
      }

      const geometry = blockFaces(block, shape, ox, oy);
      const hasAbove = solidOccupied.has(`${block.rx},${block.ry + 1},${block.rz}`);
      const hasSouthNeighbor = solidOccupied.has(`${block.rx},${block.ry},${block.rz + 1}`);
      const hasEastNeighbor = solidOccupied.has(`${block.rx + 1},${block.ry},${block.rz}`);

      if (!shape.topOnly && (!shape.fullCube || !hasSouthNeighbor)) {
        const texture = shape.textures?.south
          ? await textures.loadTextureRegion(shape.textures.south, block.name, {
              tint: shape.tints?.south !== undefined,
              uv: shape.uvs?.south,
              rotation: shape.faceRotations?.south
            })
          : sideTextureFor(block, faces, "south");
        const vertices = shapeFaceVertices(block, shape, "south");
        drawFaces.push({
          texture,
          points: geometry.south,
          shade: FACE_SHADE.left,
          alpha: shape.alpha,
          decorate: shape.decorate !== false && !shape.cutout,
          depth: faceDepth(vertices, "south"),
          serial: serial++
        });
      }
      if (!shape.topOnly && (!shape.fullCube || !hasEastNeighbor)) {
        const texture = shape.textures?.east
          ? await textures.loadTextureRegion(shape.textures.east, block.name, {
              tint: shape.tints?.east !== undefined,
              uv: shape.uvs?.east,
              rotation: shape.faceRotations?.east
            })
          : sideTextureFor(block, faces, "east");
        const vertices = shapeFaceVertices(block, shape, "east");
        drawFaces.push({
          texture,
          points: geometry.east,
          shade: FACE_SHADE.right,
          alpha: shape.alpha,
          decorate: shape.decorate !== false && !shape.cutout,
          depth: faceDepth(vertices, "east"),
          serial: serial++
        });
      }
      if (!shape.fullCube || !hasAbove) {
        const texture = shape.textures?.up
          ? await textures.loadTextureRegion(shape.textures.up, block.name, {
              tint: shape.tints?.up !== undefined,
              uv: shape.uvs?.up,
              rotation: shape.faceRotations?.up
            })
          : topTextureFor(block, faces);
        const vertices = shapeFaceVertices(block, shape, "top");
        drawFaces.push({
          texture,
          points: geometry.top,
          shade: FACE_SHADE.top,
          alpha: shape.alpha,
          decorate: shape.decorate !== false && !shape.cutout,
          depth: faceDepth(vertices, "top"),
          serial: serial++
        });
      }
    }
  }

  drawFaces.sort((left, right) => left.depth - right.depth || left.serial - right.serial);
  for (const face of drawFaces) {
    drawTexturedFace(
      ctx,
      face.texture,
      face.points,
      face.shade,
      face.alpha,
      face.decorate
    );
  }

  const rawPng = canvas.toBuffer("image/png");
  const trimmedPng = await sharp(rawPng)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
    .png()
    .toBuffer();
  const trimmedMetadata = await sharp(trimmedPng).metadata();
  const scale = integerScaleFor(trimmedMetadata.width, trimmedMetadata.height);
  const scaledWidth = trimmedMetadata.width * scale;
  const scaledHeight = trimmedMetadata.height * scale;
  const scaledPng =
    scale > 1
      ? await sharp(trimmedPng)
          .resize({
            width: scaledWidth,
            height: scaledHeight,
            kernel: sharp.kernel.nearest,
            fit: "fill"
          })
          .png()
          .toBuffer()
      : trimmedPng;
  const finalPng = await sharp(scaledPng)
    .extend({
      top: Math.max(0, Math.floor((OUTPUT_HEIGHT - scaledHeight) / 2)),
      bottom: Math.max(0, Math.ceil((OUTPUT_HEIGHT - scaledHeight) / 2)),
      left: Math.max(0, Math.floor((OUTPUT_WIDTH - scaledWidth) / 2)),
      right: Math.max(0, Math.ceil((OUTPUT_WIDTH - scaledWidth) / 2)),
      background: { r: 0, g: 0, b: 0, alpha: 0 }
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
