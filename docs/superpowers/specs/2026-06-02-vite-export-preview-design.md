# 用 Vite 产物生成导出预览（复用 Web 产物 + 编译期 mode 区分 + tree-shaking）

- 日期：2026-06-02
- 状态：待评审
- 范围：`web/`（Vite 构建配置 + 源码门控）、`server/src/export/buildExport.js`（消费方）

## 1. 背景与问题

当前导出预览（「导出预览」功能 / `serve-preview` / `example-doc-publish`）依赖一套**手写的**静态 viewer：

- `server/src/export/template/index.html`（16 行）
- `server/src/export/template/viewer.js`（623 行）
- `server/src/export/template/viewer.css`（375 行）

这套 viewer 是 `web/src`（约 5818 行 React 代码）的一份**重新实现**。两者会随时间漂移，任何 UI/交互改动都要在两处手工同步，维护成本高且容易不一致。

**目标**：让导出预览**就是真正的 React 应用**，以一个 "export" 渲染 mode 编译产出。单一代码源，通过**编译期 Vite `define` 常量**区分渲染 mode，从而：

1. 复用 `web/` 的全部组件与样式（不再手写 viewer）。
2. 在 export 产物中**剔除直播专用代码**（SSE、写操作 API、生成 UI），靠 Rollup tree-shaking 真正减小包体。
3. 普通在线应用构建（`dist/`）行为完全不变，无回归。

非目标 / 本次不做：

- **不删除** `server/src/export/template/` 目录。保留现状，待 Vite 产物方案验证稳定后再单独决定是否移除（标注为后续工作）。
- 不改动导出 payload 的数据结构（`window.__FLIPBOOK__` 保持不变）。
- 不改动 `serve-preview.mjs` / `example-doc-publish.mjs` 的对外行为。

## 2. 整体架构

```
                       web/ 单一代码源 (React + Vite)
                                │
              ┌─────────────────┴─────────────────┐
   vite build (默认)                    vite build --mode export
   __FLIPBOOK_EXPORT__ = false          __FLIPBOOK_EXPORT__ = true
              │                                     │
         web/dist/                          web/dist-export/
   (ES module, /api/* 运行时)        (IIFE, 相对路径, 离线 file://)
              │                                     │
        在线应用照常                     buildCanvasSite() 读取此产物
                                         + 注入 data.js (window.__FLIPBOOK__)
                                         + images/  →  导出 zip / 预览站点
```

核心机制：一个编译期布尔常量 `__FLIPBOOK_EXPORT__`。Rollup 在打包时把它折叠成字面量，`if (__FLIPBOOK_EXPORT__) {...} else {...}` 的死分支被消除，仅被死分支引用的模块（SSE、写 API 等）随之被 tree-shake 掉。

> 注意区分两个概念：
> - `__FLIPBOOK_EXPORT__`：**编译期**常量，决定哪些代码进入产物（tree-shaking）。
> - `state.readOnly`：**运行时** state，已存在，控制 UI 元素显隐。export 产物中它恒为 `true`，但它本身不能减小包体——所以仍需编译期常量来做代码消除。

### 2.1 export 与 readOnly 是正交维度（重要）

export 渲染**不等价于** readOnly。readOnly 只是「禁用写操作」，而 export 是一个独立的渲染目标，在 readOnly 的基础上还有自己的**品牌/呈现定制**。本设计采用「**readOnly 基底 + 关键品牌点**」策略：

- **基底**：export 复用在线应用的 readOnly 形态（无写操作、无生成 UI、无确认弹窗/toast、无 ClickComposer/编辑态）。
- **叠加的 export 专属定制**（这些是 readOnly **推导不出**的，必须显式加回，对齐当前 template viewer 的观感）：
  1. **页脚版权条**：每页底部渲染 "Copyright Flipbook Canvas"，链接到项目仓库。在线应用无此页脚。
  2. **GitHub 入口直出**：GitHub 作为顶栏右侧直出图标按钮，而非收进 More 菜单。
  3. **语言固化**：导出时由 payload 的 `lang` 烤死，export 产物**不提供运行时语言切换**（顶栏右侧仅 标签开关 / 全屏 / GitHub）。
  4. **标签页标题同步**：导航到某节点时 `document.title = node.title`，跟随当前页标题。
  5. **扁平化顶栏**：无 More 菜单、无「返回图库」、无分享按钮。

> 其余细节（间距、字体等）不强求与 template 像素级一致——只要求上述 5 个关键品牌点重现。这是与用户确认过的保真度档位。

为避免 `if (__FLIPBOOK_EXPORT__)` 散落各处，定制集中到一个 **export 形态配置（profile）**：组件从该 profile 读取「是否显示页脚 / GitHub 是否直出 / 是否允许语言切换 / 顶栏布局变体」等开关。profile 在 export mode 下取 export 值、在线 mode 下取默认值，且其分支由编译期常量驱动以便 tree-shaking。具体接缝位置在实现计划中细化。

