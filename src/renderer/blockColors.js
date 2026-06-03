export const BASE_COLORS = {
  air: null,
  cave_air: null,
  void_air: null,

  stone: { top: '#8A8A8A', left: '#5E5E5E', right: '#737373' },
  smooth_stone: { top: '#A3A3A3', left: '#707070', right: '#898989' },
  cobblestone: { top: '#7D7D7D', left: '#565656', right: '#696969' },
  mossy_cobblestone: { top: '#6E7D5A', left: '#4C5640', right: '#5D6A4D' },
  stone_bricks: { top: '#7A7A7A', left: '#545454', right: '#676767' },
  andesite: { top: '#8C8C8C', left: '#606060', right: '#767676' },
  diorite: { top: '#B8B8B8', left: '#808080', right: '#9C9C9C' },
  granite: { top: '#9C7060', left: '#6B4D42', right: '#826053' },
  calcite: { top: '#DADAD0', left: '#979790', right: '#B8B8B0' },
  tuff: { top: '#7A7A6A', left: '#545448', right: '#676759' },

  deepslate: { top: '#4A4A4F', left: '#313136', right: '#3E3E43' },
  cobbled_deepslate: { top: '#5A5A60', left: '#3D3D42', right: '#4C4C52' },
  polished_deepslate: { top: '#525258', left: '#37373C', right: '#444449' },
  deepslate_bricks: { top: '#4E4E54', left: '#353539', right: '#424247' },
  deepslate_tiles: { top: '#484850', left: '#303035', right: '#3C3C42' },
  blackstone: { top: '#2D2730', left: '#1E1A22', right: '#262129' },
  polished_blackstone: { top: '#302A33', left: '#211B24', right: '#29232C' },
  basalt: { top: '#5A5A64', left: '#3D3D45', right: '#4C4C57' },

  netherrack: { top: '#6E2020', left: '#4A1616', right: '#5C1C1C' },
  nether_bricks: { top: '#302020', left: '#201515', right: '#281B1B' },
  red_nether_bricks: { top: '#6A1818', left: '#471010', right: '#581414' },
  soul_sand: { top: '#55412E', left: '#3A2C1F', right: '#473629' },
  soul_soil: { top: '#4A3828', left: '#322618', right: '#3E2E20' },
  magma_block: { top: '#7A3A18', left: '#54280F', right: '#673114' },

  iron_block: { top: '#D8D8D8', left: '#969696', right: '#B8B8B8' },
  gold_block: { top: '#F5C518', left: '#A88910', right: '#CFA815' },
  diamond_block: { top: '#60E8D8', left: '#42A297', right: '#52C5B5' },
  emerald_block: { top: '#30D060', left: '#219142', right: '#29B053' },
  redstone_block: { top: '#CC1414', left: '#8C0E0E', right: '#AA1212' },
  lapis_block: { top: '#1C4E98', left: '#133568', right: '#183E80' },
  coal_block: { top: '#1A1A1A', left: '#111111', right: '#161616' },
  netherite_block: { top: '#3E3840', left: '#2A252C', right: '#342E36' },
  copper_block: { top: '#C07848', left: '#855332', right: '#A2633D' },
  amethyst_block: { top: '#8060A8', left: '#584273', right: '#6C518E' },

  iron_ore: { top: '#8A7870', left: '#5F5250', right: '#756360' },
  gold_ore: { top: '#8A7850', left: '#5F5236', right: '#756045' },
  diamond_ore: { top: '#709090', left: '#4D6363', right: '#5F7979' },
  redstone_ore: { top: '#8A5050', left: '#5F3636', right: '#754444' },
  emerald_ore: { top: '#6A8A6A', left: '#486048', right: '#587858' },
  lapis_ore: { top: '#607888', left: '#42535F', right: '#526574' },
  coal_ore: { top: '#585858', left: '#3C3C3C', right: '#4A4A4A' },
  copper_ore: { top: '#8A7060', left: '#5F4D42', right: '#755E51' },

  quartz_block: { top: '#E8E4DC', left: '#A19E98', right: '#C5C2BC' },
  prismarine: { top: '#608878', left: '#425E53', right: '#527467' },
  prismarine_bricks: { top: '#68A090', left: '#476F64', right: '#578879' },
  dark_prismarine: { top: '#305048', left: '#203830', right: '#28443C' },
  sea_lantern: { top: '#A8D8CC', left: '#749694', right: '#8EB8B0' },

  oak_planks: { top: '#AC8840', left: '#77602C', right: '#927335' },
  spruce_planks: { top: '#7A5830', left: '#553D21', right: '#664C28' },
  birch_planks: { top: '#C8B870', left: '#8C804E', right: '#AA9C5F' },
  jungle_planks: { top: '#9C6840', left: '#6D492C', right: '#845836' },
  acacia_planks: { top: '#B85830', left: '#803E21', right: '#9C4C28' },
  dark_oak_planks: { top: '#3C2410', left: '#29180A', right: '#321E0D' },
  mangrove_planks: { top: '#7A3028', left: '#55211B', right: '#662823' },
  bamboo_planks: { top: '#B8A840', left: '#80762C', right: '#9A8E35' },
  cherry_planks: { top: '#D09080', left: '#916458', right: '#AD7A6C' },
  crimson_planks: { top: '#682840', left: '#481C2C', right: '#582236' },
  warped_planks: { top: '#287870', left: '#1C544E', right: '#22645F' },
  oak_log: { top: '#9A8048', left: '#6B5832', right: '#82693D' },
  spruce_log: { top: '#604030', left: '#423020', right: '#523628' },
  birch_log: { top: '#D0C8B0', left: '#918C7A', right: '#AAAA95' },
  jungle_log: { top: '#786040', left: '#52432C', right: '#635235' },
  acacia_log: { top: '#808080', left: '#585858', right: '#6C6C6C' },
  dark_oak_log: { top: '#484020', left: '#323016', right: '#3C381A' },

  oak_leaves: { top: '#3A7020', left: '#285016', right: '#326019' },
  spruce_leaves: { top: '#2A5030', left: '#1D3821', right: '#234228' },
  birch_leaves: { top: '#4A8030', left: '#335821', right: '#3D6C28' },
  jungle_leaves: { top: '#2E7020', left: '#204E16', right: '#276019' },
  acacia_leaves: { top: '#4E8020', left: '#375816', right: '#426C1A' },

  redstone_lamp: { top: '#906040', left: '#64422C', right: '#785235' },
  observer: { top: '#555555', left: '#3A3A3A', right: '#474747' },
  piston: { top: '#8A7258', left: '#604F3D', right: '#756148' },
  sticky_piston: { top: '#5A7A30', left: '#3E5421', right: '#4C6628' },
  piston_head: { top: '#8A7258', left: '#604F3D', right: '#756148' },
  dispenser: { top: '#666666', left: '#464646', right: '#565656' },
  dropper: { top: '#666666', left: '#464646', right: '#565656' },
  hopper: { top: '#404040', left: '#2C2C2C', right: '#363636' },
  comparator: { top: '#888888', left: '#5E5E5E', right: '#737373' },
  repeater: { top: '#888888', left: '#5E5E5E', right: '#737373' },
  lever: { top: '#7A6848', left: '#55482C', right: '#665839' },

  rail: { top: '#7A6840', left: '#55492C', right: '#665835' },
  powered_rail: { top: '#C09830', left: '#856A21', right: '#A28128' },
  detector_rail: { top: '#902020', left: '#641616', right: '#7A1B1B' },
  activator_rail: { top: '#906020', left: '#644316', right: '#7A521B' },

  chest: { top: '#A07028', left: '#6E4D1C', right: '#875E22' },
  trapped_chest: { top: '#A06028', left: '#6E421C', right: '#875222' },
  ender_chest: { top: '#1A4A4A', left: '#113232', right: '#163E3E' },
  barrel: { top: '#6A5030', left: '#493721', right: '#584228' },
  furnace: { top: '#666666', left: '#464646', right: '#565656' },
  blast_furnace: { top: '#585870', left: '#3D3D4E', right: '#4A4A5E' },
  smoker: { top: '#586858', left: '#3D4B3D', right: '#4A584A' },
  crafting_table: { top: '#8A6840', left: '#5F492C', right: '#755835' },
  anvil: { top: '#404040', left: '#2C2C2C', right: '#363636' },
  grindstone: { top: '#686868', left: '#484848', right: '#585858' },
  stonecutter: { top: '#8A8A8A', left: '#5F5F5F', right: '#747474' },
  bookshelf: { top: '#A07840', left: '#6E542C', right: '#876335' },
  lectern: { top: '#A08040', left: '#6E582C', right: '#876A35' },

  dirt: { top: '#8B6040', left: '#60422C', right: '#755035' },
  grass_block: { top: '#5A9A3A', left: '#3E6B28', right: '#4C8230' },
  podzol: { top: '#7A6030', left: '#554321', right: '#665028' },
  mycelium: { top: '#787090', left: '#535064', right: '#656078' },
  farmland: { top: '#7A5030', left: '#543821', right: '#674228' },
  mud: { top: '#404840', left: '#2C322C', right: '#363E36' },
  mud_bricks: { top: '#8A6850', left: '#5F4837', right: '#756044' },
  packed_mud: { top: '#8A7058', left: '#5F4D3D', right: '#756049' },
  sand: { top: '#DEC880', left: '#9B8C58', right: '#BBAA6C' },
  red_sand: { top: '#C87840', left: '#8C542C', right: '#AA6636' },
  gravel: { top: '#8A7A6A', left: '#5F5549', right: '#747060' },
  clay: { top: '#9898A8', left: '#6A6A75', right: '#808090' },
  snow_block: { top: '#F0F0F8', left: '#A8A8B0', right: '#CCCCDB' },
  ice: { top: '#90B8D8', left: '#647F96', right: '#789CB5' },
  packed_ice: { top: '#80A8D0', left: '#587590', right: '#6C8FAB' },
  blue_ice: { top: '#6898D0', left: '#496A91', right: '#5681B0' },
  obsidian: { top: '#1A1025', left: '#100A1A', right: '#150D20' },
  crying_obsidian: { top: '#28105A', left: '#1C0B3E', right: '#220E4C' },
  bedrock: { top: '#3C3C3C', left: '#292929', right: '#333333' },
  moss_block: { top: '#4A6828', left: '#34481C', right: '#3E5922' },
  slime_block: { top: '#4AC848', left: '#339033', right: '#3DAD3C' },
  honey_block: { top: '#C89040', left: '#8C642C', right: '#AA7836' },
  water: { top: '#2E4FA3', left: '#1F3772', right: '#26428A' },
  lava: { top: '#D05818', left: '#913E11', right: '#B04C14' },
  sponge: { top: '#C8C840', left: '#8C8C2C', right: '#AAAA35' },
  wet_sponge: { top: '#A0A840', left: '#707440', right: '#888C3A' },
  end_stone: { top: '#D8D898', left: '#97976A', right: '#B8B880' },
  end_stone_bricks: { top: '#D0D088', left: '#919160', right: '#B0B074' },
  purpur_block: { top: '#A080A8', left: '#705874', right: '#88688E' },
  glowstone: { top: '#C0A060', left: '#857042', right: '#A28851' },
  shroomlight: { top: '#D07840', left: '#91542C', right: '#B26436' },
  sandstone: { top: '#DCC870', left: '#9A8C4E', right: '#BBAA5F' },
  red_sandstone: { top: '#C07038', left: '#864E27', right: '#A35E2F' },
  bricks: { top: '#A05040', left: '#6E372C', right: '#874336' },
  sculk: { top: '#0A1820', left: '#060F16', right: '#08131B' },
  command_block: { top: '#9E6E50', left: '#6E4C37', right: '#855D43' },
  structure_block: { top: '#4060A0', left: '#2D4470', right: '#365488' },
  barrier: { top: '#D00010', left: '#910009', right: '#AA000D' },
  light: { top: '#FFFFA0', left: '#B2B26E', right: '#D5D587' },
};

