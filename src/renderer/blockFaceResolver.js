import { getBlockModelJson, getBlockstateJson } from './textureManager.js';

export function resolveFaces(rawBlockName) {
  const full = (rawBlockName ?? '').toLowerCase();
  const name = full.replace('minecraft:', '').split('[')[0].trim();
  const stateString = full.includes('[') ? full.slice(full.indexOf('[') + 1, full.lastIndexOf(']')) : '';
  const parsedStates = Object.fromEntries(
    stateString
      .split(',')
      .filter(Boolean)
      .map(part => {
        const [key, value] = part.split('=');
        return [key?.trim(), value?.trim()];
      }),
  );
  const states = withDefaultStates(name, parsedStates);

  const forcedFaces = resolveForcedFaces(name, states);
  if (forcedFaces) return forcedFaces;

  const directModel = resolveDirectModel(name, states);
  if (directModel) return directModel;

  if (shouldUseManualShape(name)) return resolveByName(name, states);

  const modelFaces = resolveFromBlockstate(name, states);
  return modelFaces ?? resolveByName(name, states);
}

const tex = name => `${name}.png`;
const all = name => cube(tex(name), tex(name), tex(name));
const topSide = (top, side) => cube(tex(top), tex(side), tex(side));
const custom = (top, left, right) => cube(tex(top), tex(left), tex(right));
const cube = (top, left, right) => ({ top, left, right, shape: 'cube' });
const topFlat = (texture, options = {}) => ({ top: tex(texture), left: null, right: null, shape: 'top_flat', ...options });
const sideFlat = (texture, side = 'both') => ({ top: null, left: tex(texture), right: tex(texture), shape: 'side_flat', side });
const cross = texture => ({ top: null, left: tex(texture), right: tex(texture), shape: 'cross' });

function shouldUseManualShape(name) {
  return false;
}

function withDefaultStates(name, states) {
  if (name === 'piston' || name === 'sticky_piston') {
    return { extended: 'false', facing: 'north', ...states };
  }

  if (name === 'piston_head') {
    return { facing: 'north', short: 'false', type: 'normal', ...states };
  }

  if (name === 'lever') {
    return { face: 'floor', facing: 'north', powered: 'false', ...states };
  }

  if (name === 'scaffolding') {
    return { bottom: 'true', distance: '0', waterlogged: 'false', ...states };
  }

  if (name === 'hopper') {
    return { enabled: 'true', facing: 'down', ...states };
  }

  if (name === 'redstone_torch' || name === 'redstone_wall_torch') {
    return { lit: 'true', facing: 'north', ...states };
  }

  if (name === 'repeater') {
    return { delay: '1', facing: 'north', locked: 'false', powered: 'false', ...states };
  }

  if (name === 'comparator') {
    return { facing: 'north', mode: 'compare', powered: 'false', ...states };
  }

  return states;
}

function resolveForcedFaces(name, states) {
  if (name === 'redstone_torch') {
    const lit = states.lit !== 'false';
    return all(lit ? 'redstone_torch' : 'redstone_torch_off');
  }

  if (name === 'redstone_wall_torch') {
    const lit = states.lit !== 'false';
    const texture = `${lit ? 'redstone_torch' : 'redstone_torch_off'}.png`;
    return { top: texture, left: texture, right: texture };
  }

  if (name === 'lever') {
    return {
      top: 'lever.png',
      left: 'cobblestone.png',
      right: 'cobblestone.png',
    };
  }

  if (name === 'hopper') {
    const facing = states.facing ?? 'down';
    const inside = 'hopper_inside.png';
    const outside = 'hopper_outside.png';

    if (facing === 'down') return { top: inside, left: outside, right: outside };
    if (facing === 'south') return { top: outside, left: inside, right: outside };
    if (facing === 'east') return { top: outside, left: outside, right: inside };
    return { top: outside, left: outside, right: outside };
  }

  if (name === 'piston' || name === 'sticky_piston') {
    const facing = states.facing ?? 'north';
    const extended = states.extended === 'true';
    const sticky = name === 'sticky_piston';
    const front = extended ? 'piston_inner.png' : sticky ? 'piston_top_sticky.png' : 'piston_top.png';
    const back = 'piston_bottom.png';
    const side = 'piston_side.png';
    const map = {
      north: { left: back, right: side, top: side },
      south: { left: front, right: side, top: side },
      east: { left: side, right: front, top: side },
      west: { left: side, right: back, top: side },
      up: { left: side, right: side, top: front },
      down: { left: side, right: side, top: side },
    };
    const selected = map[facing] ?? map.north;
    return { top: selected.top, left: selected.left, right: selected.right };
  }

  if (name === 'piston_head') {
    const sticky = states.type === 'sticky';
    const front = sticky ? 'piston_top_sticky.png' : 'piston_top.png';
    const side = 'piston_side.png';
    const facing = states.facing ?? 'north';
    const map = {
      north: { left: side, right: side, top: side },
      south: { left: front, right: side, top: side },
      east: { left: side, right: front, top: side },
      west: { left: side, right: side, top: side },
      up: { left: side, right: side, top: front },
      down: { left: side, right: side, top: side },
    };
    const selected = map[facing] ?? map.north;
    return { top: selected.top, left: selected.left, right: selected.right };
  }

  return null;
}

