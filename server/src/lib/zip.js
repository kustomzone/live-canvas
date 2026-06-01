// Minimal, dependency-free ZIP archive writer.
//
// We avoid pulling in `archiver` / `adm-zip` for the single export-preview
// feature. This implements just enough of the ZIP spec (APPNOTE.TXT) to
// produce a valid archive: per-entry local headers + DEFLATE (or STORE)
// payloads, a central directory, and the end-of-central-directory record.
//
// Entries are buffered and the whole archive is returned as one Buffer —
// canvases are small (a handful of PNGs + JSON), so streaming isn't needed.
import zlib from 'node:zlib';

// CRC-32 (IEEE 802.3) — table built once at module load.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// DOS date/time encoding for a Date (ZIP stores mod time in this format).
function dosDateTime(d) {
  const year = Math.max(1980, d.getFullYear());
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f);
  const date = (((year - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f);
  return { time: time & 0xffff, date: date & 0xffff };
}

/**
 * Build a ZIP archive Buffer from a list of entries.
 * @param {{ name: string, data: Buffer | string, store?: boolean }[]} entries
 *   `name` is the in-archive path (forward slashes). `store` skips deflate
 *   (use for already-compressed images so we don't waste CPU).
 * @returns {Buffer}
 */
export function buildZip(entries) {
  const now = new Date();
  const { time, date } = dosDateTime(now);
  const localChunks = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
    const crc = crc32(raw);
    let method = 0; // 0 = store
    let payload = raw;
    if (!entry.store) {
      const deflated = zlib.deflateRawSync(raw, { level: 9 });
      // Only use DEFLATE when it actually wins; otherwise store.
      if (deflated.length < raw.length) {
        method = 8;
        payload = deflated;
      }
    }
    // UTF-8 filename flag (bit 11) so non-ASCII titles in paths survive.
    const flags = 0x0800;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);       // local file header signature
    local.writeUInt16LE(20, 4);               // version needed
    local.writeUInt16LE(flags, 6);            // general purpose bit flag
    local.writeUInt16LE(method, 8);           // compression method
    local.writeUInt16LE(time, 10);            // last mod time
    local.writeUInt16LE(date, 12);            // last mod date
    local.writeUInt32LE(crc, 14);             // crc-32
    local.writeUInt32LE(payload.length, 18);  // compressed size
    local.writeUInt32LE(raw.length, 22);      // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);  // file name length
    local.writeUInt16LE(0, 28);               // extra field length

    localChunks.push(local, nameBuf, payload);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);          // central dir signature
    cd.writeUInt16LE(20, 4);                  // version made by
    cd.writeUInt16LE(20, 6);                  // version needed
    cd.writeUInt16LE(flags, 8);               // flags
    cd.writeUInt16LE(method, 10);             // method
    cd.writeUInt16LE(time, 12);               // mod time
    cd.writeUInt16LE(date, 14);               // mod date
    cd.writeUInt32LE(crc, 16);                // crc-32
    cd.writeUInt32LE(payload.length, 20);     // compressed size
    cd.writeUInt32LE(raw.length, 24);         // uncompressed size
    cd.writeUInt16LE(nameBuf.length, 28);     // name length
    cd.writeUInt16LE(0, 30);                  // extra length
    cd.writeUInt16LE(0, 32);                  // comment length
    cd.writeUInt16LE(0, 34);                  // disk number start
    cd.writeUInt16LE(0, 36);                  // internal attrs
    cd.writeUInt32LE(0, 38);                  // external attrs
    cd.writeUInt32LE(offset, 42);             // local header offset
    central.push(Buffer.concat([cd, nameBuf]));

    offset += local.length + nameBuf.length + payload.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);          // EOCD signature
  eocd.writeUInt16LE(0, 4);                   // disk number
  eocd.writeUInt16LE(0, 6);                   // disk with central dir
  eocd.writeUInt16LE(entries.length, 8);      // entries on this disk
  eocd.writeUInt16LE(entries.length, 10);     // total entries
  eocd.writeUInt32LE(centralBuf.length, 12);  // central dir size
  eocd.writeUInt32LE(offset, 16);             // central dir offset
  eocd.writeUInt16LE(0, 20);                  // comment length

  return Buffer.concat([...localChunks, centralBuf, eocd]);
}