const COLOR_FAMILIES = {
  white: { top: '#DCDCDC', left: '#989898', right: '#BABABA' },
  orange: { top: '#E06810', left: '#9C490B', right: '#BC580E' },
  magenta: { top: '#BE38A0', left: '#842770', right: '#A12F88' },
  light_blue: { top: '#3898D4', left: '#276898', right: '#308CB2' },
  yellow: { top: '#F0C010', left: '#A8860B', right: '#CCA30E' },
  lime: { top: '#60C020', left: '#428516', right: '#52A21B' },
  pink: { top: '#D868A0', left: '#974970', right: '#B45C88' },
  gray: { top: '#484848', left: '#323232', right: '#3C3C3C' },
  light_gray: { top: '#9A9A9A', left: '#6C6C6C', right: '#828282' },
  cyan: { top: '#157890', left: '#0E5364', right: '#127078' },
  purple: { top: '#6420A0', left: '#44166E', right: '#541B88' },
  blue: { top: '#2838A0', left: '#1C276E', right: '#222F88' },
  brown: { top: '#603018', left: '#422110', right: '#522815' },
  green: { top: '#385018', left: '#263810', right: '#304215' },
  red: { top: '#A01818', left: '#6E1010', right: '#881515' },
  black: { top: '#0E0E0E', left: '#090909', right: '#0C0C0C' },
};

