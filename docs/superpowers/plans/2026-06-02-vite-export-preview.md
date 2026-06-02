# Vite 导出预览实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让导出预览成为以 "export" 渲染 mode 编译的真正 React 应用，通过编译期 Vite `define` 区分 mode、复用 web 产物并 tree-shake 掉直播专用代码，同时叠加 export 专属品牌定制。

**Architecture:** 单一 `web/` 代码源产出两个构建：默认在线构建（`dist/`，ES module，`__FLIPBOOK_EXPORT__=false`）与导出构建（`dist-export/`，IIFE + 相对路径，离线 `file://`，`__FLIPBOOK_EXPORT__=true`）。编译期布尔常量驱动死分支消除；export 专属定制（页脚版权、GitHub 直出、语言固化、标题跟随、扁平顶栏）由一个 export profile 模块统一控制。`server/src/export/buildExport.js` 改为读取 `web/dist-export/` 而非手写的 `template/`，payload 与 `images/` 不变。

**Tech Stack:** Vite 5、@vitejs/plugin-react、React 18、TypeScript（`tsc -b`）；服务端 `node --test`。

**关键参考文档：** `docs/superpowers/specs/2026-06-02-vite-export-preview-design.md`

---

## 测试与验证策略（务必先读）

- **Web 侧无测试运行器，本计划不引入 vitest/jest**（项目无此基础设施，仅为此功能引入属过度工程）。Web 改动的验证手段是：
  1. `cd web && npx tsc -b` 类型通过（含新增的全局常量声明）。
  2. `npm run build`（在线）与 `npm run build:export`（导出）均成功产出。
  3. 对导出产物 `web/dist-export/viewer.js` 做 **grep 断言**（tree-shaking 与品牌定制的客观验证）。
- **Server 侧已有 `node --test`**，扩展 `server/test/export.test.js`。该测试不依赖真实 Vite 构建：在测试内**伪造一个最小 `web/dist-export/` 目录**（stub 的 `index.html`/`viewer.js`/`viewer.css`），因为 `buildCanvasSite` 只是原样读取这三个文件。
- 每个任务末尾 commit。

---

## 文件结构

**新建：**
- `web/src/globals.d.ts` — 声明编译期常量 `declare const __FLIPBOOK_EXPORT__: boolean;`
- `web/src/lib/exportProfile.ts` — export 形态 profile（品牌定制开关 + 数据启动入口），由编译期常量驱动分支。
- `web/index-export.html`（可选，见 Task 2 决策）或用插件在内存改写 `index.html`。本计划采用**插件改写**，不新建 HTML 文件。

**修改：**
- `web/vite.config.ts` — 按 `mode` 分支：`define`、`outDir`、IIFE 输出、`base`、export 专属 `transformIndexHtml` 插件。
- `web/package.json` — 新增 `build:export` script。
- `web/src/hooks/useCanvasSSE.ts` — export mode 下 effect 早退。
- `web/src/lib/api.ts` — `imageUrl` export mode 返回相对路径。
- `web/src/App.tsx` — export mode 从 `window.__FLIPBOOK__` 启动；写操作调用点门控。
- `web/src/components/TopBar.tsx` — export profile 驱动：GitHub 直出、隐藏语言切换/分享/返回/More、扁平顶栏。
- `server/src/export/buildExport.js` — 读取 `web/dist-export/` 取代 `template/`；缺失时抛清晰错误；移除 `__TITLE__` 字符串替换。
- `server/test/export.test.js` — 伪造 `dist-export/`，更新断言。
- `package.json`（根）— 视需要补 `build:export` 转发 script。
- `scripts/serve-preview.mjs` / `scripts/example-doc-publish.mjs` — 在调用 `buildCanvasSite` 前校验 `web/dist-export/` 已构建，缺失则给出可执行的提示（先 `npm run build:export`），避免脚本抛出底层错误。两脚本消费 `site.entries` 的逻辑无需改动。

**保留（本次不动）：** `server/src/export/template/`（待方案稳定后另行决定删除）。

**gh-pages 影响：** 已发布到 gh-pages 的示例是用旧 template viewer 构建的。本 feat 上线后需用新的 Vite 产物**重新发布**这些示例（Task 11），否则线上示例与导出能力不一致。`example-doc-publish.mjs` 的 `mergeRemoteExamples` 仍能工作（`data.js` 的 `window.__FLIPBOOK__` 格式不变）。

---

## Task 1: 添加编译期常量声明与 Vite define

**Files:**
- Create: `web/src/globals.d.ts`
- Modify: `web/vite.config.ts`

- [ ] **Step 1: 新建全局类型声明**

创建 `web/src/globals.d.ts`：

```ts
// 编译期常量：由 vite.config.ts 的 `define` 注入。
// true = 导出构建（dist-export），false = 在线构建（dist）。
declare const __FLIPBOOK_EXPORT__: boolean;
```