## 3. 构建结构

### 3.1 npm scripts

`web/package.json` 新增 `build:export`：

```jsonc
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "build:export": "tsc -b && vite build --mode export",
  "preview": "vite preview"
}
```

根 `package.json` 的 `build` 保持 `npm run build -w web`；新增（或在导出链路中调用）`build:export`。

### 3.2 vite.config.ts

按 `mode` 分支配置。关键点：

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const isExport = mode === 'export';
  return {
    plugins: [
      react(),
      isExport && injectDataScriptPlugin(), // 见 3.4
    ].filter(Boolean),
    define: {
      __FLIPBOOK_EXPORT__: JSON.stringify(isExport),
    },
    server: { /* 不变 */ },
    build: isExport
      ? {
          outDir: 'dist-export',
          sourcemap: false,
          // 离线 file:// 兼容：单文件 IIFE + 相对路径
          rollupOptions: {
            output: {
              format: 'iife',
              inlineDynamicImports: true,
              entryFileNames: 'viewer.js',
              assetFileNames: (info) =>
                info.name?.endsWith('.css') ? 'viewer.css' : '[name][extname]',
            },
          },
        }
      : {
          outDir: 'dist',
          sourcemap: true,
        },
    base: isExport ? './' : '/',
  };
});
```

### 3.3 `file://` 兼容（关键约束）

导出产物必须能从 `file://` 离线打开（与现状一致）。Vite 默认产出 `<script type="module">`，**在 `file://` 下因模块 CORS 限制无法加载**。因此 export 构建：

- `base: './'` → 所有资源用相对路径。
- `output.format: 'iife'` + `inlineDynamicImports: true` → 单个经典脚本 `viewer.js`，无 `type="module"`，无代码分割。
- CSS 固定输出为 `viewer.css`。

普通 `dist/` 构建保持标准 ES module 输出，**完全不变**。

### 3.4 HTML 中注入 data.js

导出数据通过 `window.__FLIPBOOK__` 注入（保持现状）。export 构建的 `index.html` 需要在 `viewer.js` 之前引入 `data.js`。用一个仅在 export mode 启用的 `transformIndexHtml` 插件注入：

```html
<script src="./data.js"></script>   <!-- 由 buildCanvasSite 生成并随产物一起打包 -->
<script src="./viewer.js"></script>  <!-- Vite 注入 -->
```

`data.js` 不存在于构建期（由 `buildCanvasSite` 运行时生成），所以插件只负责注入 `<script src="./data.js">` 标签，不让 Vite 尝试解析该文件。

标题：当前模板靠 `__TITLE__` 字符串替换。新方案改为 export mode 下运行时 `document.title = payload.topic`（在启动代码里设置），不再做 HTML 字符串手术。

## 4. 源码门控（tree-shaking 目标）

`web/src` 中按 `__FLIPBOOK_EXPORT__` 分支。需要一个全局类型声明（`web/src/vite-env.d.ts` 或新增 `globals.d.ts`）：

```ts
declare const __FLIPBOOK_EXPORT__: boolean;
```

### 4.1 数据启动（App.tsx）

新增一个清晰的启动边界。export mode 下 `App` 从 `window.__FLIPBOOK__` 启动，而非 `getTree` / `getNode` 网络请求：

```ts
if (__FLIPBOOK_EXPORT__) {
  // 从 window.__FLIPBOOK__ 同步 hydrate：set_tree + node_ready + navigate
  // 恒定 readOnly=true，跳过所有 URL→fetch 逻辑
} else {
  // 现有的 readUrlState() → getTree/getNode/SSE 启动流程
}
```

把现有 boot `useEffect`（App.tsx:81-140）中走网络的分支收敛进 `else`，export 分支只读 `window.__FLIPBOOK__`。

### 4.2 SSE hook（useCanvasSSE）

React 不允许条件调用 Hook，所以 `useCanvasSSE` 的外壳保留，但其 `useEffect` 体在 export mode 下早退：

```ts
useEffect(() => {
  if (__FLIPBOOK_EXPORT__) return; // EventSource 相关代码成为死代码被消除
  // ... 现有 SSE 连接/重连逻辑
}, [...]);
```

`EventSource` 建立、事件解析、重连等代码因仅存在于死分支而被 tree-shake。

### 4.3 imageUrl（lib/api.ts）

export mode 下直接返回相对路径（`images/<hash>.png`），不加 `/api/...` 前缀：

```ts
export function imageUrl(canvasId: string, imageRel: string): string {
  if (__FLIPBOOK_EXPORT__) return imageRel.replace(/^\//, '');
  // ... 现有逻辑
}
```

### 4.4 被剔除的功能 + export 专属定制

export 渲染 = **readOnly 基底**（剔除写操作）**+ export 品牌定制**（见 §2.1）。两者正交，不能用单个 `readOnly` 标志覆盖。

通过 `__FLIPBOOK_EXPORT__` 死分支 + 现有 `readOnly` 门控，使以下代码在 export 产物中不被引用进而被消除：

