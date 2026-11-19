import { build } from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

await build({
  entryPoints: [path.join(root, 'src', 'game-entry.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  outfile: path.join(root, 'public', 'game.bundle.js'),
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});

console.log('Built public/game.bundle.js');
