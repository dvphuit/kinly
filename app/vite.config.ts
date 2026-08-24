import { gzipSync } from 'node:zlib';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'node:path';

const ENTRY_CHUNK_BUDGET_BYTES = 500_000;
const ENTRY_GZIP_BUDGET_BYTES = 165_000;
const TOTAL_CSS_BUDGET_BYTES = 250_000;
const INITIAL_CSS_GZIP_BUDGET_BYTES = 40_000;
const WASM_BUNDLE_BUDGET_BYTES = 0;

function assetBuffer(source: string | Uint8Array): Buffer {
  return typeof source === 'string' ? Buffer.from(source, 'utf8') : Buffer.from(source);
}

function importedCssForChunk(output: object): Set<string> {
  const metadata = (output as { viteMetadata?: { importedCss?: Set<string> } }).viteMetadata;
  return metadata?.importedCss ?? new Set<string>();
}

function performanceBudgetPlugin(): Plugin {
  return {
    name: 'performance-budget',
    apply: 'build',
    generateBundle(_options, bundle) {
      let cssRawBytes = 0;
      let initialCssGzipBytes = 0;
      let wasmRawBytes = 0;
      const initialCssFiles = new Set<string>();

      Object.values(bundle).forEach((output) => {
        if (output.type !== 'chunk' || !output.isEntry) return;

        const rawBytes = Buffer.byteLength(output.code, 'utf8');
        const gzipBytes = gzipSync(output.code).byteLength;
        if (rawBytes > ENTRY_CHUNK_BUDGET_BYTES || gzipBytes > ENTRY_GZIP_BUDGET_BYTES) {
          this.error(
            `Entry chunk ${output.fileName} exceeds the performance budget: `
            + `${rawBytes} raw bytes / ${gzipBytes} gzip bytes `
            + `(limits: ${ENTRY_CHUNK_BUDGET_BYTES} / ${ENTRY_GZIP_BUDGET_BYTES}).`,
          );
        }

        importedCssForChunk(output).forEach((fileName) => initialCssFiles.add(fileName));
      });

      Object.values(bundle).forEach((output) => {
        if (output.type !== 'asset') return;
        const bytes = assetBuffer(output.source);

        if (output.fileName.endsWith('.css')) {
          cssRawBytes += bytes.byteLength;
          if (initialCssFiles.has(output.fileName)) {
            initialCssGzipBytes += gzipSync(bytes).byteLength;
          }
          return;
        }

        if (output.fileName.endsWith('.wasm')) {
          wasmRawBytes += bytes.byteLength;
        }
      });

      if (cssRawBytes > TOTAL_CSS_BUDGET_BYTES) {
        this.error(
          `CSS output exceeds the total raw performance budget: ${cssRawBytes} raw bytes `
          + `(limit: ${TOTAL_CSS_BUDGET_BYTES}).`,
        );
      }

      if (initialCssGzipBytes > INITIAL_CSS_GZIP_BUDGET_BYTES) {
        this.error(
          `Initial CSS exceeds the gzip performance budget: ${initialCssGzipBytes} gzip bytes `
          + `(limit: ${INITIAL_CSS_GZIP_BUDGET_BYTES}).`,
        );
      }

      if (wasmRawBytes > WASM_BUNDLE_BUDGET_BYTES) {
        this.error(
          `WASM output exceeds the benchmark gate: ${wasmRawBytes} raw bytes `
          + `(budget: ${WASM_BUNDLE_BUDGET_BYTES}). Add WASM only with benchmark evidence and an explicit budget update.`,
        );
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  plugins: [
    performanceBudgetPlugin(),
    basicSsl(),
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: 'auto',

      pwaAssets: {
        disabled: false,
        config: true,
      },

      manifest: {
        name: 'Kinly - Theo dõi Bé & Mẹ',
        short_name: 'Kinly',
        description: 'Ứng dụng theo dõi chăm sóc, tăng trưởng và nhật ký gia đình.',
        lang: 'vi',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui', 'browser'],
        orientation: 'portrait',
        prefer_related_applications: false,
        theme_color: '#FBF7F2',
        background_color: '#FBF7F2',
        icons: [
          {
            src: '/pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },

      injectManifest: {
        globPatterns: [
          '**/*.{js,css,html,svg,ico,woff2}',
          'pwa-*.png',
          'maskable-icon-*.png',
          'apple-touch-icon-*.png',
        ],
      },

      devOptions: {
        enabled: true,
        navigateFallback: 'index.html',
        suppressWarnings: true,
        type: 'module',
      },
    }),
  ],
  server: {
    host: true,
  },
});
