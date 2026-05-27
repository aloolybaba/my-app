import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

const visibleFaces = new Set(["up", "south", "east"]);
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

  selectApplications(blockstate, properties) {
    if (blockstate.variants) {
      const entries = Object.entries(blockstate.variants);
      const matched = entries.find(([key]) => variantMatches(properties, key)) || entries[0];
      return asArray(matched?.[1]);
    }

    if (blockstate.multipart) {
      return blockstate.multipart
        .filter((part) => propsMatch(properties, part.when))
        .flatMap((part) => asArray(part.apply));
    }

    return [];
  }

  async elementsFor(block) {
    if (!this.available) return null;
    const blockstate = await this.loadBlockstate(block.name);
    if (!blockstate) return null;

    const applications = this.selectApplications(blockstate, block.properties || {});
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
        const decorate = element.shade !== false;
        const faces = element.faces || {};

        for (const [faceName, face] of Object.entries(faces)) {
          const rotatedFace = rotateFace(faceName, xRotation, yRotation);
          if (!visibleFaces.has(rotatedFace)) continue;
          textures[rotatedFace] = resolveTexture(face.texture, model.textures || {});
          if (face.tintindex !== undefined) tints[rotatedFace] = face.tintindex;
        }

        if (Object.keys(textures).length === 0) continue;
        output.push({
          ...box,
          fullCube:
            box.xOffset === 0 &&
            box.yOffset === 0 &&
            box.zOffset === 0 &&
            box.width === 1 &&
            box.height === 1 &&
            box.length === 1,
          topOnly: false,
          alpha: block.name.includes("glass") || block.name === "water" ? 0.68 : 1,
          decorate,
          cutout: Object.values(textures).some((texture) => isCutout(block.name, texture)),
          textures,
          tints
        });
      }
    }

    return output.length > 0 ? output : null;
  }
}
