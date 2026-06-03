export const BLOCK_COLORS = {
  'minecraft:air': null,
  'minecraft:stone': { top: '#8A8A8A', left: '#5E5E5E', right: '#707070' },
  'minecraft:cobblestone': { top: '#7D7D7D', left: '#555555', right: '#686868' },
  'minecraft:deepslate': { top: '#4A4A4F', left: '#2E2E33', right: '#3C3C41' },
  'minecraft:cobbled_deepslate': { top: '#5B5B62', left: '#3D3D43', right: '#4C4C53' },
  'minecraft:deepslate_bricks': { top: '#505058', left: '#34343A', right: '#44444A' },
  'minecraft:deepslate_tiles': { top: '#45454C', left: '#2D2D33', right: '#393940' },
  'minecraft:smooth_stone': { top: '#A0A0A0', left: '#6A6A6A', right: '#808080' },
  'minecraft:iron_block': { top: '#D8D8D8', left: '#A0A0A0', right: '#BCBCBC' },
  'minecraft:black_concrete': { top: '#0D0D0D', left: '#060606', right: '#0A0A0A' },
  'minecraft:orange_concrete': { top: '#E06B10', left: '#9E4B0B', right: '#C35E0F' },
  'minecraft:white_concrete': { top: '#CFCFCF', left: '#9A9A9A', right: '#B5B5B5' },
  'minecraft:white_wool': { top: '#D7D7D7', left: '#A3A3A3', right: '#BEBEBE' },
  'minecraft:blue_concrete': { top: '#2B3BA0', left: '#1A2670', right: '#232F88' },
  'minecraft:red_concrete': { top: '#A02020', left: '#6E1515', right: '#8C1C1C' },
  'minecraft:water': { top: '#2E4FA3', left: '#1D3480', right: '#263D93' },
  'minecraft:glass': { top: '#C9E8F0', left: '#94B5BF', right: '#AECBD4' },
  'minecraft:tinted_glass': { top: '#4B4058', left: '#2E2738', right: '#3C3448' },
  'minecraft:obsidian': { top: '#1A1025', left: '#0E0A17', right: '#140D1E' },
  'minecraft:dark_oak_planks': { top: '#3B2610', left: '#261809', right: '#301F0D' },
  'minecraft:oak_planks': { top: '#A8834A', left: '#775C34', right: '#906E3F' },
  'minecraft:netherrack': { top: '#6E2020', left: '#4A1515', right: '#5C1B1B' },
  'minecraft:soul_sand': { top: '#55412E', left: '#3A2C1F', right: '#473627' },
  'minecraft:hopper': { top: '#434343', left: '#2B2B2B', right: '#373737' },
  'minecraft:chest': { top: '#A0722A', left: '#6E4E1D', right: '#896025' },
  'minecraft:trapped_chest': { top: '#A06020', left: '#6E4215', right: '#89531C' },
  'minecraft:barrel': { top: '#6B4F2E', left: '#4A3620', right: '#5A4227' },
  'minecraft:dispenser': { top: '#6B6B6B', left: '#4A4A4A', right: '#5A5A5A' },
  'minecraft:dropper': { top: '#6B6B6B', left: '#4A4A4A', right: '#5A5A5A' },
  'minecraft:observer': { top: '#4A4A4A', left: '#2E2E2E', right: '#3C3C3C' },
  'minecraft:piston': { top: '#8B7355', left: '#5E4E39', right: '#756042' },
  'minecraft:piston_head': { top: '#8B7355', left: '#5E4E39', right: '#756042' },
  'minecraft:sticky_piston': { top: '#5A7A30', left: '#3D5420', right: '#4C6628' },
  'minecraft:redstone_block': { top: '#C81414', left: '#8C0E0E', right: '#AA1212' },
  'minecraft:redstone_lamp': { top: '#8C5A1A', left: '#5E3C12', right: '#754B16' },
  'minecraft:redstone_wire': { top: '#AA1515', left: '#760D0D', right: '#921111' },
  'minecraft:comparator': { top: '#7D7D7D', left: '#555555', right: '#686868' },
  'minecraft:repeater': { top: '#7D7D7D', left: '#555555', right: '#686868' },
  'minecraft:lever': { top: '#7A6545', left: '#53452F', right: '#665539' },
  'minecraft:rail': { top: '#6B5C3E', left: '#47401A', right: '#584E2A' },
  'minecraft:powered_rail': { top: '#B08A2E', left: '#7A5F1F', right: '#977526' },
  'minecraft:detector_rail': { top: '#8B2E2E', left: '#5E1F1F', right: '#752727' },
  'minecraft:activator_rail': { top: '#8B6B2E', left: '#5E481F', right: '#755A27' },
  'minecraft:furnace': { top: '#6B6B6B', left: '#4A4A4A', right: '#5A5A5A' },
  'minecraft:blast_furnace': { top: '#5A5A6B', left: '#3C3C4A', right: '#4A4A5A' },
  'minecraft:smoker': { top: '#5A6B5A', left: '#3C4A3C', right: '#4A5A4A' },
  'minecraft:crafting_table': { top: '#8B6B4A', left: '#5E4833', right: '#755B3F' },
  'minecraft:gravel': { top: '#8B7B6B', left: '#5E5347', right: '#755F55' },
  'minecraft:sand': { top: '#D6C882', left: '#9A905C', right: '#B5AA6F' },
  'minecraft:dirt': { top: '#8B6340', left: '#5E432B', right: '#755336' },
  'minecraft:grass_block': { top: '#5A9E3A', left: '#3D6B27', right: '#4C8330' },
  'minecraft:bedrock': { top: '#3C3C3C', left: '#272727', right: '#333333' },
};

export function getBlockColor(rawName) {
  if (!rawName) return { top: '#888888', left: '#555555', right: '#6A6A6A' };

  const name = rawName.split('[')[0].trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(BLOCK_COLORS, name)) return BLOCK_COLORS[name];

  const bare = name.replace('minecraft:', '');
  for (const [key, val] of Object.entries(BLOCK_COLORS)) {
    if (key === `minecraft:${bare}`) return val;
  }

  for (const [key, val] of Object.entries(BLOCK_COLORS)) {
    if (!val) continue;
    const keyword = key.replace('minecraft:', '');
    if (
      bare.startsWith(keyword) ||
      bare.endsWith(keyword) ||
      bare.includes(`_${keyword}`) ||
      bare.includes(`${keyword}_`)
    ) {
      return val;
    }
  }

  return { top: '#888888', left: '#555555', right: '#6A6A6A' };
}
