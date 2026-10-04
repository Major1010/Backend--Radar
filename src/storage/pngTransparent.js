const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

// Simple CRC32 implementation for PNG chunks
const makeCrcTable = () => {
  let c;
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c >>> 0;
  }
  return crcTable;
};

const crcTable = makeCrcTable();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Strips dark/black backgrounds from PNG and outputs a true transparent PNG
 */
function makePngTransparent(inputPath, outputPath) {
  try {
    if (!fs.existsSync(inputPath)) return false;
    const buf = fs.readFileSync(inputPath);

    // Verify PNG Signature
    if (buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) {
      return false;
    }

    let offset = 8;
    let width = 0, height = 0, bitDepth = 0, colorType = 0;
    const idatBuffers = [];

    while (offset < buf.length) {
      const length = buf.readUInt32BE(offset);
      const type = buf.slice(offset + 4, offset + 8).toString('ascii');
      const data = buf.slice(offset + 8, offset + 8 + length);

      if (type === 'IHDR') {
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        bitDepth = data.readUInt8(8);
        colorType = data.readUInt8(9);
      } else if (type === 'IDAT') {
        idatBuffers.push(data);
      } else if (type === 'IEND') {
        break;
      }
      offset += 12 + length;
    }

    // Only process 8-bit RGBA (colorType 6) or 8-bit RGB (colorType 2)
    if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
      // Fallback: copy as is
      fs.copyFileSync(inputPath, outputPath);
      return true;
    }

    const compressed = Buffer.concat(idatBuffers);
    const uncompressed = zlib.inflateSync(compressed);

    const bpp = colorType === 6 ? 4 : 3;
    const stride = 1 + width * bpp;
    const outStride = 1 + width * 4;
    const outRaw = Buffer.alloc(height * outStride);

    // Unfilter scanlines and process transparency
    const currentLine = Buffer.alloc(width * bpp);
    const prevLine = Buffer.alloc(width * bpp);

    for (let y = 0; y < height; y++) {
      const filterType = uncompressed[y * stride];
      const lineStart = y * stride + 1;

      // Unfilter current line
      for (let x = 0; x < width * bpp; x++) {
        const raw = uncompressed[lineStart + x];
        const a = x >= bpp ? currentLine[x - bpp] : 0;
        const b = prevLine[x];
        const c = x >= bpp ? prevLine[x - bpp] : 0;

        let val = raw;
        if (filterType === 1) { // Sub
          val = (raw + a) & 0xff;
        } else if (filterType === 2) { // Up
          val = (raw + b) & 0xff;
        } else if (filterType === 3) { // Average
          val = (raw + Math.floor((a + b) / 2)) & 0xff;
        } else if (filterType === 4) { // Paeth
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          let pr = c;
          if (pa <= pb && pa <= pc) pr = a;
          else if (pb <= pc) pr = b;
          val = (raw + pr) & 0xff;
        }
        currentLine[x] = val;
      }

      currentLine.copy(prevLine);

      // Write out to outRaw with filterType 0 (None)
      const outLineStart = y * outStride;
      outRaw[outLineStart] = 0; // Filter None

      for (let x = 0; x < width; x++) {
        const srcIdx = x * bpp;
        const dstIdx = outLineStart + 1 + x * 4;

        const r = currentLine[srcIdx];
        const g = currentLine[srcIdx + 1];
        const b = currentLine[srcIdx + 2];
        const origA = (colorType === 6) ? currentLine[srcIdx + 3] : 255;

        // Determine transparency based on darkness/black background
        // Threshold: if R, G, B are all very dark, make transparent
        const maxVal = Math.max(r, g, b);
        let newA = origA;

        if (maxVal < 18) {
          newA = 0;
        } else if (maxVal < 45) {
          // Smooth anti-aliased edge feathering
          const factor = (maxVal - 18) / (45 - 18);
          newA = Math.round(origA * factor);
        }

        outRaw[dstIdx] = r;
        outRaw[dstIdx + 1] = g;
        outRaw[dstIdx + 2] = b;
        outRaw[dstIdx + 3] = newA;
      }
    }

    // Deflate output raw buffer
    const newIdatData = zlib.deflateSync(outRaw, { level: 9 });

    // Build new PNG File
    const parts = [];

    // 1. Signature
    parts.push(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    // 2. IHDR
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(width, 0);
    ihdrData.writeUInt32BE(height, 4);
    ihdrData.writeUInt8(8, 8); // 8 bit
    ihdrData.writeUInt8(6, 9); // RGBA
    ihdrData.writeUInt8(0, 10);
    ihdrData.writeUInt8(0, 11);
    ihdrData.writeUInt8(0, 12);

    const ihdrChunk = Buffer.alloc(12 + 13);
    ihdrChunk.writeUInt32BE(13, 0);
    ihdrChunk.write('IHDR', 4, 'ascii');
    ihdrData.copy(ihdrChunk, 8);
    ihdrChunk.writeUInt32BE(crc32(ihdrChunk.slice(4, 21)), 21);
    parts.push(ihdrChunk);

    // 3. IDAT
    const idatChunk = Buffer.alloc(12 + newIdatData.length);
    idatChunk.writeUInt32BE(newIdatData.length, 0);
    idatChunk.write('IDAT', 4, 'ascii');
    newIdatData.copy(idatChunk, 8);
    const idatCrcBuf = Buffer.concat([Buffer.from('IDAT', 'ascii'), newIdatData]);
    idatChunk.writeUInt32BE(crc32(idatCrcBuf), 8 + newIdatData.length);
    parts.push(idatChunk);

    // 4. IEND
    const iendChunk = Buffer.alloc(12);
    iendChunk.writeUInt32BE(0, 0);
    iendChunk.write('IEND', 4, 'ascii');
    iendChunk.writeUInt32BE(crc32(Buffer.from('IEND', 'ascii')), 8);
    parts.push(iendChunk);

    const finalBuf = Buffer.concat(parts);
    fs.writeFileSync(outputPath, finalBuf);
    return true;
  } catch (err) {
    console.error('Error making PNG transparent:', err);
    try {
      fs.copyFileSync(inputPath, outputPath);
    } catch (e) {}
    return false;
  }
}

module.exports = { makePngTransparent };
