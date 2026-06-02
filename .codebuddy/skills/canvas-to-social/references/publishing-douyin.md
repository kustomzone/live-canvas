# 通过浏览器自动化发布到抖音

导出阶段是确定性的（一个脚本）。**发布不是**——抖音没有面向个人的图文发布公开 API，
所以我们用 `browser-harness` CLI（CDP，接管用户已登录的 Chrome）操作创作者中心网页
（`creator.douyin.com`）。其用法文档见 `skills/` 下的同级 `browser-harness` skill。

> **铁律：** 永远不要自己点最终的「发布」按钮。发布是不可逆、对外公开的动作。把所有
> 内容填好后停手，把最后一步交给用户。仅当用户明确要求时才可点「存草稿」。

## ⚠️ 自更新约定（重要）
抖音创作者中心是 React/Semi 页面，**DOM 结构、class 名、入口文案变化很快**。本文档里的
选择器（如 `.container-right-uW7Pj1`、`.action-Q1y01k`、`.semi-select-option`）是**某次实测
快照，随时可能失效**。因此每次执行时遵循「探测 → 适配 → 回写」闭环：

1. **先探测再操作**：每一步动作前，用 `js()` 读当前 DOM（列出候选元素的 tag/class/文字/
   cursor/坐标），确认选择器仍然命中，再动手。不要盲目套用文档里的旧 class。
2. **失效就现场适配**：若某选择器查不到（返回 `no`/空），用更稳的语义定位兜底——按
   **可见文字**（如「选择音乐」「修改音乐」「不选择合集」）找元素，或用 `cursor:pointer`
   的祖先、`document.elementFromPoint` 命中测试来锁定真正可点的节点。
3. **回写本文档**：只要这次发现**与本文不符的新结构/新坑/更稳的做法**，就**立即用 Edit
   更新本 publishing-douyin.md（及上层 SKILL.md 的对应摘要）**，把旧选择器标注为「（旧，可能失效）」
   并补上新选择器和探测代码。目标是让下次执行拿到的是最新规则。
4. 标注实测日期，方便判断新鲜度。

## 前置条件
- 用户已在自己的 Chrome 中登录抖音。
- `browser-harness` CLI 可用（CDP harness）。先调用它。
- 已存在导出文件夹（先跑 `export_canvas.py`）。需要 ≤35 张图，以及 `文案.md` 里的正文。

## 字段限制（已实测）
- **标题：** ≤ 20 字。输入框会静默截断，标题尽量短。
- **作品描述（正文）：** ≤ 1000 字。话题用纯文本 `#词 ` 写在正文里，会被解析成话题。
- **图片：** 每条图文 ≤ 35 张。

## 逐步操作

### 1. 打开图文编辑器
直接进发布图文页（最稳，免去首页找入口）：
```python
new_tab("https://creator.douyin.com/creator-micro/content/upload?default-tab=3")
wait_for_load()
# 落地即图文上传页（.../content/upload?...&default-tab=3）
```
> 备选（旧法）：打开 `https://creator.douyin.com/` 首页后按文字找「发布图文」卡片再点。
> 直链失效时才回退到这种方式：
```python
js("""(()=>{const o=[];document.querySelectorAll('div,button,span').forEach(el=>{
  const t=(el.innerText||'').trim();
  if(/发布图文/.test(t)&&t.length<=6){const r=el.getBoundingClientRect();
    if(r.width&&r.height)o.push({t,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});}});
  return o;})()""")
```
跳转到 `.../content/post/image?...`。

### 2. 上传图片（CDP 文件注入——不弹原生选择器）
页面只有一个 `input[type=file]`（`accept=image/*`，`multiple`）。用 harness 的
`upload_file`，它内部用 `DOM.querySelector` + `DOM.setFileInputFiles` 解析节点。
**传绝对路径的排序列表**，保证顺序是 01..35。
```python
import glob
files = sorted(glob.glob("/abs/path/social-export/<主题>/images/*.png"))
upload_file("input[type=file]", files)   # helper 接受列表
```
等约 8 秒；通过统计 `[draggable=true]` 缩略图数量（每张图一个）来核对。

> 不要手写 `cdp("DOM.setFileInputFiles", ...)` 加手动遍历节点树——raw `cdp()` helper
> 会拒绝带 `sessionId` 的键，而深度 pierce 遍历很脆弱。用 `upload_file(选择器, 列表)`。

### 3. 填标题（≤20）—— 用 value setter，不是逐键输入
`type_text` 可能竞态/截断。直接设置 React 受控 input 的值：
```python
js("""(()=>{const el=document.querySelector('input[placeholder*="标题"]');
  el.focus();const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
  set.call(el,'');el.dispatchEvent(new Event('input',{bubbles:true}));
  set.call(el, TITLE);el.dispatchEvent(new Event('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true}));})()""".replace("TITLE", repr(title)))
```
读回 `value` 并断言 `len<=20`。

