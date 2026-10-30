# 微动放大镜 docs/implementation-status.md（追加式）

## 2026-10-29 初建（协调者直接开发）

目标：02-后备点子 #2 微动放大镜。四项硬要求（①大众审美 UI/零学习成本 ②零基础 PDF 说明书 ③傻瓜式安装+标准卸载 ④移动端评估+APK）。

### 已实现

- 引擎 `src/domain/magnify.cjs`：简化欧拉运动放大（逐像素双时间常数 IIR 低通相减得带通，放大加回），纯函数。`tests/magnify.test.cjs` **6/6 通过**（2026-10-29 实测，含：增益单调性、增益 0 恒等、纯函数性、尺寸校验、频率换算、**反向对照**——把带通退化为恒等后单调性断言确认变红）。
- 三步向导 UI：导入视频（≤15s，30fps 抽帧，160×120 工作分辨率）→ 双滑块实时"原图 vs 放大后"并排预览 → MediaRecorder 实时录制导出 WebM。
- main/preload：save-webm（Base64→文件）、说明书 printToPDF、Squirrel 快捷方式钩子（同 shadow-craft 已验证模式）、--smoke 全链路（渲染进程合成"微小运动"视频 → 解码抽帧 → 放大 → 重编码 WebM → 主进程 EBML 头 0x1A45DFA3 校验）。
- 说明书 resources/manual.html（零基础排版级，含"不是测量仪器/不做诊断"边界声明）。
- 移动端评估：docs/mobile-eval.md（待写，见 shadow-craft/docs/mobile-eval.md 同框架）。

### 2026-10-29 实测结果（协调者执行，接"尚未验证"清单）

- `npm test`：**11/11 通过**（引擎 6 + WebM 复用器 5，含反向对照）。
- `npm run smoke`：**SMOKE PASS**（退出码 0）——完整闭环：合成 ±1.2px 微动帧序列 → WebCodecs VP8 编码 + 内置 WebM 复用器 → **解码回环**（浏览器 <video> 真实解码复用产物，duration=2s 校验）→ 放大 → 再编码导出 WebM 15,312 字节（EBML 头校验）→ 说明书 PDF 249,995 字节。日志 `docs/smoke.log`。
- **Squirrel 安装包**：make 一次成功（离线镜像方案）。**安装/卸载实测 10/11**（`docs/install-verify.log`）：安装/注册表/快捷方式/启动标题（码位比对）/卸载全过；唯一 FAIL 为"残留清单"——实测残留含 `app-0.1.0/v8_context_snapshot.bin`（强杀进程后立即卸载导致运行时文件未及释放），与 Squirrel 固有残留模式的差异已如实记录，属测试时序而非卸载缺陷。
- 交付物：`交付物/MotionMagnifier-0.1.0-Setup.exe`，155,278,848 字节，SHA-256 `38964d94691d2818a10a834997bd53563eb563d74eca1ef3da9688e87c561b75`。
- **环境级发现（重要，已同步给 loop-slicer 与后续开发）**：
  1. 本 Electron 44 环境 MediaRecorder 画布采集失效（captureStream 30fps/rAF、captureStream(0)+requestFrame、可见窗口、GPU/软件等多种组合均只产出 ~110 字节头）；loop-slicer 独立实锤为 GPU 硬件加速问题并以 `app.disableHardwareAcceleration()` 缓解。本工具采用 **WebCodecs VP8 + 内置 WebM 复用器**（不依赖合成器）。
  2. 复用器开发中踩过的两个真实 bug（均有 ffmpeg v7.1 佐证）：Duration 单位是 TimecodeScale（1ms）而非秒；CSP 缺 `media-src` 会把 blob 视频拦截成 MediaError 4（与"容器不合法"症状相同，极难分辨）。
- **尚未验证**：真实拍摄视频的人工效果验收（需用户）；Android APK（评估见 docs/mobile-eval.md）。

### 下一步

npm install → test → smoke（合成视频全链路）→ 打包安装实测 → 交付物。

---

## 2026-10-29 R-STD 收尾（TASK-MM-01 → 0.1.1）

