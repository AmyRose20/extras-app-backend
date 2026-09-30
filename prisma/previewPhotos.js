// Saves a few sample cartoon photos to prisma/seed-preview so you can look at them.
// Run with: node prisma/previewPhotos.js
const fs = require('fs');
const path = require('path');
const { makeFacePhoto, makeFullBodyPhoto } = require('./seedPhotos');

const samples = [
  { name: 'Aoife Byrne', gender: 'FEMALE', age: 34 },
  { name: 'Liam Doyle', gender: 'MALE', age: 27 },
  { name: 'Seamus Walsh', gender: 'MALE', age: 62 },
  { name: 'Niamh Kelly', gender: 'FEMALE', age: 22 },
];

async function main() {
  const folder = path.join(__dirname, 'seed-preview');
  fs.mkdirSync(folder, { recursive: true });

  for (const person of samples) {
    const fileName = person.name.toLowerCase().replace(/\s+/g, '-');
    fs.writeFileSync(path.join(folder, `${fileName}-face.jpg`), await makeFacePhoto(person));
    fs.writeFileSync(path.join(folder, `${fileName}-fullbody.jpg`), await makeFullBodyPhoto(person));
    console.log(`Made pictures for ${person.name}`);
  }
  console.log(`Done - open ${folder}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});