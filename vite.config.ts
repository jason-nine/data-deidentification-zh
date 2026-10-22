/// <reference types="vitest/config" />
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * 站点根地址，来自环境变量 `SITE_URL`（例如 `SITE_URL=https://example.com npm run build`）。
 *
 * 仓库里刻意不写死任何域名：未设置时留空串，页面退化为相对引用，部署到任何域名或子路径都成立。
 * 设置后 canonical、og:url、JSON-LD 的 @id、sitemap.xml 才会填成绝对地址。
 */
const SITE_URL = (() => {
  const raw = (process.env.SITE_URL ?? '').trim().replace(/\/+$/, '');
  return raw ? `${raw}/` : '';
})();

/** canonical／og:url 这类必须落到具体页面的位置用它：未设置时退回 `./`，不会是空串。 */
const SITE_ROOT = SITE_URL || './';

/**
 * Stamps today's date into the `__BUILD_DATE__` placeholders: index.html (the page's last update and
 * dateModified) and public/sitemap.xml, the latter after it is copied to the output dir.
 */
function buildDate(): Plugin {
  let outDir = 'dist';
  return {
    name: 'build-date',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    transformIndexHtml: (html) => html.replaceAll('__BUILD_DATE__', today()),
    closeBundle() {
      const file = resolve(outDir, 'sitemap.xml');
      try {
        writeFileSync(file, readFileSync(file, 'utf8').replace('__BUILD_DATE__', today()));
      } catch {
        // not a site build (e.g. the test runner)
      }
    },
  };
}

/**
 * 把 `__SITE_URL__` / `__SITE_ROOT__` 换成真实地址，覆盖 index.html 与 public 下需要绝对地址的静态文件。
 *
 * `__SITE_URL__` 为空串时得到相对引用（`#website`、`og.png`、`llms-full.txt`），因此不配 SITE_URL
 * 也能正常上线，只是没有绝对地址的 SEO 元数据。此时 sitemap.xml 会被删掉（相对 loc 不合规范），
 * robots.txt 的 Sitemap 行一并去掉。
 */
function siteUrl(): Plugin {
  let outDir = 'dist';
  const substitute = (text: string) => text.replaceAll('__SITE_ROOT__', SITE_ROOT).replaceAll('__SITE_URL__', SITE_URL);
  return {
    name: 'site-url',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    transformIndexHtml: (html) => substitute(html),
    closeBundle() {
      for (const name of ['sitemap.xml', 'robots.txt']) {
        const file = resolve(outDir, name);
        let text: string;
        try {
          text = readFileSync(file, 'utf8');
        } catch {
          continue; // not a site build (e.g. the test runner)
        }
        if (!SITE_URL && name === 'sitemap.xml') {
          rmSync(file, { force: true });
          continue;
        }
        if (!SITE_URL && name === 'robots.txt') text = text.replace(/^Sitemap:.*\n?/gm, '').trimEnd() + '\n';
        writeFileSync(file, substitute(text));
      }
    },
  };
}

const REPO = 'https://github.com/jason-nine/data-deidentification-zh';

/**
 * llms-full.txt: the README as plain Markdown for AI crawlers and agents (llmstxt.org), without the
 * screenshots and badges, and with its relative links made absolute.
 */
function llmsFull(): Plugin {
  let root = '.';
  return {
    name: 'llms-full',
    apply: 'build',
    configResolved(config) {
      root = config.root;
    },
    generateBundle() {
      const readme = readFileSync(resolve(root, 'README.md'), 'utf8')
        .replace(/^\[?!\[[^\]]*\]\([^)]*\)(\]\([^)]*\))?\s*$/gm, '') // images and image badges on their own line
        .replace(/<p align="center">[\s\S]*?<\/p>\n?/g, '') // the centred screenshot
        .replace(/\]\(#([^)]+)\)/g, `](${REPO}#$1)`)
        .replace(/\]\((?!https?:|mailto:)([^)]+)\)/g, `](${REPO}/blob/main/$1)`)
        .replace(/\n{3,}/g, '\n\n');
      const header = `> 本文件为 ${REPO} 的 README（完整操作说明），供 AI 搜索与代理程序阅读；网站摘要见 llms.txt。更新：${today()}\n\n`;
      this.emitFile({ type: 'asset', fileName: 'llms-full.txt', source: readme.replace(/^(# .*\n)/, `$1\n${header}`) });
    },
  };
}

/**
 * The OCR worker, engine and language models, served from this site under fixed names (tesseract.js
 * picks the core variant by file name and otherwise downloads everything from a CDN).
 * See specs/004-scanned-pdf-ocr/contracts/ocr-assets.md.
 */
const OCR_ASSETS: Record<string, string> = {
  'ocr/worker.min.js': 'node_modules/tesseract.js/dist/worker.min.js',
  ...Object.fromEntries(
    ['lstm', 'simd-lstm', 'relaxedsimd-lstm'].map((v) => [`ocr/core/tesseract-core-${v}.wasm.js`, `node_modules/tesseract.js-core/tesseract-core-${v}.wasm.js`]),
  ),
  ...Object.fromEntries(
    ['chi_sim', 'eng'].map((l) => [`ocr/lang/${l}.traineddata.gz`, `node_modules/@tesseract.js-data/${l}/4.0.0_best_int/${l}.traineddata.gz`]),
  ),
};

function ocrAssets(): Plugin {
  let root = '.';
  return {
    name: 'ocr-assets',
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const src = OCR_ASSETS[(req.url ?? '').split('?')[0].replace(/^\//, '')];
        if (!src) return next();
        res.setHeader('Content-Type', src.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
        res.end(readFileSync(resolve(root, src)));
      });
    },
    generateBundle() {
      for (const [fileName, src] of Object.entries(OCR_ASSETS)) this.emitFile({ type: 'asset', fileName, source: readFileSync(resolve(root, src)) });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [buildDate(), siteUrl(), llmsFull(), ocrAssets()],
  build: {
    target: 'es2022',
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    // PDF/docx round-trips embed fonts and zip files; give them headroom on slow CI runners.
    testTimeout: 30000,
  },
});