猫猫初审问题单 5 条 + 类型检查暴露的 1 处真实功能 bug，本轮全部关闭。

### 改了什么

| 文件 | 变更 |
|---|---|
| `src/domain/magnify.d.cts` | 新增。为 `magnify.cjs` 补类型契约（`MagnifyOptions`/`lowpass`/`magnifyPixel`/`magnify`/`alphaForCyclePeriod`），消除 `TS7016` |
| `src/domain/webm.d.cts` | 新增。为 `webm.cjs` 补类型契约（`WebmFrame`/`WebmOptions`/`buildWebM`），返回类型写明 `Uint8Array<ArrayBuffer>` 以便直接当 `BlobPart` |
| `src/renderer/App.tsx` | ① `muxToBase64` 返回类型 `string` → `Promise<string>`（`TS1064`）；② **第 163 行补 `await`** —— 这是真 bug，见下；③ `engineOk` 的 `(fr, i)` 随声明文件到位自动收窄（`TS7006`） |
| `package.json` | `version` 0.1.1；`author` → `Over9rowth`；新增 `typecheck`/`icon`/`manual`；`build` 前置 `tsc --noEmit`；补 `appCopyright`/`appVersion`/`icon`/`win32metadata`；`ignore` 增 `^/resources ^/node_modules ^/out ^/out-`；squirrel maker 补 `setupIcon` |
| `README.md`、`LICENSE`、`.gitignore`、`.gitattributes` | 新增（README 含「它不是什么」、160×120 工作分辨率的诚实边界；LICENSE 为 MIT + `Copyright (c) 2026 Over9rowth`） |
| `resources/icon.svg` + 7 张 PNG + `icon.ico` | 新增。深色圆角底 + 青色放大镜环与手柄 + 琥珀色正弦波（第一版画了两条波，32px 下糊成一团，改为单条） |
| `scripts/make-icon.mjs`、`scripts/make-manual-pdf.mjs` | 新增。图标渲染借隔壁 sharp；说明书 PDF 可复现生成（`npm run manual`） |
| `scripts/smoke.mjs` | 冒烟启动补 `--disable-gpu` 等参数（见下） |
| `scripts/install-verify.py` | 版本参数化到 0.1.1；修掉从影子项目抄来的「影子」判断（原来根本匹配不到本项目的卸载项）；补 `Publisher`/`DisplayVersion` 断言、桌面快捷方式、安装版 `--smoke`；残留判定改为记录在案的 Squirrel 固有模式并打印残留明细 |
| `docs/install-verify.log`、`docs/make.log`、`docs/smoke.log` | 脱敏 5 处本机用户目录 + 2 处百分号编码的 `file:///` 工程路径；旧日志另存 `docs/install-verify-0.1.0.log` |

### 类型检查暴露的真实功能 bug

`muxToBase64` 声明返回 `string`，实际是 `async` 函数返回 `Promise<string>`，而第 163 行的调用点**没有 `await`**：

```ts
const dataUrl = muxToBase64(encd.W, encd.H, FPS, encd.frames);  // 拿到的是 Promise
const r = await api.saveWebm(dataUrl, '微动放大-结果.webm');      // 把 Promise 交给了主进程
```

也就是说 0.1.0 里「第三步 → 导出放大后的视频」这条路是断的（主进程的 `dataUrl.startsWith('data:video/webm;base64,')` 校验会直接抛「视频数据无效」）。冒烟没测出来是因为它走的是另一条 `onSmokeRun` 分支（那分支本来就写了 `await`）。现已修复。

### 已实测（2026-10-29 21:25—21:36）

