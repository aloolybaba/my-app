import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

const cutoutNames = [
  "bars",
  "pane",
  "torch",
  "redstone",
  "rail",
  "trapdoor",
  "button",
  "pressure_plate"
];

function stripNamespace(value) {
  return String(value || "").replace(/^minecraft:/, "");
}

function minecraftRootFromTextureRoot(textureRoot) {
  return path.resolve(process.cwd(), textureRoot, "..", "..");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function selectModelApplication(value, seed = "") {
  const entries = asArray(value).filter(Boolean);
  if (entries.length === 0) return [];
  const totalWeight = entries.reduce(
    (sum, entry) => sum + Math.max(1, Number(entry.weight || 1)),
    0
  );
  let target = hashString(seed) % totalWeight;
  for (const entry of entries) {
    target -= Math.max(1, Number(entry.weight || 1));
    if (target < 0) return [entry];
  }
  return [entries[0]];
}

function sortedStateSeed(properties = {}) {
  return Object.entries(properties)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
}

function propsMatch(properties, query) {
  if (!query) return true;
  if (query.OR) return asArray(query.OR).some((item) => propsMatch(properties, item));
  if (query.AND) return asArray(query.AND).every((item) => propsMatch(properties, item));
  return Object.entries(query).every(([key, value]) =>
    String(value)
      .split("|")
      .some((allowed) => String(properties?.[key]) === allowed)
  );
}

function variantMatches(properties, key) {
  if (!key) return true;
  return key.split(",").every((part) => {
    const [name, value] = part.split("=");
    return String(value)
      .split("|")
      .some((allowed) => String(properties?.[name]) === allowed);
  });
}

function quarterTurns(value = 0) {
  return Math.round(((((Number(value) || 0) % 360) + 360) % 360) / 90) % 4;
}

function rotateFaceInOrder(face, value, order) {
  const turns = quarterTurns(value);
  const index = order.indexOf(face);
  if (index === -1) return face;
  return order[(index + turns) % 4];
}

function rotateFaceX(face, x = 0) {
  return rotateFaceInOrder(face, x, ["north", "down", "south", "up"]);
}

function rotateFaceY(face, y = 0) {
  return rotateFaceInOrder(face, y, ["north", "east", "south", "west"]);
}

function rotateFace(face, x = 0, y = 0) {
  return rotateFaceY(rotateFaceX(face, x), y);
}

function rotatePointX(x, y, z, rotation = 0) {
  const normalized = (((Number(rotation) || 0) % 360) + 360) % 360;
  if (normalized === 90) return { x, y: z, z: 1 - y };
  if (normalized === 180) return { x, y: 1 - y, z: 1 - z };
  if (normalized === 270) return { x, y: 1 - z, z: y };
  return { x, y, z };
}

function rotatePointY(x, z, y = 0) {
  const normalized = (((Number(y) || 0) % 360) + 360) % 360;
  if (normalized === 90) return { x: 1 - z, z: x };
  if (normalized === 180) return { x: 1 - x, z: 1 - z };
  if (normalized === 270) return { x: z, z: 1 - x };
  return { x, z };
}

function rotatePoint(point, xRotation = 0, yRotation = 0) {
  const afterX = rotatePointX(point.x, point.y, point.z, xRotation);
  const afterY = rotatePointY(afterX.x, afterX.z, yRotation);
  return { x: afterY.x, y: afterX.y, z: afterY.z };
}

function rotateBox(from, to, xRotation = 0, yRotation = 0) {
  const x0 = from[0] / 16;
  const y0 = from[1] / 16;
  const z0 = from[2] / 16;
  const x1 = to[0] / 16;
  const y1 = to[1] / 16;
  const z1 = to[2] / 16;
  const rotated = [
    rotatePoint({ x: x0, y: y0, z: z0 }, xRotation, yRotation),
    rotatePoint({ x: x0, y: y0, z: z1 }, xRotation, yRotation),
    rotatePoint({ x: x0, y: y1, z: z0 }, xRotation, yRotation),
    rotatePoint({ x: x0, y: y1, z: z1 }, xRotation, yRotation),
    rotatePoint({ x: x1, y: y0, z: z0 }, xRotation, yRotation),
    rotatePoint({ x: x1, y: y0, z: z1 }, xRotation, yRotation),
    rotatePoint({ x: x1, y: y1, z: z0 }, xRotation, yRotation),
    rotatePoint({ x: x1, y: y1, z: z1 }, xRotation, yRotation)
  ];
  return {
    xOffset: Math.min(...rotated.map((point) => point.x)),
    yOffset: Math.min(...rotated.map((point) => point.y)),
    zOffset: Math.min(...rotated.map((point) => point.z)),
    width: Math.max(...rotated.map((point) => point.x)) - Math.min(...rotated.map((point) => point.x)),
    height: Math.max(...rotated.map((point) => point.y)) - Math.min(...rotated.map((point) => point.y)),
    length: Math.max(...rotated.map((point) => point.z)) - Math.min(...rotated.map((point) => point.z))
  };
}

function normalizeRotation(value = 0) {
  return (((Number(value) || 0) % 360) + 360) % 360;
}

function defaultUv(faceName, from, to) {
  const [x0, y0, z0] = from;
  const [x1, y1, z1] = to;
  switch (faceName) {
    case "down":
    case "up":
      return [x0, z0, x1, z1];
    case "north":
    case "south":
      return [x0, 16 - y1, x1, 16 - y0];
    case "west":
    case "east":
      return [z0, 16 - y1, z1, 16 - y0];
    default:
      return [0, 0, 16, 16];
  }
}

function faceUv(faceName, face, from, to) {
  if (Array.isArray(face.uv) && face.uv.length === 4) return face.uv.map(Number);
  return defaultUv(faceName, from, to);
}

function faceTextureRotation(rotatedFace, face, application) {
  let rotation = Number(face.rotation || 0);
  if (!application?.uvlock && (rotatedFace === "up" || rotatedFace === "down")) {
    rotation += Number(application?.y || 0);
  }
  return normalizeRotation(rotation);
}

function faceVertices(faceName, from, to) {
  const [x0, y0, z0] = from;
  const [x1, y1, z1] = to;
  switch (faceName) {
    case "up":
      return [
        { x: x0, y: y1, z: z0 },
        { x: x1, y: y1, z: z0 },
        { x: x1, y: y1, z: z1 },
        { x: x0, y: y1, z: z1 }
      ];
    case "down":
      return [
        { x: x0, y: y0, z: z1 },
        { x: x1, y: y0, z: z1 },
        { x: x1, y: y0, z: z0 },
        { x: x0, y: y0, z: z0 }
      ];
    case "south":
      return [
        { x: x0, y: y1, z: z1 },
        { x: x1, y: y1, z: z1 },
        { x: x1, y: y0, z: z1 },
        { x: x0, y: y0, z: z1 }
      ];
    case "north":
      return [
        { x: x1, y: y1, z: z0 },
        { x: x0, y: y1, z: z0 },
        { x: x0, y: y0, z: z0 },
        { x: x1, y: y0, z: z0 }
      ];
    case "east":
      return [
        { x: x1, y: y1, z: z1 },
        { x: x1, y: y1, z: z0 },
        { x: x1, y: y0, z: z0 },
        { x: x1, y: y0, z: z1 }
      ];
    case "west":
      return [
        { x: x0, y: y1, z: z0 },
        { x: x0, y: y1, z: z1 },
        { x: x0, y: y0, z: z1 },
        { x: x0, y: y0, z: z0 }
      ];
    default:
      return [];
  }
}

function faceNormal(faceName) {
  switch (faceName) {
    case "up":
      return { x: 0, y: 1, z: 0 };
    case "down":
      return { x: 0, y: -1, z: 0 };
    case "south":
      return { x: 0, y: 0, z: 1 };
    case "north":
      return { x: 0, y: 0, z: -1 };
    case "east":
      return { x: 1, y: 0, z: 0 };
    case "west":
      return { x: -1, y: 0, z: 0 };
    default:
      return { x: 0, y: 0, z: 0 };
  }
}

function rotateAroundAxis(point, axis, angleDegrees) {
  const angle = (Number(angleDegrees || 0) * Math.PI) / 180;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  if (axis === "x") {
    return {
      x: point.x,
      y: point.y * cos - point.z * sin,
      z: point.y * sin + point.z * cos
    };
  }
  if (axis === "y") {
    return {
      x: point.x * cos + point.z * sin,
      y: point.y,
      z: -point.x * sin + point.z * cos
    };
  }
  if (axis === "z") {
    return {
      x: point.x * cos - point.y * sin,
      y: point.x * sin + point.y * cos,
      z: point.z
    };
  }
  return point;
}

function rescaleFactor(angleDegrees) {
  const angle = Math.abs(Number(angleDegrees || 0));
  if (Math.abs(angle - 22.5) < 0.001) return 1 / Math.cos(Math.PI / 8);
  if (Math.abs(angle - 45) < 0.001) return Math.SQRT2;
  return 1;
}

function applyElementRotation(point, rotation) {
  if (!rotation?.axis || !rotation?.angle) return point;
  const origin = rotation.origin || [8, 8, 8];
  const relative = {
    x: point.x - origin[0],
    y: point.y - origin[1],
    z: point.z - origin[2]
  };
  let rotated = rotateAroundAxis(relative, rotation.axis, rotation.angle);
  if (rotation.rescale) {
    const scale = rescaleFactor(rotation.angle);
    rotated = {
      x: rotation.axis === "x" ? rotated.x : rotated.x * scale,
      y: rotation.axis === "y" ? rotated.y : rotated.y * scale,
      z: rotation.axis === "z" ? rotated.z : rotated.z * scale
    };
  }
  return {
    x: rotated.x + origin[0],
    y: rotated.y + origin[1],
    z: rotated.z + origin[2]
  };
}

function applyBlockRotationToModelPoint(point, xRotation, yRotation) {
  return rotatePoint(
    {
      x: point.x / 16,
      y: point.y / 16,
      z: point.z / 16
    },
    xRotation,
    yRotation
  );
}

function rotateNormal(normal, elementRotation, xRotation, yRotation) {
  let rotated = normal;
  if (elementRotation?.axis && elementRotation?.angle) {
    rotated = rotateAroundAxis(rotated, elementRotation.axis, elementRotation.angle);
  }
  const afterX = rotateAroundAxis(rotated, "x", -xRotation);
  return rotateAroundAxis(afterX, "y", -yRotation);
}

function cameraCanSee(normal) {
  return normal.y > 0.001 || normal.x > 0.001 || normal.z > 0.001;
}

function shouldRenderModelFace(fullCube, normal) {
  if (fullCube) return cameraCanSee(normal);
  return normal.y > -0.75;
}

function textureValue(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object") return value.sprite || value.texture || null;
  return null;
}

function resolveTexture(value, textures, depth = 0) {
  const raw = textureValue(value);
  if (!raw || depth > 16) return null;
  if (!raw.startsWith("#")) return raw;
  return resolveTexture(textures[raw.slice(1)], textures, depth + 1);
}

function modelFileName(modelRef) {
  const clean = stripNamespace(modelRef);
  const relative = clean.startsWith("block/") ? clean : `block/${clean}`;
  return `${relative}.json`;
}

function isCutout(blockName, textureRef) {
  const value = `${blockName} ${textureRef || ""}`.toLowerCase();
  return cutoutNames.some((name) => value.includes(name));
}

function alphaForBlock(blockName) {
  if (blockName.includes("glass") || blockName === "water") return 0.68;
  if (blockName === "slime_block" || blockName === "honey_block") return 0.82;
  return 1;
}

export class BlockModelManager {
  constructor(textureRoot) {
    this.minecraftRoot = minecraftRootFromTextureRoot(textureRoot);
    this.blockstateCache = new Map();
    this.modelCache = new Map();
  }

  get available() {
    return fs.existsSync(path.join(this.minecraftRoot, "blockstates")) &&
      fs.existsSync(path.join(this.minecraftRoot, "models", "block"));
  }

  async readJson(filePath) {
    const content = await fsp.readFile(filePath, "utf8");
    return JSON.parse(content);
  }

  async loadBlockstate(blockName) {
    const key = stripNamespace(blockName);
    if (this.blockstateCache.has(key)) return this.blockstateCache.get(key);
    const filePath = path.join(this.minecraftRoot, "blockstates", `${key}.json`);
    if (!fs.existsSync(filePath)) {
      this.blockstateCache.set(key, null);
      return null;
    }
    const value = await this.readJson(filePath);
    this.blockstateCache.set(key, value);
    return value;
  }

  async loadModel(modelRef) {
    const fileName = modelFileName(modelRef);
    if (this.modelCache.has(fileName)) return this.modelCache.get(fileName);
    const filePath = path.join(this.minecraftRoot, "models", fileName);
    if (!fs.existsSync(filePath)) {
      this.modelCache.set(fileName, null);
      return null;
    }

    const model = await this.readJson(filePath);
    let resolved = clone(model);
    if (model.parent) {
      const parent = await this.loadModel(model.parent);
      if (parent) {
        resolved = {
          ...parent,
          ...resolved,
          textures: {
            ...(parent.textures || {}),
            ...(resolved.textures || {})
          },
          elements: resolved.elements || parent.elements || []
        };
      }
    }

    this.modelCache.set(fileName, resolved);
    return resolved;
  }

  selectApplications(blockstate, block) {
    const properties = block.properties || {};
    const x = block.rx ?? block.x ?? 0;
    const y = block.ry ?? block.y ?? 0;
    const z = block.rz ?? block.z ?? 0;
    const blockSeed = `${block.name}:${x},${y},${z}:${sortedStateSeed(properties)}`;
    if (blockstate.variants) {
      const entries = Object.entries(blockstate.variants);
      const matched = entries.find(([key]) => variantMatches(properties, key)) || entries[0];
      return selectModelApplication(matched?.[1], `${blockSeed}:${matched?.[0] || ""}`);
    }

    if (blockstate.multipart) {
      return blockstate.multipart
        .map((part, index) => ({ part, index }))
        .filter(({ part }) => propsMatch(properties, part.when))
        .flatMap(({ part, index }) =>
          selectModelApplication(part.apply, `${blockSeed}:multipart:${index}`)
        );
    }

    return [];
  }

  async elementsFor(block) {
    if (!this.available) return null;
    const blockstate = await this.loadBlockstate(block.name);
    if (!blockstate) return null;

    const applications = this.selectApplications(blockstate, block);
    const output = [];

    for (const application of applications) {
      if (!application?.model) continue;
      const model = await this.loadModel(application.model);
      if (!model?.elements?.length) continue;
      const xRotation = Number(application.x || 0);
      const yRotation = Number(application.y || 0);

      for (const element of model.elements) {
        const box = rotateBox(
          element.from || [0, 0, 0],
          element.to || [16, 16, 16],
          xRotation,
          yRotation
        );
        const textures = {};
        const tints = {};
        const uvs = {};
        const faceRotations = {};
        const decorate = element.shade !== false;
        const faces = element.faces || {};
        const from = element.from || [0, 0, 0];
        const to = element.to || [16, 16, 16];
        const modelFaces = [];
        const fullCube =
          box.xOffset === 0 &&
          box.yOffset === 0 &&
          box.zOffset === 0 &&
          box.width === 1 &&
          box.height === 1 &&
          box.length === 1;

        for (const [faceName, face] of Object.entries(faces)) {
          const normal = rotateNormal(
            faceNormal(faceName),
            element.rotation,
            xRotation,
            yRotation
          );
          if (!shouldRenderModelFace(fullCube, normal)) continue;

          const rotatedFace = rotateFace(faceName, xRotation, yRotation);
          const rotatedCullFace = face.cullface
            ? rotateFace(face.cullface, xRotation, yRotation)
            : null;
          const texture = resolveTexture(face.texture, model.textures || {});
          const uv = faceUv(faceName, face, from, to);
          const rotation = faceTextureRotation(rotatedFace, face, application);
          textures[rotatedFace] = texture;
          uvs[rotatedFace] = uv;
          faceRotations[rotatedFace] = rotation;
          if (face.tintindex !== undefined) tints[rotatedFace] = face.tintindex;

          modelFaces.push({
            face: rotatedFace,
            texture,
            tint: face.tintindex !== undefined,
            uv,
            rotation,
            cullface: rotatedCullFace,
            normal,
            vertices: faceVertices(faceName, from, to).map((point) =>
              applyBlockRotationToModelPoint(
                applyElementRotation(point, element.rotation),
                xRotation,
                yRotation
              )
            )
          });
        }

        if (Object.keys(textures).length === 0 && modelFaces.length === 0) continue;
        output.push({
          ...box,
          fullCube,
          topOnly: false,
          alpha: alphaForBlock(block.name),
          decorate,
          cutout: Object.values(textures).some((texture) => isCutout(block.name, texture)),
          textures,
          tints,
          uvs,
          faceRotations,
          modelFaces
        });
      }
    }

    return output.length > 0 ? output : null;
  }
}
