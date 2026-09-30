// Draws cartoon photos for the seed extras.
// Faces use the DiceBear "Avataaars" style (free for personal and commercial use).
// Full-body pictures put that same face on a simple drawn body.
const sharp = require('sharp');

const SKIN = ['614335', 'ae5d29', 'd08b5b', 'edb98a', 'ffdbb4'];
const HAIR_COLOURS = ['2c1b18', '4a312c', '724133', 'b58143', 'd6b370', 'c93305'];
const GREY_HAIR = ['e8e1e1', 'ecdcbf'];
const MALE_HAIR = ['shortFlat', 'shortRound', 'shortWaved', 'shortCurly', 'theCaesar', 'theCaesarAndSidePart', 'sides', 'shaggy', 'dreads01', 'frizzle'];
const FEMALE_HAIR = ['bob', 'bun', 'curly', 'curvy', 'longButNotTooLong', 'miaWallace', 'straight01', 'straight02', 'straightAndStrand', 'bigHair', 'fro'];
const CLOTHES = ['262e33', '25557c', '5199e4', '3c4f5c', '929598', 'a7ffc4', 'ff5c5c', 'ffafb9', 'e6e6e6'];
const TROUSERS = ['1f2a44', '2b2b2b', '4a3b2a', '3c4f5c', '5b4a3a'];
const BACKGROUNDS = ['f3d9b1', 'd9c2e9', 'bfe3e0', 'f6c9b0', 'cfe0f5'];

// Turns a name into a repeatable number, so the same extra always gets the same look
function hash(text) {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function pick(list, seed, salt) {
  return list[hash(seed + salt) % list.length];
}

let dicebear; // loaded once (DiceBear is an ES module, so we use import())
async function loadDicebear() {
  if (!dicebear) {
    const core = await import('@dicebear/core');
    const collection = await import('@dicebear/collection');
    dicebear = { createAvatar: core.createAvatar, avataaars: collection.avataaars };
  }
  return dicebear;
}

// The look of one extra: skin, hair, clothes. Same inputs always give the same look.
function lookFor({ name, gender, age }) {
  const hairStyles = gender === 'FEMALE' ? FEMALE_HAIR : MALE_HAIR;
  return {
    skin: pick(SKIN, name, 'skin'),
    hair: pick(hairStyles, name, 'hair'),
    hairColour: age >= 55 ? pick(GREY_HAIR, name, 'grey') : pick(HAIR_COLOURS, name, 'hc'),
    beard: gender === 'MALE' && hash(name + 'beard') % 3 === 0,
    glasses: hash(name + 'glasses') % 5 === 0,
    clothes: pick(CLOTHES, name, 'clothes'),
    trousers: pick(TROUSERS, name, 'trousers'),
    background: pick(BACKGROUNDS, name, 'bg'),
  };
}

async function faceSvg(person, look, withBackground = true) {
  const { createAvatar, avataaars } = await loadDicebear();
  return createAvatar(avataaars, {
    seed: person.name,
    skinColor: [look.skin],
    top: [look.hair],
    hairColor: [look.hairColour],
    facialHair: ['beardLight', 'beardMedium'],
    facialHairColor: [look.hairColour],
    facialHairProbability: look.beard ? 100 : 0,
    accessories: ['prescription01', 'prescription02', 'round'],
    accessoriesProbability: look.glasses ? 100 : 0,
    accessoriesColor: ['262e33', '3c4f5c'],
    clothing: ['shirtCrewNeck', 'shirtVNeck', 'collarAndSweater', 'hoodie', 'blazerAndShirt'],
    clothesColor: [look.clothes],
    eyes: ['default', 'happy', 'side'],
    eyebrows: ['defaultNatural', 'flatNatural', 'raisedExcitedNatural'],
    mouth: ['default', 'smile', 'twinkle', 'serious'],
    backgroundColor: withBackground ? [look.background] : [],
  }).toString();
}

// Square headshot, returned as JPEG bytes
async function makeFacePhoto(person) {
  const look = lookFor(person);
  const svg = await faceSvg(person, look);
  return sharp(Buffer.from(svg)).resize(600, 600).jpeg({ quality: 88 }).toBuffer();
}

// Tall full-body picture, returned as JPEG bytes
async function makeFullBodyPhoto(person) {
  const look = lookFor(person);
  const head = await faceSvg(person, look, false);
  const skin = `#${look.skin}`;
  const top = `#${look.clothes}`;
  const legs = `#${look.trousers}`;

  // Build varies a little per person
  const build = 0.9 + (hash(person.name + 'build') % 25) / 100; // 0.90 - 1.14
  const cx = 300;
  const shoulder = 105 * build; // half shoulder width
  const hip = 80 * build;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <rect width="600" height="900" fill="#${look.background}"/>
  <ellipse cx="${cx}" cy="865" rx="150" ry="16" fill="#000" opacity="0.12"/>
  <!-- legs -->
  <path d="M${cx - hip} 560 L${cx - 12} 560 L${cx - 18} 835 L${cx - hip + 8} 835 Z" fill="${legs}"/>
  <path d="M${cx + 12} 560 L${cx + hip} 560 L${cx + hip - 8} 835 L${cx + 18} 835 Z" fill="${legs}"/>
  <!-- shoes -->
  <rect x="${cx - hip - 6}" y="828" width="${hip - 6}" height="26" rx="12" fill="#2a2320"/>
  <rect x="${cx + 12}" y="828" width="${hip - 6}" height="26" rx="12" fill="#2a2320"/>
  <!-- arms -->
  <path d="M${cx - shoulder} 300 Q${cx - shoulder - 30} 420 ${cx - shoulder - 14} 540 L${cx - shoulder + 22} 540 Q${cx - shoulder + 8} 420 ${cx - shoulder + 34} 320 Z" fill="${top}"/>
  <path d="M${cx + shoulder} 300 Q${cx + shoulder + 30} 420 ${cx + shoulder + 14} 540 L${cx + shoulder - 22} 540 Q${cx + shoulder - 8} 420 ${cx + shoulder - 34} 320 Z" fill="${top}"/>
  <circle cx="${cx - shoulder + 4}" cy="552" r="19" fill="${skin}"/>
  <circle cx="${cx + shoulder - 4}" cy="552" r="19" fill="${skin}"/>
  <!-- body -->
  <path d="M${cx - shoulder} 290 Q${cx} 262 ${cx + shoulder} 290 L${cx + hip + 4} 575 L${cx - hip - 4} 575 Z" fill="${top}"/>
  <rect x="${cx - hip - 4}" y="560" width="${(hip + 4) * 2}" height="15" fill="#000" opacity="0.15"/>
  <!-- head and shoulders from the face picture -->
  <svg x="${cx - 165}" y="-20" width="330" height="330" viewBox="0 0 280 280">${head.replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg>
</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}

module.exports = { makeFacePhoto, makeFullBodyPhoto };