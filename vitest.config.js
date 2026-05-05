import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@sudoku': path.resolve(__dirname, 'src/node_modules/@sudoku'),
      '@domain': path.resolve(__dirname, 'src/domain'),
    },
  },
});