- [ ] **Step 2: 改写 vite.config.ts 为按 mode 分支**

把 `web/vite.config.ts` 整体替换为：

```ts
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// 导出构建：在 index.html 的入口脚本前注入 <script src="./data.js">，
// 让离线产物从 window.__FLIPBOOK__ 读取数据。data.js 由 buildExport.js
// 在运行时生成，不参与 Vite 构建，故这里只注入标签、不让 Vite 解析它。
function injectDataScriptPlugin(): Plugin {
  return {
    name: 'flipbook-inject-data-script',
    transformIndexHtml(html) {
      return html.replace(
        /<script type="module"/,
        '<script src="./data.js"></script>\n    <script type="module"',
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const isExport = mode === 'export';
  return {
    plugins: [react(), ...(isExport ? [injectDataScriptPlugin()] : [])],
    define: {
      __FLIPBOOK_EXPORT__: JSON.stringify(isExport),
    },
    base: isExport ? './' : '/',
    server: {
      port: 5173,
      host: true,
      allowedHosts: ['flipbook.lan'],
      proxy: {
        '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true, ws: false },
      },
    },
    build: isExport
      ? {
          outDir: 'dist-export',
          sourcemap: false,
          rollupOptions: {
            output: {
              format: 'iife',
              inlineDynamicImports: true,
              entryFileNames: 'viewer.js',
              assetFileNames: (info) =>
                info.name && info.name.endsWith('.css') ? 'viewer.css' : '[name][extname]',
            },
          },
        }
      : {
          outDir: 'dist',
          sourcemap: true,
        },
  };
});
```

- [ ] **Step 3: 新增 build:export script**

修改 `web/package.json` 的 `scripts`，在 `build` 后加入一行：

```jsonc
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "build:export": "tsc -b && vite build --mode export",
  "preview": "vite preview"
}
```

- [ ] **Step 4: 验证两个构建都成功**

Run: `cd web && npm run build && npm run build:export`
Expected: 两条命令均退出码 0；生成 `web/dist/index.html` 与 `web/dist-export/{index.html,viewer.js,viewer.css}`。

> 注意：此时源码尚未门控，导出产物功能未完成，仅验证构建管线与 define 生效。

- [ ] **Step 5: 验证 define 已注入产物**

Run: `cd web && grep -c "EventSource" dist-export/viewer.js || true`
Expected: 当前仍可能 >0（SSE 尚未门控，Task 3 处理）。本步仅确认产物存在、可被 grep。

- [ ] **Step 6: 验证导出 HTML 注入了 data.js**

Run: `cd web && grep -e 'src="./data.js"' -e "src=\"data.js\"" dist-export/index.html`
Expected: 匹配到 `<script src="./data.js">`。

- [ ] **Step 7: Commit**

```bash
git add web/src/globals.d.ts web/vite.config.ts web/package.json
git commit -m "build(web): add export mode with __FLIPBOOK_EXPORT__ define + IIFE output"
```

---

## Task 2: 创建 export profile 模块

**Files:**
- Create: `web/src/lib/exportProfile.ts`

该模块集中 export 专属定制开关与数据启动入口，分支由编译期常量驱动以便 tree-shaking。

- [ ] **Step 1: 写 exportProfile.ts**

创建 `web/src/lib/exportProfile.ts`：

```ts
// 导出渲染形态（export profile）。所有 export 专属定制集中于此，
// 由编译期常量 __FLIPBOOK_EXPORT__ 驱动，便于 Rollup 死分支消除。
//
// export 与 readOnly 是正交维度：readOnly 仅禁用写操作；export 在
// readOnly 基底上还有品牌定制（页脚版权、GitHub 直出、语言固化、
// 标题跟随、扁平顶栏）。详见 spec §2.1。

export const IS_EXPORT: boolean = __FLIPBOOK_EXPORT__;

// 顶栏在导出形态下的呈现开关。
export const exportChrome = {
  // 顶栏右侧直出 GitHub 图标（在线版收在 More 菜单里）。
  githubInTopBar: IS_EXPORT,
  // 导出版语言由 payload 烤死，不提供运行时切换。
  showLangSwitch: !IS_EXPORT,
  // 导出版不需要分享 / 返回图库 / More 菜单。
  showShare: !IS_EXPORT,
  showBackToGallery: !IS_EXPORT,
  showMoreMenu: !IS_EXPORT,
  // 页脚版权条仅在导出形态显示。
  showFooter: IS_EXPORT,
};

// 导出形态下注入页面的数据。data.js 设置 window.__FLIPBOOK__。
export type FlipbookPayload = {
  topic: string;
  root: string | null;
  orientation: 'landscape' | 'portrait';
  lang: 'zh' | 'en';
  nodes: Record<string, any>;
  tree: { nodes: Record<string, any>; root: string | null };
};

export function readExportPayload(): FlipbookPayload | null {
  if (!IS_EXPORT) return null;
  const w = window as unknown as { __FLIPBOOK__?: FlipbookPayload };
  return w.__FLIPBOOK__ ?? null;
}
```