const COLORED_MATERIALS = [
  'concrete',
  'concrete_powder',
  'wool',
  'terracotta',
  'stained_glass',
  'stained_glass_pane',
  'carpet',
  'shulker_box',
  'glazed_terracotta',
];

for (const [color, value] of Object.entries(COLOR_FAMILIES)) {
  for (const material of COLORED_MATERIALS) {
    BASE_COLORS[`${color}_${material}`] = value;
  }
}

BASE_COLORS.grey_concrete = BASE_COLORS.gray_concrete;
BASE_COLORS.light_grey_concrete = BASE_COLORS.light_gray_concrete;
BASE_COLORS.glass = { top: '#C8E8F0', left: '#8CB4BE', right: '#AACCD6' };
BASE_COLORS.tinted_glass = { top: '#4C4258', left: '#342E3E', right: '#40384C' };

const SUFFIXES = [
  '_slab',
  '_stairs',
  '_wall',
  '_fence',
  '_fence_gate',
  '_door',
  '_trapdoor',
  '_button',
  '_pressure_plate',
  '_sign',
  '_hanging_sign',
  '_pillar',
  '_bricks',
  '_block',
  '_tiles',
  '_tile',
  '_brick',
  '_pane',
  '_carpet',
];

const MODIFIERS = [
  'stripped_',
  'polished_',
  'cut_',
  'chiseled_',
  'smooth_',
  'mossy_',
  'waxed_',
  'cracked_',
  'exposed_',
  'weathered_',
  'oxidized_',
  'infested_',
  'dead_',
];

