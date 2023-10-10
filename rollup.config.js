import typescript from '@rollup/plugin-typescript';
import nodeResolve from 'rollup-plugin-node-resolve';
import minify from 'rollup-plugin-babel-minify';
import pkg from './package.json'

export default {
  input: 'src/index.ts',
  output: {
    name: "Configbee",
    file: pkg.browser,
    format: 'iife',
    sourcemap: true
  },
  plugins: [
    nodeResolve({ preferBuiltins: true, browser: true }),
    typescript(),
    minify({ comments: false }),
  ]
};