### 4. 填正文（≤1000）—— contenteditable 用 execCommand
描述区是一个 `[contenteditable=true]` 富文本编辑器。先点它，再：
```python
js("""(()=>{const el=document.querySelector('[contenteditable=true]');el.focus();
  const sel=getSelection();const rng=document.createRange();rng.selectNodeContents(el);
  sel.removeAllRanges();sel.addRange(rng);document.execCommand('delete');
  document.execCommand('insertText',false, BODY);return el.innerText.length;})()
""".replace("BODY", repr(body)))
```
话题以 `#词 #词` 形式放在 BODY 末尾（纯文本；抖音发布时自动转链接）。

### 5.（可选）背景音乐 —— 悬停才出现「使用」
> 选择器为 2026-06 实测快照，按顶部「自更新约定」每次先探测、失效就改本节。

**先决条件（关键坑）：** 选音乐入口在「作品描述」下方那张「选择音乐」卡片。它的真正可点
元素是 `.container-right-uW7Pj1`（内含 `.action-Q1y01k` 的「选择音乐」span，旧 class 可能失效，
失效时按可见文字「选择音乐」/「修改音乐」定位）。几个高频坑：

- **入口有两种状态：尚未选 → 文字是「选择音乐」；已选过 → 文字变「修改音乐」。** 两者都在
  同一个 `.container-right-uW7Pj1` 容器里。
  - **首次选**（未选状态）：原生 `.click()` 那个容器/`.action-Q1y01k` 最稳。
  - **重选/换歌**（已是「修改音乐」）：**原生 `.click()` 往往打不开抽屉**，要用
    `el.scrollIntoView({block:'center'})` 后取坐标 `click_at_xy(x,y)` 点「修改音乐」才会重开
    抽屉。两种方式都试一次最稳妥。
- **残留下拉浮层会盖住它。** 如果上一步（合集 `.semi-select`）的下拉没收起，它的
  `.semi-portal` 会覆盖在音乐入口坐标上，`click_at_xy` 会点到 `.semi-select-option` 而不是
  音乐入口。用 `document.elementFromPoint(cx,cy)` 做命中测试，若返回 `semi-select-option`
  就先收起下拉（点标题输入框/空白区，或先把合集选完再来选音乐）。

```python
import time
# 打开音乐抽屉。先试原生 click（首次选最稳），没开再用坐标点（重选「修改音乐」时需要）。
def open_music_drawer():
    js("""(()=>{const sp=document.querySelector('.action-Q1y01k')||document.querySelector('.container-right-uW7Pj1')
      ||[...document.querySelectorAll('span,div')].find(e=>/^(选择音乐|修改音乐)$/.test((e.innerText||'').trim()));
      if(sp)sp.click();return sp?'native':'none';})()""")
    time.sleep(3)
    rows = js("""(()=>({n:[...document.querySelectorAll('div')].filter(e=>/万人使用/.test(e.innerText||'')).length}))()""")['n']
    if rows: return True
    # 回退：坐标点「修改/选择音乐」
    pos = js("""(()=>{const el=[...document.querySelectorAll('span,div')].find(e=>/^(选择音乐|修改音乐)$/.test((e.innerText||'').trim()));
      if(!el)return null;el.scrollIntoView({block:'center'});const b=el.getBoundingClientRect();
      return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};})()""")
    if pos: click_at_xy(pos['x'], pos['y']); time.sleep(3.5)
    return js("""(()=>({n:[...document.querySelectorAll('div')].filter(e=>/万人使用/.test(e.innerText||'')).length}))()""")['n'] > 0

assert open_music_drawer(), "音乐抽屉没打开——页面结构可能变了，按自更新约定重新探测入口并改本节"
```

1. 抽屉打开后，**从「较热门」里随机挑一首**（而不是固定取播放量第一）。这样多条图文
   不会都配同一首 BGM。做法：扫所有歌曲行，正则提取 `([\d.]+)万人使用`，按播放量降序
   取前 K 首（K 建议 8~12，保证都是热门候选），再用 `random.choice` 随机选一首：
```python
import random
rows = js("""(()=>{const rows=[];document.querySelectorAll('div').forEach(el=>{
  const t=(el.innerText||'');const m=t.match(/([\\d.]+)万人使用/);const r=el.getBoundingClientRect();
  if(m&&r.left>800&&r.width>250&&r.height>40&&r.height<100&&t.length<60)
    rows.push({num:parseFloat(m[1]),y:Math.round(r.y+r.height/2),txt:t.replace(/\\n/g,' ').slice(0,30)});});
  const seen={};const out=[];rows.forEach(x=>{if(!seen[x.y]){seen[x.y]=1;out.push(x);}});
  out.sort((a,b)=>b.num-a.num);return out;})()""")
TOP_K = 10
pool = rows[:TOP_K] if len(rows) >= TOP_K else rows
choice = random.choice(pool)        # 从前 K 热门里随机一首
row_y = choice['y']
print("PICKED:", choice['txt'], choice['num'], "万人使用")
```
   > **批量发布去重**：如果你在一轮里连续填多条图文，把每条已选的歌名记进一个
   > `used_songs` 集合，随机时跳过已选过的（`pool = [r for r in pool if r['txt'] not in used_songs]`，
   > 若过滤后为空再退回完整 pool）。目标是「每条都是合适的热门 BGM，但尽量各不相同」。
