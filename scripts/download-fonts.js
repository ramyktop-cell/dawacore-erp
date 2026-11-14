#!/usr/bin/env node
/**
 * DawaCore — Font Downloader
 *
 * Downloads all required fonts for PDF reports.
 * Run: npm run fonts:download
 *
 * Idempotent: skips files that already exist and are valid.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const FONTS = [
  {
    name: 'Cairo',
    filename: 'Cairo.ttf',
    url: 'https://github.com/google/fonts/raw/main/ofl/cairo/Cairo%5Bslnt%2Cwght%5D.ttf',
    minSizeBytes: 100 * 1024, // 100KB minimum
    required: true,
  },
];

const FONTS_DIR = path.join(
  __dirname,
  '..',
  'src',
  'shared',
  'report-kit',
  'assets',
  'fonts',
);

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (currentUrl, redirectsLeft = 5) => {
      if (redirectsLeft === 0) {
        return reject(new Error(`Too many redirects for ${url}`));
      }

      https
        .get(
          currentUrl,
          {
            headers: {
              'User-Agent': 'DawaCore-Build/1.0',
              Accept: '*/*',
            },
          },
          (res) => {
            // Handle redirects (GitHub uses 301/302 for raw files)
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              res.resume(); // drain response
              return follow(res.headers.location, redirectsLeft - 1);
            }

            if (res.statusCode !== 200) {
              return reject(
                new Error(`HTTP ${res.statusCode} while downloading ${currentUrl}`),
              );
            }

            const fileStream = fs.createWriteStream(dest);
            let bytesWritten = 0;

            res.on('data', (chunk) => {
              bytesWritten += chunk.length;
            });

            res.pipe(fileStream);

            fileStream.on('finish', () => {
              fileStream.close();
              resolve(bytesWritten);
            });

            fileStream.on('error', (err) => {
              fs.unlink(dest, () => {});
              reject(err);
            });

            res.on('error', reject);
          },
        )
        .on('error', reject);
    };

    follow(url);
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function ensureFont(font) {
  const dest = path.join(FONTS_DIR, font.filename);

  // Already exists and valid?
  if (fs.existsSync(dest)) {
    const stat = fs.statSync(dest);
    if (stat.size >= font.minSizeBytes) {
      console.log(`✅ ${font.name}: already exists (${formatBytes(stat.size)})`);
      return true;
    }
    console.log(
      `⚠️  ${font.name}: exists but too small (${formatBytes(stat.size)}), re-downloading...`,
    );
    fs.unlinkSync(dest);
  }

  console.log(`⏬ ${font.name}: downloading from ${font.url}`);
  try {
    const bytes = await download(font.url, dest);
    console.log(`✅ ${font.name}: downloaded (${formatBytes(bytes)})`);
    return true;
  } catch (error) {
    console.error(`❌ ${font.name}: download failed — ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('📁 Fonts directory:', FONTS_DIR);
  fs.mkdirSync(FONTS_DIR, { recursive: true });

  let allOk = true;
  for (const font of FONTS) {
    const ok = await ensureFont(font);
    if (!ok) {
      allOk = false;
      if (font.required) {
        console.error(`\n❌ Required font "${font.name}" is missing.`);
      }
    }
  }

  if (!allOk) {
    console.error('\n💥 Some fonts failed to download.');
    process.exit(1);
  }

  console.log('\n🎉 All fonts ready.');
}

main().catch((err) => {
  console.error('💥 Unexpected error:', err);
  process.exit(1);
});