function resolveFromBlockstate(name, states) {
  const blockstate = getBlockstateJson(name);
  if (!blockstate) return null;

  const specs = selectModelSpecs(blockstate, states);
  if (!specs.length) return null;

  const candidates = specs
    .map(spec => ({ spec, model: resolveModel(spec.model) }))
    .filter(candidate => candidate.model);

  if (!candidates.length) return null;

  const elements = candidates.flatMap(({ spec, model }) => modelToElements(model, spec, name, states));
  if (elements.length) return { shape: 'model', elements };

  const top = pickWorldFaceTexture(candidates, 'up');
  const left = pickWorldFaceTexture(candidates, 'south');
  const right = pickWorldFaceTexture(candidates, 'east');
  const fallback = top ?? left ?? right;
  if (!fallback) return null;

  return cube(top ?? fallback, left ?? fallback, right ?? fallback);
}

function selectModelSpecs(blockstate, states) {
  if (blockstate.variants) {
    const matches = Object.entries(blockstate.variants)
      .filter(([key]) => variantKeyMatches(key, states))
      .sort((a, b) => variantScore(b[0]) - variantScore(a[0]));

    if (matches.length) return normalizeModelSpec(matches[0][1]);

    if (blockstate.variants['']) return normalizeModelSpec(blockstate.variants['']);
  }

  if (blockstate.multipart) {
    return blockstate.multipart
      .filter(part => multipartWhenMatches(part.when, states))
      .flatMap(part => normalizeModelSpec(part.apply));
  }

  return [];
}

function variantKeyMatches(key, states) {
  if (!key) return true;
  return key.split(',').every(part => {
    const [stateKey, value] = part.split('=');
    return states[stateKey] === value;
  });
}

function variantScore(key) {
  return key ? key.split(',').length : 0;
}

function multipartWhenMatches(when, states) {
  if (!when) return true;
  if (Array.isArray(when.OR)) return when.OR.some(condition => multipartWhenMatches(condition, states));
  if (Array.isArray(when.AND)) return when.AND.every(condition => multipartWhenMatches(condition, states));

  return Object.entries(when).every(([key, value]) => {
    const allowed = String(value).split('|');
    return allowed.includes(states[key]);
  });
}

function normalizeModelSpec(spec) {
  const selected = Array.isArray(spec) ? spec[0] : spec;
  if (!selected?.model) return [];
  return [{
    model: selected.model,
    x: Number(selected.x ?? 0),
    y: Number(selected.y ?? 0),
  }];
}

function resolveModel(modelRef, seen = new Set()) {
  const modelName = cleanModelName(modelRef);
  if (!modelName || seen.has(modelName)) return null;
  seen.add(modelName);

  const own = getBlockModelJson(modelName);
  if (!own) return null;

  const parent = own.parent ? resolveModel(own.parent, seen) : null;
  const textures = { ...(parent?.textures ?? {}), ...(own.textures ?? {}) };
  const elements = own.elements ?? parent?.elements ?? [];

  return { name: modelName, textures, elements };
}

function pickWorldFaceTexture(candidates, worldDirection) {
  for (const { spec, model } of candidates) {
    const localDirection = unrotateDirection(worldDirection, spec);
    const texture = pickModelFaceTexture(model, localDirection) ?? pickAnyModelTexture(model);
    if (texture) return texture;
  }

  return null;
}

function pickModelFaceTexture(model, direction) {
  for (const element of [...model.elements].reverse()) {
    const face = element.faces?.[direction];
    if (!face?.texture) continue;
    const texture = resolveTextureReference(face.texture, model.textures);
    if (texture) return texture;
  }

  return null;
}

