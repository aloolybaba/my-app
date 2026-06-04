export function resolveFaces(rawBlockName) {
  const full = (rawBlockName ?? '').toLowerCase();
  const name = full.replace('minecraft:', '').split('[')[0].trim();
  const stateString = full.includes('[') ? full.slice(full.indexOf('[') + 1, full.lastIndexOf(']')) : '';
  const states = Object.fromEntries(
    stateString
      .split(',')
      .filter(Boolean)
      .map(part => {
        const [key, value] = part.split('=');
        return [key?.trim(), value?.trim()];
      }),
  );

  return resolveByName(name, states);
}

const tex = name => `${name}.png`;
const all = name => cube(tex(name), tex(name), tex(name));
const topSide = (top, side) => cube(tex(top), tex(side), tex(side));
const custom = (top, left, right) => cube(tex(top), tex(left), tex(right));
const cube = (top, left, right) => ({ top, left, right, shape: 'cube' });
const topFlat = texture => ({ top: tex(texture), left: null, right: null, shape: 'top_flat' });
const sideFlat = (texture, side = 'both') => ({ top: null, left: tex(texture), right: tex(texture), shape: 'side_flat', side });
const cross = texture => ({ top: null, left: tex(texture), right: tex(texture), shape: 'cross' });

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
      front: name === 'sticky_piston' ? 'piston_top_sticky' : 'piston_top_normal',
      back: 'piston_bottom',
      side: 'piston_side',
      top: 'piston_side',
    });
  }
  if (name === 'piston_head') return custom('piston_top_normal', 'piston_side', 'piston_side');
  if (name === 'redstone_lamp') return all(states.lit === 'true' ? 'redstone_lamp_on' : 'redstone_lamp');
  if (name === 'redstone_wire') return topFlat('redstone_dust_dot');
  if (name === 'repeater') return topFlat(states.powered === 'true' ? 'repeater_on' : 'repeater');
  if (name === 'comparator') return topFlat(states.powered === 'true' ? 'comparator_on' : 'comparator');
  if (name === 'redstone_torch' || name === 'redstone_wall_torch') return cross(states.lit === 'false' ? 'redstone_torch_off' : 'redstone_torch');
  if (name === 'torch' || name === 'wall_torch') return cross('torch');
  if (name === 'soul_torch' || name === 'soul_wall_torch') return cross('soul_torch');
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
  if (name.endsWith('_pane')) return cross(name);
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