- 所有写操作 API：`createCanvas`、`clickAt`、`regenerateNode`、`deleteNode`、`createShareLink`、`resolveShareLink`、`cancelHotspot`、`updateHotspot`、`exportCanvas`。
- `ClickComposer` 组件。
- `TopBar` 中的生成 / 重生成 / 分享 / 导出 / 编辑控件（现已大量受 `readOnly` 控制）。
- `Gallery` 组件（导出产物直接进 canvas 视图，无图库着陆页）。

**保留的只读浏览能力**（与现状一致）：热点导航、面包屑（Breadcrumb）、`ImageLightbox`、sources 展示、全屏、`ProgressiveImage` 渐进加载、`TextLayer`。

**export 专属定制**（在上述基底上叠加，readOnly 推导不出，见 §2.1 的 5 点）：页脚版权条、GitHub 直出、语言固化（移除运行时切换）、`document.title` 跟随、扁平化顶栏。这些通过 export 形态 profile 控制，profile 分支由编译期常量驱动。

> 实现要点：只要写操作 API 函数在 export 分支中不可达，且其 `import` 能被 Rollup 判定为无副作用，即可被消除。门控应做在**调用点 / 组件渲染处**用 `__FLIPBOOK_EXPORT__`，必要时配合动态 import 或条件渲染，确保 Rollup 能静态判定死代码。这部分的具体切割粒度在实现计划中细化，并以构建产物体积验证效果。

## 5. 消费方改造（buildExport.js）

`buildCanvasSite(canvasId, opts)` 保持产出**相同的 payload 和 `images/` 条目**，仅改变随产物一起打包的 HTML/JS/CSS 来源：

- 旧：从 `server/src/export/template/{index.html,viewer.css,viewer.js}` 读取。
- 新：从 `web/dist-export/{index.html,viewer.js,viewer.css,以及任何 Vite 产出的额外资源}` 读取，原样作为 entries 加入。

`data.js` 仍由 `buildCanvasSite` 生成：`window.__FLIPBOOK__ = <payload>;`，并作为 entry 加入（产物 HTML 已含 `<script src="./data.js">`）。

`__TITLE__` 替换逻辑移除（标题改为运行时设置，见 3.4）。

`serve-preview.mjs` 与 `example-doc-publish.mjs` 消费 `site.entries`，**无需改动**。

### 构建顺序依赖

`buildCanvasSite` 依赖 `web/dist-export/` 已存在。处理：

- 文档说明：导出链路前需先运行 `npm run build:export`。
- `buildExport.js` 在读取 `dist-export/` 前检查目录存在，缺失时抛出清晰错误（提示先构建），而非静默失败。
- CI / 发布流程在调用导出脚本前先构建。

## 6. 错误处理

- `dist-export/` 缺失：`buildCanvasSite` 抛 `Error('export build missing — run `npm run build:export` first')`。
- `window.__FLIPBOOK__` 缺失或为空（理论上不应发生）：export 应用渲染一个简短的「无数据」占位，而非白屏。
- `file://` 下图片相对路径解析失败：沿用现有 `ProgressiveImage` 的 broken-image 隐藏逻辑。

## 7. 验证 / 测试

1. **回归**：`npm run build` 产物与改造前对比，在线应用功能不变（SSE、生成、分享、导出按钮均正常）。
2. **导出产物可离线打开**：`npm run build:export` 后跑 `node scripts/serve-preview.mjs <canvasId>`，浏览器中能浏览、导航、看图、全屏。
3. **export 品牌定制核对**（§2.1 的 5 点）：页脚版权条存在；GitHub 直出在顶栏；无运行时语言切换；导航时标签页标题跟随；顶栏扁平（无 More / 返回 / 分享）。
4. **`file://` 直开**：导出 zip 解压后双击 `index.html`（`file://`）能正常工作。
5. **tree-shaking 生效**：检查 `dist-export/viewer.js` 不包含 `EventSource`、`/api/canvas` 写操作字符串、`ClickComposer` 等标识；记录包体相对完整应用的减小。
6. `example-doc-publish.mjs --no-push` 产出的站点与 `serve-preview` 一致。

## 8. 风险与权衡

- **被否方案 A：单产物 + 运行时开关**。无 tree-shaking，导出包仍含 SSE/写 API 代码——与本次「tree-shaking 剔除无用 module」的核心诉求冲突，否决。
- **被否方案 B：静态 `data.json` fetch**。`file://` 下 fetch 触发 CORS，破坏离线直开（现状 viewer 支持 `file://`），会造成回归，否决。
- **IIFE + inlineDynamicImports**：放弃代码分割，单文件略大，但这是 `file://` 离线场景的必要取舍，且只影响 export 产物。
- **template/ 暂留**：短期内仓库存在两套 viewer（旧 template + 新 Vite 产物）。本次仅切换消费方到 Vite 产物；template 的删除留作后续，降低单次改动风险。
