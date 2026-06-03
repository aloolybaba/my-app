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
const all = name => ({ top: tex(name), left: tex(name), right: tex(name) });
const topSide = (top, side) => ({ top: tex(top), left: tex(side), right: tex(side) });
const custom = (top, left, right) => ({ top: tex(top), left: tex(left), right: tex(right) });

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
  if (name === 'furnace') return custom('furnace_top', 'furnace_front', 'furnace_side');
  if (name === 'blast_furnace') return custom('blast_furnace_top', 'blast_furnace_front', 'blast_furnace_side');
  if (name === 'smoker') return custom('smoker_top', 'smoker_front', 'smoker_side');
  if (name === 'barrel') return topSide(states.open === 'true' ? 'barrel_top_open' : 'barrel_top', 'barrel_side');
  if (name === 'dispenser') return custom('dispenser_front_vertical', 'dispenser_front', 'furnace_side');
  if (name === 'dropper') return custom('dropper_front_vertical', 'dropper_front', 'furnace_side');
  if (name === 'hopper') return topSide('hopper_inside', 'hopper_outside');
  if (name === 'observer') return topSide('observer_top', 'observer_side');
  if (name === 'piston') return custom('piston_top_normal', 'piston_side', 'piston_side');
  if (name === 'sticky_piston') return custom('piston_top_sticky', 'piston_side', 'piston_side');
  if (name === 'redstone_lamp') return all(states.lit === 'true' ? 'redstone_lamp_on' : 'redstone_lamp');
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

  for (const suffix of ['_slab', '_stairs', '_wall', '_fence', '_fence_gate', '_door', '_trapdoor', '_button', '_pressure_plate']) {
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
