import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// Reuse the established vector logo; iOS applies its own corner mask and
// requires the 1024px store icon to have no alpha channel.
const source = (await readFile(new URL('../assets/icon.svg', import.meta.url), 'utf8'))
  .replace('rx="224"', 'rx="0"');
await sharp(Buffer.from(source)).resize(1024, 1024).removeAlpha().png()
  .toFile(new URL('../ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', import.meta.url).pathname);

const splash = await sharp(await readFile(new URL('../assets/splash.svg', import.meta.url)))
  .resize(2732, 2732).removeAlpha().png().toBuffer();
for (const name of ['splash-2732x2732-2.png', 'splash-2732x2732-1.png', 'splash-2732x2732.png']) {
  await writeFile(new URL(`../ios/App/App/Assets.xcassets/Splash.imageset/${name}`, import.meta.url), splash);
}