function pickAnyModelTexture(model) {
  for (const element of model.elements) {
    for (const face of Object.values(element.faces ?? {})) {
      const texture = resolveTextureReference(face.texture, model.textures);
      if (texture) return texture;
    }
  }

  for (const value of Object.values(model.textures ?? {})) {
    const texture = normalizeModelTexture(value);
    if (texture) return texture;
  }

  return null;
}

function resolveTextureReference(ref, textures) {
  let current = ref;
  const seen = new Set();

  while (typeof current === 'string' && current.startsWith('#')) {
    const key = current.slice(1);
    if (seen.has(key)) return null;
    seen.add(key);
    current = textures[key];
  }

  return normalizeModelTexture(current);
}

function normalizeModelTexture(value) {
  if (!value || typeof value !== 'string') return null;
  return `${value
    .replace(/^minecraft:/, '')
    .replace(/^block\//, '')
    .replace(/^textures\/block\//, '')
    .replace(/\.png$/, '')}.png`;
}

function cleanModelName(modelRef) {
  return modelRef
    ?.replace(/^minecraft:/, '')
    .replace(/^block\//, '')
    .replace(/\.json$/, '');
}

function modelToElements(model, spec, blockName, states) {
  const output = [];

  for (const element of model.elements ?? []) {
    const rotatedBounds = rotateBounds(element.from ?? [0, 0, 0], element.to ?? [16, 16, 16], spec, element.rotation);
    const faces = {};

    for (const [localDirection, face] of Object.entries(element.faces ?? {})) {
      const worldDirection = rotateDirection(localDirection, spec);
      const texture = resolveTextureReference(face.texture, model.textures) ?? pickAnyModelTexture(model);
      if (!texture) continue;
      faces[worldDirection] = {
        texture,
        uv: Array.isArray(face.uv) ? face.uv : null,
        rotation: normalizeTextureRotation(Number(face.rotation ?? 0) + blockstateTextureRotation(worldDirection, spec)),
        tint: face.tintindex !== undefined ? resolveTint(blockName, states, face.tintindex) : null,
      };
    }

    if (!Object.keys(faces).length) continue;

    output.push({
      from: rotatedBounds.from,
      to: rotatedBounds.to,
      faces,
      shade: element.shade !== false,
    });
  }

  return output;
}

function resolveTint(blockName, states, tintIndex) {
  if (blockName === 'redstone_wire' && Number(tintIndex) === 0) return redstoneDustTint(states.power);
  return null;
}

function blockstateTextureRotation(worldDirection, spec) {
  if (worldDirection === 'up' || worldDirection === 'down') return Number(spec.y ?? 0);
  return 0;
}

function normalizeTextureRotation(degrees) {
  return ((Number(degrees) % 360) + 360) % 360;
}

function redstoneDustTint(power) {
  const level = Math.max(0, Math.min(15, Number(power ?? 15)));
  const intensity = level / 15;
  const red = Math.round(55 + 130 * intensity);
  const green = Math.round(3 + 14 * intensity);
  const blue = Math.round(3 + 14 * intensity);
  return `rgb(${red},${green},${blue})`;
}

function resolveDirectModel(name, states) {
  if (name === 'redstone_torch') {
    return directModel(name, states, redstoneTorchElements(states.lit), { x: 0, y: 0 });
  }

  if (name === 'redstone_wall_torch') {
    return directModel(name, states, redstoneWallTorchElements(states.lit), {
      x: 0,
      y: ({ east: 0, south: 90, west: 180, north: 270 })[states.facing] ?? 270,
    });
  }

  if (name === 'lever') {
    return directModel(name, states, leverElements(states.powered), leverSpec(states));
  }

  if (name === 'hopper') {
    return directModel(name, states, hopperElements(states.facing), {
      x: 0,
      y: ({ down: 0, north: 0, east: 90, south: 180, west: 270 })[states.facing] ?? 0,
    });
  }

  return null;
}

function directModel(name, states, elements, spec) {
  return {
    shape: 'model',
    elements: modelToElements({ elements, textures: {} }, spec, name, states),
  };
}

function leverSpec(states) {
  const facing = states.facing ?? 'north';
  if (states.face === 'ceiling') {
    return {
      x: 180,
      y: ({ south: 0, west: 90, north: 180, east: 270 })[facing] ?? 180,
    };
  }

  return {
    x: states.face === 'wall' ? 90 : 0,
    y: ({ north: 0, east: 90, south: 180, west: 270 })[facing] ?? 0,
  };
}

function redstoneTorchElements(lit = 'true') {
  const texture = lit === 'false' ? 'redstone_torch_off' : 'redstone_torch';
  return [
    element([7, 0, 7], [9, 10, 9], {
      down: face(texture, [7, 13, 9, 15]),
      up: face(texture, [7, 6, 9, 8]),
      north: face(texture, [7, 6, 9, 16]),
      east: face(texture, [7, 6, 9, 16]),
      south: face(texture, [7, 6, 9, 16]),
      west: face(texture, [7, 6, 9, 16]),
    }, { shade: false }),
    element([6.5, 7.5, 6.5], [9.5, 7.5, 9.5], { up: face(texture, [8, 5, 9, 6]) }, { shade: false }),
    element([6.5, 10.5, 6.5], [9.5, 10.5, 9.5], { down: face(texture, [7, 5, 8, 6]) }, { shade: false }),
    element([6.5, 7.5, 6.5], [9.5, 10.5, 6.5], { south: face(texture, [9, 6, 10, 7]) }, { shade: false }),
    element([9.5, 7.5, 6.5], [9.5, 10.5, 9.5], { west: face(texture, [6, 7, 7, 8]) }, { shade: false }),
    element([6.5, 7.5, 9.5], [9.5, 10.5, 9.5], { north: face(texture, [6, 6, 7, 7]) }, { shade: false }),
    element([6.5, 7.5, 6.5], [6.5, 10.5, 9.5], { east: face(texture, [9, 7, 10, 8]) }, { shade: false }),
  ];
}

function redstoneWallTorchElements(lit = 'true') {
  const texture = lit === 'false' ? 'redstone_torch_off' : 'redstone_torch';
  const rotation = { origin: [0, 3.5, 8], axis: 'z', angle: -22.5 };
  return [
    element([-1, 3.5, 7], [1, 13.5, 9], {
      down: face(texture, [7, 13, 9, 15]),
      up: face(texture, [7, 6, 9, 8]),
      north: face(texture, [7, 6, 9, 16]),
      east: face(texture, [7, 6, 9, 16]),
      south: face(texture, [7, 6, 9, 16]),
      west: face(texture, [7, 6, 9, 16]),
    }, { rotation, shade: false }),
    element([-1.5, 8, 6.5], [1.5, 11, 9.5], { up: face(texture, [6, 5, 7, 6]) }, { rotation, shade: false }),
    element([-1.5, 14, 6.5], [1.5, 17, 9.5], { down: face(texture, [6, 5, 7, 6]) }, { rotation, shade: false }),
    element([-1.5, 11, 3.5], [1.5, 14, 6.5], { south: face(texture, [6, 5, 7, 6]) }, { rotation, shade: false }),
    element([1.5, 11, 6.5], [4.5, 14, 9.5], { west: face(texture, [6, 5, 7, 6]) }, { rotation, shade: false }),
    element([-1.5, 11, 9.5], [1.5, 14, 12.5], { north: face(texture, [6, 5, 7, 6]) }, { rotation, shade: false }),
    element([-4.5, 11, 6.5], [-1.5, 14, 9.5], { east: face(texture, [6, 5, 7, 6]) }, { rotation, shade: false }),
  ];
}

function leverElements(powered = 'false') {
  return [
    element([5, -0.02, 4], [11, 2.98, 12], {
      down: face('cobblestone', [5, 4, 11, 12]),
      up: face('cobblestone', [5, 4, 11, 12]),
      north: face('cobblestone', [5, 0, 11, 3]),
      south: face('cobblestone', [5, 0, 11, 3]),
      west: face('cobblestone', [4, 0, 12, 3]),
      east: face('cobblestone', [4, 0, 12, 3]),
    }),
    element([7, 1, 7], [9, 11, 9], {
      up: face('lever', [7, 6, 9, 8]),
      north: face('lever', [7, 6, 9, 16]),
      south: face('lever', [7, 6, 9, 16]),
      west: face('lever', [7, 6, 9, 16]),
      east: face('lever', [7, 6, 9, 16]),
    }, {
      rotation: { origin: [8, 1, 8], axis: 'x', angle: powered === 'true' ? -45 : 45 },
    }),
  ];
}

function hopperElements(facing = 'down') {
  const spout = facing === 'down'
    ? element([6, 0, 6], [10, 4, 10], {
      down: face('hopper_inside'),
      north: face('hopper_outside'),
      south: face('hopper_outside'),
      west: face('hopper_outside'),
      east: face('hopper_outside'),
    })
    : element([6, 4, 0], [10, 8, 4], {
      down: face('hopper_inside'),
      up: face('hopper_outside'),
      north: face('hopper_outside'),
      west: face('hopper_outside'),
      east: face('hopper_outside'),
    });

  return [
    element([0, 10, 0], [16, 11, 16], {
      down: face('hopper_inside'),
      up: face('hopper_inside'),
      north: face('hopper_outside'),
      south: face('hopper_outside'),
      west: face('hopper_outside'),
      east: face('hopper_outside'),
    }),
    element([0, 11, 0], [2, 16, 16], {
      up: face('hopper_top'),
      north: face('hopper_outside'),
      south: face('hopper_outside'),
      west: face('hopper_outside'),
      east: face('hopper_outside'),
    }),
    element([14, 11, 0], [16, 16, 16], {
      up: face('hopper_top'),
      north: face('hopper_outside'),
      south: face('hopper_outside'),
      west: face('hopper_outside'),
      east: face('hopper_outside'),
    }),
    element([2, 11, 0], [14, 16, 2], {
      up: face('hopper_top'),
      north: face('hopper_outside'),
      south: face('hopper_outside'),
    }),
    element([2, 11, 14], [14, 16, 16], {
      up: face('hopper_top'),
      north: face('hopper_outside'),
      south: face('hopper_outside'),
    }),
    element([4, 4, 4], [12, 10, 12], {
      down: face('hopper_inside'),
      north: face('hopper_outside'),
      south: face('hopper_outside'),
      west: face('hopper_outside'),
      east: face('hopper_outside'),
    }),
    spout,
  ];
}

function element(from, to, faces, options = {}) {
  return { from, to, faces, ...options };
}

function face(texture, uv = null, rotation = 0) {
  return {
    texture: tex(texture),
    ...(uv ? { uv } : {}),
    ...(rotation ? { rotation } : {}),
  };
}

function rotateBounds(from, to, spec, elementRotation = null) {
  const corners = [];
  for (const x of [from[0], to[0]]) {
    for (const y of [from[1], to[1]]) {
      for (const z of [from[2], to[2]]) {
        corners.push(rotatePoint(rotateElementPoint([x, y, z], elementRotation), spec));
      }
    }
  }

  return {
    from: [
      Math.min(...corners.map(point => point[0])),
      Math.min(...corners.map(point => point[1])),
      Math.min(...corners.map(point => point[2])),
    ],
    to: [
      Math.max(...corners.map(point => point[0])),
      Math.max(...corners.map(point => point[1])),
      Math.max(...corners.map(point => point[2])),
    ],
  };
}

function rotateElementPoint(point, rotation) {
  if (!rotation?.axis || !Number(rotation.angle)) return point;
  const origin = rotation.origin ?? [8, 8, 8];
  const angle = Number(rotation.angle) * Math.PI / 180;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  let [x, y, z] = point.map((value, index) => value - origin[index]);

  if (rotation.axis === 'x') {
    [y, z] = [y * cos - z * sin, y * sin + z * cos];
  } else if (rotation.axis === 'y') {
    [x, z] = [x * cos + z * sin, -x * sin + z * cos];
  } else if (rotation.axis === 'z') {
    [x, y] = [x * cos - y * sin, x * sin + y * cos];
  }

  return [x + origin[0], y + origin[1], z + origin[2]];
}

function rotatePoint(point, spec) {
  let [x, y, z] = point.map(value => value - 8);

  for (let i = 0; i < rotationSteps(spec.x); i += 1) {
    [y, z] = [z, -y];
  }

  for (let i = 0; i < rotationSteps(spec.y); i += 1) {
    [x, z] = [-z, x];
  }

  return [x + 8, y + 8, z + 8];
}

function rotateDirection(direction, spec) {
  let result = direction;
  for (let i = 0; i < rotationSteps(spec.x); i += 1) result = rotateXClockwise(result);
  for (let i = 0; i < rotationSteps(spec.y); i += 1) result = rotateYClockwise(result);
  return result;
}

function unrotateDirection(direction, spec) {
  let result = direction;
  for (let i = 0; i < rotationSteps(-spec.y); i += 1) result = rotateYClockwise(result);
  for (let i = 0; i < rotationSteps(-spec.x); i += 1) result = rotateXClockwise(result);
  return result;
}

function rotationSteps(degrees = 0) {
  return (((Number(degrees) / 90) % 4) + 4) % 4;
}

function rotateYClockwise(direction) {
  switch (direction) {
    case 'north':
      return 'east';
    case 'east':
      return 'south';
    case 'south':
      return 'west';
    case 'west':
      return 'north';
    default:
      return direction;
  }
}

function rotateXClockwise(direction) {
  switch (direction) {
    case 'up':
      return 'north';
    case 'north':
      return 'down';
    case 'down':
      return 'south';
    case 'south':
      return 'up';
    default:
      return direction;
  }
}

function resolveByName(name, states) {
  if (['air', 'cave_air', 'void_air'].includes(name)) return { top: null, left: null, right: null };

  if (name.endsWith('_log') || name.endsWith('_stem')) {
    const wood = name.replace(/_log$/, '').replace(/_stem$/, '');
    const axis = states.axis ?? 'y';
    if (axis === 'y') return topSide(`${wood}_log_top`, `${wood}_log`);
    if (axis === 'x') return custom(`${wood}_log`, `${wood}_log_top`, `${wood}_log`);
    if (axis === 'z') return custom(`${wood}_log`, `${wood}_log`, `${wood}_log_top`);
  }

  if (name.startsWith('stripped_') && (name.endsWith('_log') || name.endsWith('_wood'))) {
    const inner = name.replace('stripped_', '').replace(/_log$/, '').replace(/_wood$/, '');
    const axis = states.axis ?? 'y';
    if (axis === 'y') return topSide(`stripped_${inner}_log_top`, `stripped_${inner}_log`);
    return all(`stripped_${inner}_log`);
  }

  if (name.endsWith('_planks')) return all(name);
  if (name.endsWith('_leaves')) return all(name);

  if (name === 'grass_block') return custom('grass_block_top', 'grass_block_side', 'grass_block_side');
  if (name === 'mycelium') return custom('mycelium_top', 'mycelium_side', 'mycelium_side');
  if (name === 'podzol') return custom('podzol_top', 'podzol_side', 'podzol_side');
  if (name === 'dirt_path') return topSide('dirt_path_top', 'dirt_path_side');
  if (name === 'farmland') return topSide(states.moisture === '0' ? 'farmland' : 'farmland_moist', 'dirt');

  if (name === 'smooth_stone') return topSide('smooth_stone', 'smooth_stone_slab_side');
  if (name === 'deepslate') return topSide('deepslate_top', 'deepslate');
  if (name.startsWith('deepslate_') && name.endsWith('_ore')) return topSide('deepslate', name);
  if (name === 'blackstone') return topSide('blackstone_top', 'blackstone');
  if (name === 'basalt') return topSide('basalt_top', 'basalt_side');
  if (name === 'ancient_debris') return topSide('ancient_debris_top', 'ancient_debris_side');

  if (name === 'sandstone') return custom('sandstone_top', 'sandstone', 'sandstone');
  if (name === 'smooth_sandstone') return all('sandstone_top');
  if (name === 'chiseled_sandstone') return topSide('sandstone_top', 'chiseled_sandstone');
  if (name === 'cut_sandstone') return topSide('sandstone_top', 'cut_sandstone');
  if (name === 'red_sandstone') return custom('red_sandstone_top', 'red_sandstone', 'red_sandstone');
  if (name === 'smooth_red_sandstone') return all('red_sandstone_top');
  if (name === 'chiseled_red_sandstone') return topSide('red_sandstone_top', 'chiseled_red_sandstone');
  if (name === 'cut_red_sandstone') return topSide('red_sandstone_top', 'cut_red_sandstone');

  if (name === 'quartz_pillar') {
    const axis = states.axis ?? 'y';
    if (axis === 'y') return topSide('quartz_pillar_top', 'quartz_pillar');
    return all('quartz_pillar');
  }
  if (name === 'chiseled_quartz_block') return topSide('chiseled_quartz_block_top', 'chiseled_quartz_block');
  if (name === 'smooth_quartz') return all('quartz_block_bottom');

  if (name === 'crimson_nylium') return topSide('crimson_nylium', 'netherrack');
  if (name === 'warped_nylium') return topSide('warped_nylium', 'netherrack');
  if (name === 'magma_block') return all('magma');
  if (name === 'scaffolding') return topSide('scaffolding_top', 'scaffolding_side');
  if (name === 'ice') return all('ice');
  if (name === 'packed_ice') return all('packed_ice');
  if (name === 'blue_ice') return all('blue_ice');
  if (name === 'frosted_ice') return all('frosted_ice_0');
  if (name === 'honey_block') return topSide('honey_block_top', 'honey_block_side');
  if (name === 'slime_block') return all('slime_block');
  if (name === 'chorus_plant') return all('chorus_plant');
  if (name === 'chorus_flower') return all('chorus_flower');
  if (name === 'amethyst_cluster') return all('amethyst_cluster');
  if (name === 'water') return all('water_still');
  if (name === 'lava') return all('lava_still');

  if (name === 'crafting_table') return custom('crafting_table_top', 'crafting_table_front', 'crafting_table_side');
  if (name === 'furnace') return directionalBlock(states.facing, {
    front: states.lit === 'true' ? 'furnace_front_on' : 'furnace_front',
    back: 'furnace_side',
    side: 'furnace_side',
    top: 'furnace_top',
  });
  if (name === 'blast_furnace') return directionalBlock(states.facing, {
    front: states.lit === 'true' ? 'blast_furnace_front_on' : 'blast_furnace_front',
    back: 'blast_furnace_side',
    side: 'blast_furnace_side',
    top: 'blast_furnace_top',
  });
  if (name === 'smoker') return directionalBlock(states.facing, {
    front: states.lit === 'true' ? 'smoker_front_on' : 'smoker_front',
    back: 'smoker_side',
    side: 'smoker_side',
    top: 'smoker_top',
  });
  if (name === 'barrel') return topSide(states.open === 'true' ? 'barrel_top_open' : 'barrel_top', 'barrel_side');
  if (name === 'dispenser') return directionalBlock(states.facing, {
    front: ['up', 'down'].includes(states.facing) ? 'dispenser_front_vertical' : 'dispenser_front',
    back: 'furnace_side',
    side: 'furnace_side',
    top: 'furnace_side',
  });
  if (name === 'dropper') return directionalBlock(states.facing, {
    front: ['up', 'down'].includes(states.facing) ? 'dropper_front_vertical' : 'dropper_front',
    back: 'furnace_side',
    side: 'furnace_side',
    top: 'furnace_side',
  });
  if (name === 'hopper') return topSide('hopper_inside', 'hopper_outside');
  if (name === 'observer') return directionalBlock(states.facing, {
    front: 'observer_front',
    back: states.powered === 'true' ? 'observer_back_on' : 'observer_back',
    side: 'observer_side',
    top: 'observer_top',
  });
  if (name === 'piston' || name === 'sticky_piston') {
    return directionalBlock(states.facing, {
      front: states.extended === 'true' ? 'piston_inner' : name === 'sticky_piston' ? 'piston_top_sticky' : 'piston_top',
      back: 'piston_bottom',
      side: 'piston_side',
      top: 'piston_side',
    });
  }
  if (name === 'piston_head') return custom(states.type === 'sticky' ? 'piston_top_sticky' : 'piston_top', 'piston_side', 'piston_side');
  if (name === 'redstone_lamp') return all(states.lit === 'true' ? 'redstone_lamp_on' : 'redstone_lamp');
  if (name === 'redstone_wire') return topFlat('redstone_dust_dot', { tint: redstoneDustTint(states.power) });
  if (name === 'repeater') return topFlat(states.powered === 'true' ? 'repeater_on' : 'repeater');
  if (name === 'comparator') return topFlat(states.powered === 'true' ? 'comparator_on' : 'comparator');
  if (name === 'redstone_torch' || name === 'redstone_wall_torch') return cross(states.lit === 'false' ? 'redstone_torch_off' : 'redstone_torch');
  if (name === 'torch' || name === 'wall_torch') return cross('torch');
  if (name === 'soul_torch' || name === 'soul_wall_torch') return cross('soul_torch');
  if (name === 'fire') return cross('fire_0');
  if (name === 'soul_fire') return cross('soul_fire_0');
  if (name === 'rail') return topFlat(states.shape?.startsWith('ascending') ? 'rail_corner' : 'rail');
  if (name === 'powered_rail') return topFlat(states.powered === 'true' ? 'powered_rail_on' : 'powered_rail');
  if (name === 'detector_rail') return topFlat('detector_rail');
  if (name === 'activator_rail') return topFlat(states.powered === 'true' ? 'activator_rail_on' : 'activator_rail');
  if (name === 'ladder') return sideFlat('ladder', sideForFacing(states.facing));
  if (name === 'lever') return topFlat('lever');
  if (name === 'heavy_weighted_pressure_plate') return topFlat('iron_block');
  if (name === 'light_weighted_pressure_plate') return topFlat('gold_block');
  if (name.endsWith('_button')) return topFlat(resolveButtonTexture(name));
  if (name.endsWith('_pressure_plate')) return topFlat(resolveBaseTexture(name.replace('_pressure_plate', '')));
  if (name === 'bookshelf') return topSide('oak_planks', 'bookshelf');
  if (name === 'jukebox') return topSide('jukebox_top', 'jukebox_side');
  if (name === 'honey_block') return topSide('honey_block_top', 'honey_block_side');
  if (name === 'tnt') return custom('tnt_top', 'tnt_side', 'tnt_side');
  if (name === 'sculk_catalyst') return topSide('sculk_catalyst_top', 'sculk_catalyst_side');
  if (name === 'sculk_sensor') return topSide('sculk_sensor_top', 'sculk_sensor_side');
  if (name === 'chest' || name === 'trapped_chest') return all('barrel_side');
  if (name === 'ender_chest') return all('obsidian');

  const colors = [
    'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink',
    'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black',
  ];
  for (const color of colors) {
    if (name === `${color}_concrete`) return all(`${color}_concrete`);
    if (name === `${color}_concrete_powder`) return all(`${color}_concrete_powder`);
    if (name === `${color}_wool`) return all(`${color}_wool`);
    if (name === `${color}_terracotta`) return all(`${color}_terracotta`);
    if (name === `${color}_stained_glass`) return all(`${color}_stained_glass`);
    if (name === `${color}_glazed_terracotta`) return all(`${color}_glazed_terracotta`);
  }

  if (name.endsWith('_slab')) {
    const baseFaces = resolveBaseVariant(name.replace('_slab', ''));
    if (states.type === 'double') return baseFaces;
    return { ...baseFaces, shape: 'slab', half: states.type === 'top' ? 'top' : 'bottom' };
  }

  if (name.endsWith('_carpet')) return topFlat(name);
  if (name === 'snow') return topFlat('snow');
  if (name === 'lily_pad') return topFlat('lily_pad');
  if (name.endsWith('_stained_glass_pane')) return cross(name.replace('_pane', ''));
  if (name.endsWith('_pane')) return cross(name.replace('_pane', ''));
  if (name === 'iron_bars') return cross('iron_bars');

  if (name.endsWith('_stairs')) {
    const baseFaces = resolveBaseVariant(name.replace('_stairs', ''));
    return {
      ...baseFaces,
      shape: 'stairs',
      half: states.half === 'top' ? 'top' : 'bottom',
      facing: states.facing ?? 'north',
    };
  }

  for (const suffix of ['_wall', '_fence', '_fence_gate', '_door', '_trapdoor']) {
    if (name.endsWith(suffix)) return resolveBaseVariant(name.replace(suffix, ''));
  }

  return all(name);
}

function resolveBaseVariant(base) {
  const woodTypes = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'bamboo', 'cherry', 'crimson', 'warped'];
  if (woodTypes.includes(base)) return all(`${base}_planks`);

  const aliases = {
    stone_brick: 'stone_bricks',
    mossy_stone_brick: 'mossy_stone_bricks',
    deepslate_brick: 'deepslate_bricks',
    deepslate_tile: 'deepslate_tiles',
    polished_blackstone_brick: 'polished_blackstone_bricks',
    nether_brick: 'nether_bricks',
    red_nether_brick: 'red_nether_bricks',
    mud_brick: 'mud_bricks',
    end_stone_brick: 'end_stone_bricks',
    prismarine_brick: 'prismarine_bricks',
    brick: 'bricks',
  };

  return resolveByName(aliases[base] ?? base, {});
}

