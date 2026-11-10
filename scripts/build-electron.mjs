// Bundles electron/main.ts and electron/preload.ts to CommonJS in dist-electron/.
// electron-updater is bundled into main.cjs so the packaged app needs no node_modules at all
// (keeps the installer small; see electron-builder.yml `files`).
import { build } from 'esbuild';

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: true,
  external: ['electron'],
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': '"production"' },
};

await Promise.all([
  build({ ...common, entryPoints: ['electron/main.ts'], outfile: 'dist-electron/main.cjs' }),
  build({ ...common, entryPoints: ['electron/preload.ts'], outfile: 'dist-electron/preload.cjs' }),
]);
