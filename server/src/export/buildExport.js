// Export a whole canvas as a self-contained static site (index.html + viewer
// assets + images + inlined data) bundled into a ZIP, openable from file://
// with no server requests. Mirrors the live read-only preview.
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { paths } from '../store/paths.js';
import { readTree } from '../store/treeStore.js';
import { readNode } from '../store/nodeStore.js';
import { buildZip } from '../lib/zip.js';
import { log } from '../lib/log.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.join(__dirname, 'template');

// Strip the node JSON down to only the fields the static viewer needs, and
// rewrite the image path to a relative in-zip path (images/<hash>.png). We
// keep image_prompt out (only used for the generating placeholder) and any
// server-side bookkeeping fields.
function projectNode(node, images) {
  return {
    hash: node.hash,
    depth: node.depth ?? 0,
    parent: node.parent ?? null,
    title: node.title || '',
    caption: node.caption || '',
    hotspots: (node.hotspots || []).map((h) => ({
      label: h.label || '',
      anchor_xy: h.anchor_xy || null,
      leader_xy: h.leader_xy || null,
      next_hash: h.next_hash || null,
    })),
    sources: (node.sources || []).map((s) => ({
      title: s.title || '', url: s.url || '', snippet: s.snippet || '', source: s.source || '',
    })),
    text_layer: node.text_layer || [],
    image: images.full ? `images/${images.full}` : null,
    // Progressive-loading variants (when generated): the viewer shows the
    // blurred placeholder first, then upgrades to medium/full on load.
    image_blur: images.blur ? `images/${images.blur}` : null,
    image_medium: images.medium ? `images/${images.medium}` : null,
    image_w: node.image_w,
    image_h: node.image_h,
    path: Array.isArray(node.path)
      ? node.path.map((p) => ({ hash: p.hash, title: p.title || '' }))
      : undefined,
  };
}

// A filesystem-safe slug for the download filename.
function slugify(s) {
  return String(s || 'flipbook')
    .replace(/[\/\\:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60) || 'flipbook';
}

/**
 * Build the static-site FILES for a canvas (the same set the export zip
 * contains): index.html / viewer.js / viewer.css / data.js + images/. Shared
 * by buildCanvasExport (which zips them) and the example-doc-publish script
 * (which writes them to a GitHub Pages directory).
 *
 * @param {string} canvasId
 * @param {{ lang?: 'zh'|'en', basePath?: string }} [opts]
 *   basePath — optional path prefix recorded in the payload (unused by the
 *   viewer today since all asset refs are relative, but reserved).
 * @returns {Promise<{ entries: {name:string,data:Buffer|string,store?:boolean}[],
 *   topic: string, payload: object, cover: string|null, nodeCount: number,
 *   orientation: 'landscape'|'portrait' }>}
 */
export async function buildCanvasSite(canvasId, opts = {}) {
  const lang = opts.lang === 'en' ? 'en' : 'zh';
  const tree = await readTree(canvasId);
  const nodeHashes = Object.keys(tree.nodes || {});
  if (!nodeHashes.length) throw new Error('empty_canvas');

  const entries = [];
  const exportNodes = {};
  const imageDir = paths.imageDir(canvasId);

  for (const hash of nodeHashes) {
    let node;
    try { node = await readNode(canvasId, hash); }
    catch { continue; } // tree entry without a node file (e.g. cancelled) — skip
    // Skip still-generating skeletons that never produced an image/title.
    if (node.status === 'generating' && !node.image) continue;

    // Bundle the node's image plus its progressive-loading variants (blur /
    // medium) when present, so the viewer can show a blurred placeholder that
    // upgrades to the full picture. The variant filenames follow the app's
    // convention: <hash>.png + <hash>.blur.jpg + <hash>.medium.jpg.
    const images = { full: null, blur: null, medium: null };
    if (node.image) {
      const base = path.basename(node.image); // e.g. "<hash>.png"
      const abs = path.join(imageDir, base);
      if (fsSync.existsSync(abs)) {
        const buf = await fs.readFile(abs);
        images.full = base;
        const store = /\.(png|jpe?g)$/i.test(base);
        entries.push({ name: `images/${base}`, data: buf, store });
      }
      // Variants are only generated for real PNGs (the svg fallback has none).
      if (/\.png$/i.test(base)) {
        for (const variant of ['blur', 'medium']) {
          const vName = `${hash}.${variant}.jpg`;
          const vAbs = path.join(imageDir, vName);
          if (fsSync.existsSync(vAbs)) {
            const vBuf = await fs.readFile(vAbs);
            images[variant] = vName;
            entries.push({ name: `images/${vName}`, data: vBuf, store: true });
          }
        }
      }
    }
    exportNodes[hash] = projectNode(node, images);
  }

  // Drop tree entries that didn't make it into exportNodes so the catalog
  // and breadcrumb never point at missing nodes.
  const treeNodes = {};
  for (const [h, n] of Object.entries(tree.nodes || {})) {
    if (!exportNodes[h]) continue;
    treeNodes[h] = {
      title: n.title || '',
      depth: n.depth ?? 0,
      parent: n.parent ?? null,
      children: (n.children || []).filter((c) => exportNodes[c]),
    };
  }
  // Ensure root is valid/present.
  let rootHash = tree.root && exportNodes[tree.root] ? tree.root : null;
  if (!rootHash) {
    rootHash = Object.keys(exportNodes).find((h) => !treeNodes[h]?.parent) || Object.keys(exportNodes)[0] || null;
  }

  const orientation = tree.orientation === 'portrait' ? 'portrait' : 'landscape';
  const payload = {
    topic: tree.topic || '',
    root: rootHash,
    orientation,
    lang,
    nodes: exportNodes,
    tree: { nodes: treeNodes, root: rootHash },
  };

  // Read template assets.
  const [html, css, js] = await Promise.all([
    fs.readFile(path.join(TEMPLATE_DIR, 'index.html'), 'utf8'),
    fs.readFile(path.join(TEMPLATE_DIR, 'viewer.css'), 'utf8'),
    fs.readFile(path.join(TEMPLATE_DIR, 'viewer.js'), 'utf8'),
  ]);

  const title = tree.topic || 'Flipbook';
  const indexHtml = html.replace('__TITLE__', title.replace(/</g, '&lt;'));
  const dataJs = 'window.__FLIPBOOK__ = ' + JSON.stringify(payload) + ';\n';

  entries.push({ name: 'index.html', data: indexHtml });
  entries.push({ name: 'viewer.css', data: css });
  entries.push({ name: 'viewer.js', data: js });
  entries.push({ name: 'data.js', data: dataJs });

  const cover = rootHash && exportNodes[rootHash] ? exportNodes[rootHash].image : null;
  return {
    entries,
    topic: title,
    payload,
    cover,
    orientation,
    nodeCount: Object.keys(exportNodes).length,
  };
}

/**
 * Build the export ZIP for a canvas.
 * @param {string} canvasId
 * @param {{ lang?: 'zh'|'en' }} [opts]
 * @returns {Promise<{ buffer: Buffer, filename: string }>}
 */
export async function buildCanvasExport(canvasId, opts = {}) {
  const { entries, topic, nodeCount } = await buildCanvasSite(canvasId, opts);
  const buffer = buildZip(entries);
  const filename = `${slugify(topic)}.zip`;
  log.info(`[export] canvas=${canvasId} nodes=${nodeCount} images=${entries.filter((e) => e.name.startsWith('images/')).length} → ${buffer.length} bytes`);
  return { buffer, filename };
}