function directionalBlock(facing = 'north', textures) {
  const top = facing === 'up' ? textures.front : facing === 'down' ? textures.back : textures.top;
  const left = faceForWorldSide('west', facing, textures);
  const right = faceForWorldSide('south', facing, textures);
  return custom(top ?? textures.top, left ?? textures.side, right ?? textures.side);
}

function faceForWorldSide(worldSide, facing, textures) {
  const opposite = {
    north: 'south',
    south: 'north',
    east: 'west',
    west: 'east',
    up: 'down',
    down: 'up',
  };

  if (worldSide === facing) return textures.front;
  if (worldSide === opposite[facing]) return textures.back;
  return textures.side;
}

function sideForFacing(facing) {
  if (facing === 'west' || facing === 'north') return 'left';
  if (facing === 'east' || facing === 'south') return 'right';
  return 'both';
}

function resolveButtonTexture(name) {
  return resolveBaseTexture(name.replace('_button', ''));
}

function resolveBaseTexture(base) {
  const aliases = {
    stone: 'stone',
    polished_blackstone: 'polished_blackstone',
    oak: 'oak_planks',
    spruce: 'spruce_planks',
    birch: 'birch_planks',
    jungle: 'jungle_planks',
    acacia: 'acacia_planks',
    dark_oak: 'dark_oak_planks',
    mangrove: 'mangrove_planks',
    bamboo: 'bamboo_planks',
    cherry: 'cherry_planks',
    crimson: 'crimson_planks',
    warped: 'warped_planks',
  };
  return aliases[base] ?? base;
}