- [ ] **Step 2: 验证类型通过**

Run: `cd web && npx tsc -b`
Expected: 退出码 0，无类型错误。

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/exportProfile.ts
git commit -m "feat(web): add export profile module for render-mode customizations"
```

---

## Task 3: export mode 下关闭 SSE（tree-shake EventSource）

**Files:**
- Modify: `web/src/hooks/useCanvasSSE.ts`

- [ ] **Step 1: 在 effect 内最前面早退**

修改 `web/src/hooks/useCanvasSSE.ts`，在 `useEffect(() => {` 之后、`if (!canvasId) return;` 之前插入早退（顶部新增 import）：

文件顶部 import 改为：
```ts
import { useEffect, useRef } from 'react';
import type { SseEvent } from '../state/types';
import { IS_EXPORT } from '../lib/exportProfile';
```

`useEffect` 体首行改为：
```ts
  useEffect(() => {
    if (IS_EXPORT) return; // 导出形态无 SSE：EventSource 相关代码为死分支，被 tree-shake
    if (!canvasId) return;
```

其余逻辑保持不变。

- [ ] **Step 2: 重新构建导出产物**

Run: `cd web && npm run build:export`
Expected: 退出码 0。

- [ ] **Step 3: 验证 EventSource 被消除**

Run: `cd web && grep -c "new EventSource" dist-export/viewer.js`
Expected: `0`（无匹配，grep 退出码 1）。

- [ ] **Step 4: 验证在线构建仍含 SSE**

Run: `cd web && npm run build && grep -c "new EventSource" dist/assets/*.js`
Expected: >=1（在线版保留 SSE）。

- [ ] **Step 5: Commit**

```bash
git add web/src/hooks/useCanvasSSE.ts
git commit -m "feat(web): disable SSE in export build to tree-shake EventSource"
```

---

## Task 4: export mode 下 imageUrl 返回相对路径

**Files:**
- Modify: `web/src/lib/api.ts`

- [ ] **Step 1: 在 imageUrl 顶部加 export 分支**

修改 `web/src/lib/api.ts`：文件顶部 import 区加入：
```ts
import { IS_EXPORT } from './exportProfile';
```

将 `imageUrl`（约 130 行）改为：
```ts
export function imageUrl(canvasId: string, imageRel: string): string {
  // 导出形态：图片是 zip 内相对路径（images/<hash>.png），离线直引，
  // 不走 /api。canvasId 在此分支无用。
  if (IS_EXPORT) return imageRel.replace(/^\//, '');
  if (imageRel.startsWith('/api/')) return imageRel;
  if (imageRel.startsWith('http')) return imageRel;
  return `${API}/canvas/${canvasId}/${imageRel.replace(/^\//, '')}`;
}
```

- [ ] **Step 2: 验证类型通过**

Run: `cd web && npx tsc -b`
Expected: 退出码 0。

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/api.ts
git commit -m "feat(web): imageUrl returns relative path in export build"
```

---

## Task 5: export mode 从 window.__FLIPBOOK__ 启动

**Files:**
- Modify: `web/src/App.tsx`

目标：导出形态跳过 URL→fetch 启动，改为同步注入 `window.__FLIPBOOK__` 的 tree + 当前节点，并标记 `readOnly`。复用现有 reducer action（`set_share_mode` / `set_tree` / `node_ready` / `navigate`），无需新 action。

- [ ] **Step 1: 顶部引入 export profile**

`web/src/App.tsx` 顶部 import 区加入：
```ts
import { IS_EXPORT, readExportPayload } from './lib/exportProfile';
```

- [ ] **Step 2: 在 boot useEffect 最前面加 export 分支**

定位 boot `useEffect`（约 81 行，`const u = readUrlState();` 所在）。在该 effect 函数体**最前面**插入 export 启动分支，并让原有逻辑置于 `else`：

```ts
  useEffect(() => {
    if (IS_EXPORT) {
      const payload = readExportPayload();
      if (!payload || !payload.root) {
        bootedRef.current = true;
        return;
      }
      dispatch({ type: 'set_share_mode', canvasId: 'export', topic: payload.topic, token: 'export' });
      dispatch({ type: 'set_tree', tree: { ...payload.tree, topic: payload.topic, orientation: payload.orientation } as any });
      // 深链接：#hash 优先，否则 root
      const fromHash = (window.location.hash || '').replace(/^#/, '');
      const targetHash = (fromHash && payload.nodes[fromHash]) ? fromHash : payload.root;
      const node = payload.nodes[targetHash];
      if (node) {
        // 先注入祖先（面包屑），再注入目标节点
        for (const p of (node.path ?? []).slice(0, -1)) {
          const anc = payload.nodes[p.hash];
          if (anc) dispatch({ type: 'sse', evt: { type: 'node_ready', canvasId: 'export', jobId: 'export', hash: anc.hash, node: anc } });
        }
        dispatch({ type: 'sse', evt: { type: 'node_ready', canvasId: 'export', jobId: 'export', hash: node.hash, node } });
        dispatch({ type: 'navigate', hash: node.hash });
      }
      bootedRef.current = true;
      return;
    }

    const u = readUrlState();
    // ... 原有逻辑保持不变 ...
```

> 说明：`set_tree` 的 payload 形状需与现有 reducer 接受的 `tree` 一致。实现时先读 `web/src/state/reducer.ts` 的 `set_tree` 与 `set_share_mode` 分支，按其期望字段微调上面的对象（这是已存在的类型，不新增）。

- [ ] **Step 3: 让 URL 持久化 effect 在 export 下不写 URL**

定位「Persist canvasId…」useEffect（约 152 行）。在其函数体最前面加：
```ts
    if (IS_EXPORT) return; // 导出形态用 #hash 深链接，不改写查询参数
```

> `navigate` 仍可通过现有逻辑更新 `#hash`；若现有 navigate 不写 hash，则在 export 形态依赖浏览器默认锚点行为即可，无需额外处理。

- [ ] **Step 4: 验证类型通过**

Run: `cd web && npx tsc -b`
Expected: 退出码 0。

- [ ] **Step 5: 验证 getTree/getNode 在导出产物中不再是启动依赖**

Run: `cd web && npm run build:export && grep -c "/api/canvas" dist-export/viewer.js`
Expected: 理想为 `0`；若 >0，记录残留来源（后续 Task 6 门控写操作后复查）。本步不阻塞。

- [ ] **Step 6: Commit**

```bash
git add web/src/App.tsx
git commit -m "feat(web): boot from window.__FLIPBOOK__ in export build"
```

---

## Task 6: 门控写操作调用点（tree-shake 写 API / ClickComposer / Gallery）

**Files:**
- Modify: `web/src/App.tsx`

目标：让 `createCanvas`/`clickAt`/`regenerateNode`/`deleteNode`/`createShareLink`/`resolveShareLink`/`cancelHotspot`/`updateHotspot`/`exportCanvas` 的引用、以及 `<ClickComposer>`/`<Gallery>` 的渲染，落在 `__FLIPBOOK_EXPORT__` 死分支内，从而被消除。

- [ ] **Step 1: 门控写操作回调体**

在 App.tsx 中，对每个发起写请求的 `useCallback`（`onSubmitTopic`、`onImageClick`/`submitClickComposer`、`onRegenerate`/`confirmRegen`、`confirmDelete`、`onShare`、`onHotspotEdit`、`onExportPreview` 等）的函数体**最前面**加：
```ts
    if (IS_EXPORT) return;
```
确保该回调内对写 API 的 import 引用仅存在于 `if (!IS_EXPORT)` 之后的可达路径；最简单做法即上面的早退（早退后续代码即成死分支）。

> 实现提示：逐个回调添加。`onShare` 引用 `createShareLink`、`onSubmitTopic` 引用 `createCanvas`、`submitClickComposer` 引用 `clickAt`、`confirmDelete` 引用 `deleteNode`、`confirmRegen` 引用 `regenerateNode`、`onHotspotEdit` 引用 `updateHotspot`、取消热点引用 `cancelHotspot`、`onExportPreview` 引用 `exportCanvas`。每个回调早退后，对应 import 在 export 构建中不可达。

- [ ] **Step 2: 门控 Gallery 与 ClickComposer 渲染**

`state.view` 在导出形态恒为 `canvas`（Task 5 启动即进 canvas）。为帮助 Rollup 消除 `Gallery`，把其渲染包一层编译期常量：

定位 `{state.view === 'gallery' && (` 的 Gallery 渲染（约 701 行），改为：
```tsx
          {!IS_EXPORT && state.view === 'gallery' && (
            <Gallery refreshKey={galleryRefreshKey} onOpen={onOpenFromGallery} />
          )}
```

定位 ClickComposer 的 `overlay={clickComposer && (() => {` 块（约 748 行），在其外层加编译期守卫：
```tsx
              overlay={!IS_EXPORT && clickComposer && (() => {
```

- [ ] **Step 3: 验证类型通过**

Run: `cd web && npx tsc -b`
Expected: 退出码 0。

- [ ] **Step 4: 重新构建并验证写 API 被消除**

Run: `cd web && npm run build:export`
然后逐项检查（期望均为 `0` 或 grep 退出码 1）：
```bash
grep -c "/api/canvas/upload" dist-export/viewer.js
grep -c "ClickComposer" dist-export/viewer.js
grep -c "createShareLink\|/share" dist-export/viewer.js
```
Expected: 写操作端点/组件标识不再出现。若个别残留，定位是否仍有可达引用并补门控。

- [ ] **Step 5: 验证在线构建未受影响**

Run: `cd web && npm run build && npx tsc -b`
Expected: 均退出码 0。

- [ ] **Step 6: Commit**

```bash
git add web/src/App.tsx
git commit -m "feat(web): gate write APIs/Gallery/ClickComposer out of export build"
```

---

## Task 7: TopBar 应用 export profile（品牌定制）

**Files:**
- Modify: `web/src/components/TopBar.tsx`

实现 spec §2.1 的：GitHub 直出、隐藏语言切换、隐藏分享/返回/More（扁平顶栏）。页脚与标题跟随在 Task 8。

- [ ] **Step 1: 引入 profile**

`web/src/components/TopBar.tsx` 顶部 import 区加入：
```ts
import { exportChrome } from '../lib/exportProfile';
```

- [ ] **Step 2: 隐藏「返回图库」按钮（导出形态）**

定位 `{!fullscreen && (` 的「返回图库」按钮（约 99 行），把条件改为：
```tsx
      {exportChrome.showBackToGallery && !fullscreen && (
```

- [ ] **Step 3: GitHub 直出 + 隐藏 More（导出形态）**

在右侧 cluster（`<div className={styles.rightCluster}>`，约 174 行）中：

(a) 分享按钮已受 `!readOnly` 控制，额外用 `exportChrome.showShare` 收紧——把其条件 `{view === 'canvas' && !readOnly && (` 改为：
```tsx
        {exportChrome.showShare && view === 'canvas' && !readOnly && (
```

(b) 在 `<MoreMenu ... />` 之前插入「导出形态的 GitHub 直出按钮」：
```tsx
        {exportChrome.githubInTopBar && (
          <a
            className={styles.miniBtn}
            href="https://github.com/imcuttle/flipbook-app"
            target="_blank"
            rel="noopener noreferrer"
            title="GitHub"
            aria-label="GitHub"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
          </a>
        )}
```

(c) 用 `exportChrome.showMoreMenu` 包裹 `<MoreMenu .../>`：
```tsx
        {exportChrome.showMoreMenu && (
          <MoreMenu
            lang={lang}
            setLang={setLang}
            /* ...原有 props 不变... */
          />
        )}
```

> 注意：保留全屏按钮（导出形态需要全屏，spec §2.1 顶栏右侧含全屏），它本就不在 `readOnly`/More 门控内，无需改动。

- [ ] **Step 4: 语言固化（隐藏 MoreMenu 内语言项已随 More 隐藏自动满足）**

由于整个 MoreMenu 在导出形态被隐藏，语言切换入口自然消失，满足「语言固化」。无需额外改动。

- [ ] **Step 5: 验证类型通过**

Run: `cd web && npx tsc -b`
Expected: 退出码 0。

- [ ] **Step 6: 构建并验证导出顶栏不含 More/分享标识**

Run: `cd web && npm run build:export`
Expected: 退出码 0。手动检查（可选）：`grep -c "topbar.more" dist-export/viewer.js` 期望减少或为 0（i18n key 不再可达）。

- [ ] **Step 7: Commit**

```bash
git add web/src/components/TopBar.tsx
git commit -m "feat(web): flat top bar + GitHub direct button in export build"
```

---

## Task 8: 页脚版权条 + 标题跟随

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/styles/App.module.css`

- [ ] **Step 1: 渲染导出页脚**

在 `web/src/App.tsx` 顶部确保已引入 `exportChrome`（与 `IS_EXPORT` 同源）：
```ts
import { IS_EXPORT, readExportPayload, exportChrome } from './lib/exportProfile';
```

定位 `<div className={styles.canvas}>` 闭合 `</div>` 之后（约 764 行 `</div>` 结束 canvas 区，紧接 `</div>` 结束 window 之前），在 window 容器内底部加入页脚：
```tsx
        {exportChrome.showFooter && (
          <div className={styles.exportFooter}>
            <a
              className={styles.exportFooterLink}
              href="https://github.com/imcuttle/flipbook-app"
              target="_blank"
              rel="noopener noreferrer"
            >Copyright Flipbook Canvas</a>
          </div>
        )}
```

> 实现时确认插入点在 `styles.window` 容器内、`styles.canvas` 之后，使页脚位于内容下方。

- [ ] **Step 2: 加页脚样式**

在 `web/src/styles/App.module.css` 末尾追加：
```css
.exportFooter {
  text-align: center;
  padding: 16px 0 24px;
  flex: 0 0 auto;
}
.exportFooterLink {
  color: #B4A793;
  font-size: 11px;
  text-decoration: none;
}
.exportFooterLink:hover { text-decoration: underline; }
```

- [ ] **Step 3: 标题跟随当前节点**

在 App.tsx 中新增一个 effect（紧随其他 effect，例如 fullscreen effect 之后，约 184 行）：
```ts
  // 导出形态：标签页标题跟随当前节点标题（在线版由文档默认标题处理）。
  useEffect(() => {
    if (!IS_EXPORT) return;
    const title = currentNode?.title || state.topic || 'Flipbook';
    document.title = title;
  }, [currentNode, state.topic]);
```

> `currentNode` 已在组件后段定义（约 596 行）。若该 effect 位置在 `currentNode` 声明之前导致 TS 报未定义，则把此 effect 移到 `currentNode` 定义之后、`return (` 之前。

- [ ] **Step 4: 验证类型通过**

Run: `cd web && npx tsc -b`
Expected: 退出码 0。

- [ ] **Step 5: 构建并验证页脚文案进入产物**

Run: `cd web && npm run build:export && grep -c "Copyright Flipbook Canvas" dist-export/viewer.js`
Expected: >=1。

- [ ] **Step 6: 验证在线构建不含导出页脚**

Run: `cd web && npm run build && grep -c "exportFooter" dist/assets/*.js`
Expected: `0`（tree-shaken）。

- [ ] **Step 7: Commit**

```bash
git add web/src/App.tsx web/src/styles/App.module.css
git commit -m "feat(web): export footer copyright + title follows current node"
```

---

## Task 9: buildExport.js 改读 web/dist-export

**Files:**
- Modify: `server/src/export/buildExport.js`
- Modify: `server/test/export.test.js`

- [ ] **Step 1: 在 export.test.js 中伪造 dist-export 并更新断言（先写测试）**

修改 `server/test/export.test.js`。在文件顶部 import 之后、`process.env.DATA_DIR` 设置附近，加入伪造导出产物目录的逻辑（路径相对仓库：`web/dist-export/`）：

```js
import { fileURLToPath } from 'node:url';

// buildExport 现在从 web/dist-export 读取 index.html/viewer.js/viewer.css。
// 单测不跑真实 Vite 构建：伪造一个最小产物目录（buildCanvasSite 只是
// 原样读取这三个文件）。
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST_EXPORT = path.join(APP_ROOT, 'web', 'dist-export');
const STUB_FILES = {
  'index.html': '<!doctype html><html><head><title>Flipbook</title></head><body><div id="root"></div><script src="./data.js"></script><script src="./viewer.js"></script></body></html>',
  'viewer.js': '/* stub viewer */',
  'viewer.css': '/* stub css */',
};
let _createdDistExport = false;
if (!fs.existsSync(DIST_EXPORT)) {
  fs.mkdirSync(DIST_EXPORT, { recursive: true });
  _createdDistExport = true;
  for (const [name, content] of Object.entries(STUB_FILES)) {
    fs.writeFileSync(path.join(DIST_EXPORT, name), content);
  }
}
```

在文件末尾的 `test.after` 中追加清理（仅当本测试创建了 stub 时）：
```js
test.after(async () => {
  await fsp.rm(TMP, { recursive: true, force: true });
  if (_createdDistExport) await fsp.rm(DIST_EXPORT, { recursive: true, force: true });
});
```

并把 `'buildCanvasExport bundles a static site for a canvas'` 测试末尾对 HTML 的断言更新为（不再断言 `__TITLE__` 被替换，改为断言脚本引用 + data.js 注入）：
```js
  const html = entries['index.html'].toString('utf8');
  assert.match(html, /src="\.?\/?data\.js"/);
  assert.match(html, /src="\.?\/?viewer\.js"/);
```
（移除原 `href="viewer.css"` 的硬断言——CSS 现由 Vite 产物的 HTML 决定，stub 中可不含 link 标签。）

- [ ] **Step 2: 运行测试确认失败**

Run: `cd server && node --test test/export.test.js`
Expected: FAIL —— `buildCanvasSite` 仍从 `template/` 读取，HTML 不匹配新断言；或读取路径未变导致与 stub 不一致。

- [ ] **Step 3: 改 buildExport.js 读取 dist-export**

修改 `server/src/export/buildExport.js`：

(a) 把 `TEMPLATE_DIR` 常量（约 15 行）替换为指向 web 导出产物：
```js
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/src/export → 仓库根（app）→ web/dist-export
const DIST_EXPORT_DIR = path.join(__dirname, '..', '..', '..', 'web', 'dist-export');
```

(b) 在 `buildCanvasSite` 读取模板处（约 149-154 行）改为读取 dist-export，并在缺失时抛清晰错误：
```js
  // 读取 Vite 导出构建产物（web/dist-export）。需先运行 `npm run build:export`。
  if (!fsSync.existsSync(path.join(DIST_EXPORT_DIR, 'index.html'))) {
    throw new Error('export build missing — run `npm run build:export` first (expected web/dist-export/index.html)');
  }
  const [html, css, js] = await Promise.all([
    fs.readFile(path.join(DIST_EXPORT_DIR, 'index.html'), 'utf8'),
    fs.readFile(path.join(DIST_EXPORT_DIR, 'viewer.css'), 'utf8'),
    fs.readFile(path.join(DIST_EXPORT_DIR, 'viewer.js'), 'utf8'),
  ]);
```

(c) 移除 `__TITLE__` 替换（约 156-157 行），标题改由运行时设置（Task 8 已实现）。把：
```js
  const title = tree.topic || 'Flipbook';
  const indexHtml = html.replace('__TITLE__', title.replace(/</g, '&lt;'));
```
改为：
```js
  const title = tree.topic || 'Flipbook';
  const indexHtml = html; // 标题由 export 应用运行时通过 document.title 设置
```

其余（`dataJs`、entries 推入、images 处理）保持不变。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd server && node --test test/export.test.js`
Expected: PASS（所有用例）。

- [ ] **Step 5: 运行 server 全量测试确认无回归**

Run: `cd server && npm test`
Expected: 全部通过。

- [ ] **Step 6: Commit**

```bash
git add server/src/export/buildExport.js server/test/export.test.js
git commit -m "feat(export): build static site from web/dist-export instead of hand-written template"
```

---

## Task 10: 导出脚本的 dist-export 前置校验

**Files:**
- Modify: `scripts/serve-preview.mjs`
- Modify: `scripts/example-doc-publish.mjs`

两脚本都调用 `buildCanvasSite`，现在隐式依赖 `web/dist-export/`。缺失时 `buildCanvasSite` 会抛 `export build missing ...`（Task 9 已加），但脚本应在调用前做一次友好校验，给出可执行提示。`site.entries` 的消费逻辑无需改动。

- [ ] **Step 1: serve-preview.mjs 加前置校验**

修改 `scripts/serve-preview.mjs`：在 `const { buildCanvasSite } = await import(...)`（约 52 行）之后、`buildCanvasSite` 实际调用（约 58 行 `site = await buildCanvasSite(...)`）之前，插入：

```js
  const distExportIndex = path.join(APP_ROOT, 'web', 'dist-export', 'index.html');
  if (!fs.existsSync(distExportIndex)) {
    console.error('[err] web/dist-export not found — run `npm run build:export` first.');
    process.exit(1);
  }
```

> `fs`、`path`、`APP_ROOT` 在该文件顶部已 import（见现有第 12-20 行），直接使用。

- [ ] **Step 2: example-doc-publish.mjs 加前置校验**

修改 `scripts/example-doc-publish.mjs`：在 `const { buildCanvasSite } = await import(...)`（约 138 行）之后、`for (const id of args.ids)` 循环（约 153 行）之前，插入：

```js
  const distExportIndex = path.join(APP_ROOT, 'web', 'dist-export', 'index.html');
  if (!fsSync.existsSync(distExportIndex)) {
    console.error('[err] web/dist-export not found — run `npm run build:export` first.');
    process.exit(1);
  }
```

> `fsSync`、`path`、`APP_ROOT` 在该文件顶部已 import（见现有第 20-27 行），直接使用。

- [ ] **Step 3: 验证缺产物时友好报错**

Run:
```bash
rm -rf web/dist-export
node scripts/serve-preview.mjs SomeId 2>&1 | head -1
```
Expected: 打印 `[err] web/dist-export not found — run \`npm run build:export\` first.` 且退出码非 0（不抛 Node 栈）。

- [ ] **Step 4: 验证有产物时正常**

Run:
```bash
npm run build:export
node scripts/example-doc-publish.mjs <canvasId> --no-push --dir /tmp/fb-pages 2>&1 | tail -3
```
Expected: 打印 `[ok] <canvasId> → ...` 与 `[ok] landing page → ...`，无报错。

- [ ] **Step 5: Commit**

```bash
git add scripts/serve-preview.mjs scripts/example-doc-publish.mjs
git commit -m "feat(scripts): guard export scripts on missing web/dist-export build"
```

---

## Task 11: 用 Vite 产物重新发布 gh-pages 示例

**Files:**
- 无源码改动（运行已更新的 `scripts/example-doc-publish.mjs`）

已发布到 gh-pages 的示例是旧 template viewer 构建的。本步用新 Vite 导出产物重新发布，使线上示例与新导出能力一致。`example-doc-publish.mjs` 的 `mergeRemoteExamples` 依据 `data.js` 的 `window.__FLIPBOOK__`（格式不变）重建落地页，无需改动。

> 该任务对外部共享分支（gh-pages）有可见副作用（push）。执行前必须经用户确认；本计划默认先用 `--no-push` 在本地暂存验证，确认无误后再由用户授权 push。

- [ ] **Step 1: 确认要重新发布的示例 ID 集合**

Run:
```bash
git ls-remote --heads origin gh-pages && echo "--- 远端已有 gh-pages ---"
```
然后与用户确认要重建的 canvasId 列表（通常是 `docs-pages/examples.json` 或远端 gh-pages 中现有的全部示例）。

- [ ] **Step 2: 本地暂存重建（--no-push）核对**

Run（确保已 `npm run build:export`）：
```bash
npm run build:export
node scripts/example-doc-publish.mjs <id1> <id2> ... --no-push --dir /tmp/fb-pages
```
Expected: 每个 id 打印 `[ok]`，落地页生成。

- [ ] **Step 3: 本地预览核对**

Run:
```bash
npx serve /tmp/fb-pages
```
打开浏览器，逐个示例点进去，确认与 Task 10 的人工核对项一致（页脚、GitHub 直出、扁平顶栏、可导航、可看图、`file://` 等价的浏览体验）。

- [ ] **Step 4: 经用户授权后正式发布**

> 仅在用户明确同意 push gh-pages 后执行。

Run:
```bash
npm run build:export
node scripts/example-doc-publish.mjs <id1> <id2> ...
```
Expected: 打印 `[done] pushed to gh-pages` 与 Pages URL。

- [ ] **Step 5: 线上核对**

打开打印出的 Pages URL，确认示例已用新 viewer 呈现（页脚 + GitHub 直出 + 扁平顶栏）。

> 本任务无代码提交（仅运行脚本 + push 分支）。

---

## Task 12: 根级 build:export 转发 + 端到端验证

**Files:**
- Modify: `package.json`（根）

- [ ] **Step 1: 根 package.json 加 build:export 转发**

修改根 `package.json` 的 `scripts`，在 `build` 后加：
```jsonc
"build": "npm run build -w web",
"build:export": "npm run build:export -w web",
```

- [ ] **Step 2: 端到端：构建导出产物 + 起预览服务**

Run（需要一个已存在的 canvasId；用现有数据或先生成一个）：
```bash
npm run build:export
node scripts/serve-preview.mjs <canvasId> --port 8088
```
Expected: 打印 `[ok] built ...` 与 `[serve] http://127.0.0.1:8088/`。

- [ ] **Step 3: 浏览器人工核对（spec §2.1 五点 + 基本浏览）**

打开 `http://127.0.0.1:8088/`，确认：
- 能看到根节点图像、标题、caption。
- 点击热点能导航；面包屑可点；目录/sources（如有）可开。
- 图片可点开 lightbox；全屏按钮可用。
- **页脚** "Copyright Flipbook Canvas" 存在。
- **GitHub** 图标在顶栏右侧直出。
- **无** More 菜单、无语言切换、无分享、无「返回图库」。
- 导航到子节点时**标签页标题**变为该节点标题。
- Ctrl-C 停止服务。

- [ ] **Step 4: 验证 file:// 离线直开**

Run:
```bash
npm run build:export
node -e "import('./server/src/export/buildExport.js').then(async m => { const {buffer}=await m.buildCanvasExport(process.argv[1],{lang:'zh'}); require('fs').writeFileSync('/tmp/fb-export.zip', buffer); console.log('wrote /tmp/fb-export.zip'); })" <canvasId>
cd /tmp && rm -rf fb-export && mkdir fb-export && cd fb-export && unzip -q /tmp/fb-export.zip && echo "open file://$(pwd)/index.html"
```
然后浏览器打开打印出的 `file://.../index.html`，确认能浏览、导航、看图（无网络请求报错）。

- [ ] **Step 5: 最终全量回归**

Run:
```bash
cd web && npm run build && npx tsc -b
cd ../server && npm test
```
Expected: 均通过。

- [ ] **Step 6: Commit**

```bash
git add package.json
git commit -m "build: forward build:export at workspace root"
```

---

## 自检清单（执行前已核对）

- **Spec 覆盖**：§3.1/3.2 构建结构→Task 1；§3.3 file://→Task 1(IIFE)+Task 12(验证)；§3.4 data.js 注入→Task 1；§2.1 五点品牌定制→Task 7(GitHub/扁平/语言)+Task 8(页脚/标题)；§4.1 数据启动→Task 5；§4.2 SSE→Task 3；§4.3 imageUrl→Task 4；§4.4 写操作剔除→Task 6；§5 消费方→Task 9；§6 错误处理（dist-export 缺失抛错、无数据占位）→Task 9(抛错)+Task 5(无 payload 占位)+Task 10(脚本友好提示)；§7 验证→各任务 + Task 12。
- **用户追加需求覆盖**：导出脚本同步可行→Task 10（serve-preview / example-doc-publish 前置校验）；gh-pages 示例内容替换→Task 11（用新 Vite 产物重新发布）。
- **类型一致**：`IS_EXPORT`/`exportChrome`/`readExportPayload`/`FlipbookPayload` 全程同名（Task 2 定义，后续引用一致）。
- **保留 template/**：全程未删除，符合 spec 非目标。
- **风险动作**：Task 11 含 gh-pages push（影响共享分支），已标注须用户授权，默认先 `--no-push` 验证。
- **无占位符**：所有代码步骤含可粘贴代码与确切命令（Task 11 的示例 ID 由执行时与用户确认填入）。
