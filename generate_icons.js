import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPng(width, height, drawFn) {
  const rowSize = width * 4 + 1;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = drawFn(x, y, width, height);
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const deflated = zlib.deflateSync(rawData);

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const combined = Buffer.concat([typeBuf, data]);
    crcBuf.writeUInt32BE(crc32(combined), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', deflated);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function drawIcon(x, y, w, h) {
  // Normalize coordinates (0 to 1)
  const nx = x / w;
  const ny = y / h;

  // Rounded rectangle for icon background with gradient (Indigo to Violet to Cyan)
  const cx = nx - 0.5;
  const cy = ny - 0.5;
  const r = Math.sqrt(cx * cx + cy * cy);

  // Background Gradient (Deep modern gradient from indigo to emerald/cyan)
  const bgR = Math.floor(79 + nx * 50 - ny * 30);
  const bgG = Math.floor(70 + (1 - nx) * 30 + ny * 60);
  const bgB = Math.floor(229 - nx * 40 + ny * 20);

  // Rounded squircle mask
  const cornerRadius = 0.22;
  const dx = Math.max(0, Math.abs(cx) - (0.5 - cornerRadius));
  const dy = Math.max(0, Math.abs(cy) - (0.5 - cornerRadius));
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > cornerRadius) {
    return [0, 0, 0, 0]; // Transparent outside squircle
  }

  // Draw media capture badge: an eye/aperture + download triangle + photo mountains
  // Central circular lens / media frame
  const lensR = Math.sqrt((nx - 0.5) ** 2 + (ny - 0.46) ** 2);
  
  // Media Camera / Capture symbol
  const inFrame = nx >= 0.22 && nx <= 0.78 && ny >= 0.22 && ny <= 0.74;
  const isBorder = (inFrame && (
    (Math.abs(nx - 0.22) < 0.06) || (Math.abs(nx - 0.78) < 0.06) ||
    (Math.abs(ny - 0.22) < 0.06) || (Math.abs(ny - 0.74) < 0.06)
  ));

  // Small circle for lens / video play arrow
  // Play arrow in the center:
  const px = nx - 0.44;
  const py = ny - 0.48;
  const inPlayTriangle = px >= 0 && px <= 0.22 && Math.abs(py) <= (0.22 - px) * 0.9;

  // Download arrow at bottom
  const isArrowStem = nx >= 0.44 && nx <= 0.56 && ny >= 0.48 && ny <= 0.78;
  const isArrowHead = ny >= 0.65 && ny <= 0.84 && Math.abs(nx - 0.5) <= (0.84 - ny) * 0.9;
  const isDownload = isArrowStem || isArrowHead;

  // Let's create an elegant icon: Outer glowing rounded shape, white media playback/camera icon
  if (isDownload || inPlayTriangle || (lensR >= 0.16 && lensR <= 0.24) || (nx >= 0.70 && nx <= 0.76 && ny >= 0.26 && ny <= 0.32)) {
    return [255, 255, 255, 245];
  }

  return [bgR, bgG, bgB, 255];
}

const iconsDir = path.resolve('icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 32, 48, 128].forEach(size => {
  const buf = createPng(size, size, drawIcon);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), buf);
  console.log(`Generated icon${size}.png (${size}x${size})`);
});