2. 每个歌曲行只在悬停时才显示「使用」按钮。CDP `mouseMoved` 不稳；改为在该行派发合成
   hover 事件，然后 `.click()` 那个「使用」元素：
```python
js("""(()=>{let row=null;document.querySelectorAll('div').forEach(el=>{const r=el.getBoundingClientRect();
  if(r.left>800&&Math.abs(r.y+r.height/2-ROWY)<16&&r.width>250&&r.height>40&&r.height<100&&!row)row=el;});
  if(!row)return 'no row';['pointerover','mouseover','mouseenter','mousemove'].forEach(t=>row.dispatchEvent(new MouseEvent(t,{bubbles:true})));
  let b=null;row.querySelectorAll('button,div,span').forEach(el=>{if((el.innerText||'').trim()==='使用')b=el;});
  if(b){b.click();return 'used';}return 'no use btn';})()""".replace("ROWY", str(row_y)))
```
3. 核对：编辑器现在显示歌名 + 「修改音乐」（读 `document.body.innerText` 含「修改音乐」即成功）。

### 6. 合集 —— 存在「图解世界」就选，否则跳过
合集选择器是 Semi-UI 的 `.semi-select`（placeholder 文字「不选择合集」）。本 skill 的
默认行为：**如果已存在名为「图解世界」的合集就选它，否则保持「不选择合集」（不要新建）。**
仅当用户明确要求时才通过「合集管理」新建合集。

用坐标点击打开下拉很不稳；改为在选区元素上触发 Semi 的 open 处理，然后从
`.semi-select-option` 浮层读取选项（它渲染在 append 到 `<body>` 的 `.semi-portal` 里）。

> **务必用 placeholder 文字「不选择合集」来定位那个 `.semi-select`**——不要用
> 「合集」二字去匹配，页面上「合集」往往是旁边的**字段标签**，匹配到它会点不开真正的
> 下拉、只读到 `['合集']` 这种假选项。合集选择器未选时显示 `不选择合集`，这才是要点开的元素。

```python
import time
# 1) 打开下拉 —— 用「不选择合集」定位选择器本体（不是「合集」标签）
js("""(()=>{const sels=[...document.querySelectorAll('.semi-select')];
  const el=sels.find(s=>(s.innerText||'').indexOf('不选择合集')>=0);
  if(!el)return 'no-select';el.scrollIntoView({block:'center'});
  const sel=el.querySelector('.semi-select-selection')||el;
  ['pointerdown','mousedown','mouseup','click'].forEach(t=>sel.dispatchEvent(new MouseEvent(t,{bubbles:true})));
  return 'opened';})()""")
time.sleep(1.3)
# 2) 读选项（形如「图解世界\n共0个作品」），点含「图解世界」的那个
res = js("""(()=>{const opts=[...document.querySelectorAll('.semi-select-option')];
  const names=opts.map(o=>(o.innerText||'').trim());
  const hit=opts.find(o=>(o.innerText||'').indexOf('图解世界')>=0);
  if(hit){hit.scrollIntoView({block:'center'});
    ['pointerdown','mousedown','mouseup','click'].forEach(t=>hit.dispatchEvent(new MouseEvent(t,{bubbles:true})));
    return {picked:'图解世界', options:names};}
  return {picked:null, options:names};})()""")
# 若 res.picked 为 None -> 按 Escape 关掉下拉，保持不选（跳过，不新建）
```
打开后 `options` 应能读到真实合集列表（如 `['不选择合集','图解世界\n共0个作品', ...]`）；
若只读到 `['合集']`，说明定位错了元素（点到了字段标签），按上面的「不选择合集」重新定位。
选中后选择器区域会显示所选合集名（如「图解世界 第1集」）。如果 `picked` 为 null，按
`Escape` 关闭下拉、保持不选合集直接跳过。判断依据是选项文字，不需要坐标。

### 7. 最终校验 + 停手
读回并向用户报告：标题（+字数）、正文字数、图片数（`[draggable=true]`）、所选音乐。
定位「发布」按钮但**不要点它**：
```python
js("""(()=>{const o=[];document.querySelectorAll('button').forEach(el=>{
  if((el.innerText||'').trim()==='发布'){const r=el.getBoundingClientRect();
    o.push({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});}});return o;})()""")
```
告诉用户内容已就绪，请他们自己检查后点「发布」。

## 健壮性要点（实战总结）
- 坐标会在不同会话间和滚动后漂移。**每次操作前都按文字/placeholder 重新查询元素位置**；
  绝不跨步骤复用坐标。
- 如果 `cdp()`/`js()` 调用开始超时，调 `ensure_real_tab()` 重新挂接。
- 用 `js()` 读取（value/innerText/计数）来核对，不要只靠截图。
- React/Semi 输入框忽略简单的 `.value=`；用 prototype value setter + 派发
  `input`/`change`，或对 contenteditable 用 `execCommand('insertText')`。