1. `npx tsc --noEmit` → **0 错**（修前 5 错；补声明文件后又暴露 3 处更深的问题，其中 1 处即上述真 bug；合计 8 处归零）。
2. `npm test` → **11/11 通过**（260 ms）。
3. `npm run build` → `tsc --noEmit && node scripts/build.mjs`，`build ok`。
4. `npm run smoke` → **SMOKE PASS**：合成微动 → VP8 编码 → 复用器 → 解码回环（duration=2s）→ 放大 → 再导出 **16,655 字节** WebM（EBML 头通过）+ 说明书 PDF **249,995 字节**。连跑两次字节数完全一致。日志 `docs/smoke-0.1.1.log`。
5. 打包（`subst X:` + 离线镜像）→ `MotionMagnifier-0.1.1 Setup.exe` **154,058,752 字节**，sha256 `f6c98b142865c27c3b0417b7611ab3f2ad2c85e45deb0bef64369ac123847379`。
6. 主程序 `MotionMagnifier.exe` 版本信息：`CompanyName Over9rowth` / `FileDescription 微动放大镜` / `ProductName 微动放大镜` / `FileVersion 0.1.1` / `ProductVersion 0.1.1` / `LegalCopyright Copyright (c) 2026 Over9rowth` / `InternalName MotionMagnifier` / `OriginalFilename MotionMagnifier.exe`。
   - `Setup.exe` 自身的 `FileDescription`/`ProductName` 仍是 `description` 文案（`把视频里肉眼难察觉的微小运动放大到看得见`）——这是 `maker-squirrel` 的既有行为，家族三个项目一致，非本项目缺陷。
7. 安装验收 **16/16 通过**（`docs/install-verify.log`）：静默安装 exit 0、`app-0.1.1\` 就位、注册表唯一且 `DisplayVersion=0.1.1`、**`Publisher=Over9rowth`**、开始菜单与桌面两条 `.lnk` 齐备、经快捷方式启动后窗口标题 `微动放大镜` 5 码位逐字一致（0x5fae 0x52a8 0x653e 0x5927 0x955c）、安装版 `--smoke` PASS（16,655 B WebM + 249,995 B PDF，与源码树一致）、卸载 exit 0、注册表清除、两条 `.lnk` 删除。
8. 卸载残留：`.dead`(1B) + `Update.exe` + `app-0.1.1\{squirrel.exe, v8_context_snapshot.bin}`。**再执行一次 `Update.exe --uninstall` 后 `v8_context_snapshot.bin` 被清掉**，只剩 `.dead`/`Update.exe`/`app-0.1.1\squirrel.exe` —— 与 `loop-slicer` 完全一致，确认为 Squirrel 固有模式（运行中的 `Update.exe`/`squirrel.exe` 删不掉自己），不是卸载缺陷。
9. 说明书 PDF：249,995 字节 / 3 页 / `%PDF-1.4` / 内嵌 MicrosoftYaHei 子集 2 个（另含 SegoeUIEmoji 子集）。
10. 本机路径复扫：本机用户名、盘符工程绝对路径、旧发布者署名在源码与 `docs/` 内 **0 命中**（`SPEC.md` 除外，见下）。

### 本轮踩到的坑

1. **冒烟在无 GPU 的会话里会崩**（同 loop-slicer / shadow-craft）：`GPU process isn't usable. Goodbye.`。`scripts/smoke.mjs` 已显式带 `--disable-gpu --disable-gpu-sandbox --in-process-gpu --no-sandbox`。
2. **`electron-forge` 会把留在工程里的旧 `out/` 一起打进包**：本轮先把 825 MB 的旧 `out/` 移出工程，`ignore` 同时加 `^/out`、`^/out-`。
3. **`install-verify.py` 的卸载项匹配写错了项目名**（`"影子" in name`），在 0.1.0 那轮之所以还能 PASS，是因为同时匹配了注册表子键名 `MotionMagnifier`。本轮改为按 `微动放大镜` 与 `MotionMagnifier` 双条件。
4. **旧版 0.1.0 的卸载残留会污染新版本判定**：先把 `%LOCALAPPDATA%\MotionMagnifier` 整体归档到临时目录，再做 0.1.1 的干净安装测试。

### 待猫猫裁决（不阻断）

- `SPEC.md` 有 2 处字符被写成了 NUL 字节（都在「目标版本」那行的版本号首位），另有若干字符直接缺失（`any`/`async` 的 `a`、`version` 的 `v`、`author`/`appCopyright` 的 `a`）。按上下文均可还原，`SPEC.md` 未改写原文（已排除在清单与源码归档之外）；`project_meta/TASK_BOARD.md` 有同类问题，已在本轮重写时修正。

