// 生成应用图标的脚本
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [16, 24, 32, 48, 64, 128, 256];

async function generateIcons() {
  const publicDir = path.join(__dirname, 'public');
  
  // 生成 PNG 图标
  for (const size of sizes) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#FF6B35"/>
          <stop offset="100%" style="stop-color:#FF8F5E"/>
        </linearGradient>
      </defs>
      <rect width="${size}" height="${size}" rx="${Math.round(size * 0.19)}" fill="url(#bg)"/>
      <text x="${size/2}" y="${size * 0.68}" font-family="Arial, sans-serif" font-size="${size * 0.6}" font-weight="bold" fill="white" text-anchor="middle">C</text>
    </svg>`;
    
    await sharp(Buffer.from(svg))
      .png()
      .toFile(path.join(publicDir, `icon-${size}.png`));
    
    console.log(`Generated icon-${size}.png`);
  }
  
  // 生成 256x256 的 ico 用 PNG（electron-builder 会自动转换）
  const svg256 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#FF6B35"/>
        <stop offset="100%" style="stop-color:#FF8F5E"/>
      </linearGradient>
    </defs>
    <rect width="256" height="256" rx="48" fill="url(#bg)"/>
    <text x="128" y="170" font-family="Arial, sans-serif" font-size="160" font-weight="bold" fill="white" text-anchor="middle">C</text>
  </svg>`;
  
  await sharp(Buffer.from(svg256))
    .png()
    .toFile(path.join(publicDir, 'icon.png'));
  
  console.log('Generated icon.png (256x256)');
  console.log('All icons generated!');
}

generateIcons().catch(console.error);