const MATERIAL_PREFIXES = [
  'dark_oak',
  'red_sandstone',
  'oak',
  'spruce',
  'birch',
  'jungle',
  'acacia',
  'mangrove',
  'bamboo',
  'cherry',
  'crimson',
  'warped',
  'stone',
  'deepslate',
  'blackstone',
  'basalt',
  'sandstone',
  'andesite',
  'diorite',
  'granite',
  'prismarine',
  'quartz',
  'purpur',
  'end_stone',
  'netherrack',
  'nether_bricks',
  'soul',
  'mud',
];

export function getBlockColor(rawName) {
  if (!rawName) return null;

  const cleaned = rawName
    .split('[')[0]
    .trim()
    .toLowerCase()
    .replace(/^minecraft:/, '');

  const exact = lookup(cleaned);
  if (exact !== undefined) return exact;

  for (const suffix of SUFFIXES) {
    if (!cleaned.endsWith(suffix)) continue;
    const base = cleaned.slice(0, -suffix.length);
    const color = lookupBaseVariants(base);
    if (color !== undefined) return color;
  }

  for (const modifier of MODIFIERS) {
    if (!cleaned.startsWith(modifier)) continue;
    const base = cleaned.slice(modifier.length);
    const color = lookupBaseVariants(base);
    if (color !== undefined) return color;
  }

  for (const color of Object.keys(COLOR_FAMILIES)) {
    if (cleaned.startsWith(`${color}_`)) {
      return BASE_COLORS[`${color}_concrete`] ?? BASE_COLORS[`${color}_wool`] ?? COLOR_FAMILIES[color];
    }
  }

  for (const material of MATERIAL_PREFIXES) {
    if (!cleaned.startsWith(material)) continue;
    const color = lookupBaseVariants(material);
    if (color !== undefined) return color;
  }

  return { top: '#808080', left: '#585858', right: '#6C6C6C' };
}

function lookup(name) {
  return Object.prototype.hasOwnProperty.call(BASE_COLORS, name) ? BASE_COLORS[name] : undefined;
}

function lookupBaseVariants(base) {
  return lookup(base)
    ?? lookup(`${base}_planks`)
    ?? lookup(`${base}_log`)
    ?? lookup(`${base}_block`)
    ?? lookup(`${base}_bricks`)
    ?? lookup(`${base}_concrete`)
    ?? lookup(`${base}_wool`);
}
