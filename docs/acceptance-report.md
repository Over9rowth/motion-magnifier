# 微动放大镜 · 验收报告（对照用户四项硬要求）

日期：2026-10-29。三态判定。

| # | 要求 | 判定 | 证据 |
|---|---|---|---|
| ① | 大众审美级 UI 与零学习成本交互 | 已实测通过（自动化部分）/ **审美人工验收未验证** | 三步向导 + 双滑块实时"原图 vs 放大后"并排预览；`npm run smoke` 挂载实测 |
| ② | 零基础排版级 PDF 用户说明书 | 已实测通过（出纸）/ **逐页人工过目未验证** | 冒烟导出 249,995 字节 PDF（含"不是测量仪器/不做诊断"边界） |
| ③ | Windows 傻瓜式安装与系统级标准卸载 | **已实测通过 10/11** | `scripts/install-verify.py`（docs/install-verify.log）；唯一 FAIL 为残留清单多出 `v8_context_snapshot.bin`（强杀后立即卸载的测试时序所致，已如实记录） |
| ④ | 移动端评估与 Android APK 跨端交付 | 评估已实测；**APK 未验证** | `docs/mobile-eval.md`（最重的一件：移动端需降分辨率/砍时长；WebCodecs 路线适用于 Android） |

## 功能闭环证据

- 引擎：`npm test` 11/11（放大单调性/增益 0 恒等/纯函数性/频率换算/WebM 结构/反向对照）。
- 端到端冒烟：合成 ±1.2px 微动帧 → VP8 编码 → 内置复用器 → **解码回环**（浏览器 <video> 真实解码，duration=2s）→ 放大 → 导出 WebM 15,312 字节（EBML 头校验）。

## 过程中实锤的环境问题（已记录，供后续开发避坑）

1. 本 Electron 44 环境 MediaRecorder 画布采集失效（多组合实测均 ~110 字节头）；loop-slicer 独立定位为 GPU 硬件加速并可用 `app.disableHardwareAcceleration()` 缓解。本工具改用 WebCodecs + 内置 WebM 复用器。
2. 自研复用器的两个真实 bug 均已修复并有 ffmpeg v7.1 解码佐证：Duration 单位（TimecodeScale，非秒）；CSP 缺 `media-src` 的拦截症状与"容器不合法"相同。

## 已知限制

- 输出 160×120 WebM（速度与效果平衡）；单层金字塔简化算法对大幅运动会产生伪影；不输出振幅/频率数值（可视化观察用途，非测量仪器）。

## 未验证风险

- 真实拍摄素材上的人工效果（增益手感、伪影程度）需用户验收。

---

# 0.1.1 复测（TASK-MM-01，2026-10-29）

本轮修类型契约 + 补工程文件 + 改打包配置，并修掉一处被类型检查逼出来的真实功能 bug（导出路径未 `await`）。

| 项 | 结果 | 证据 |
|---|---|---|
| 类型检查 | ✅ 0 错（修前 5 错，补声明后又暴露 3 处，其中 1 处为真 bug） | `npx tsc --noEmit`；`build` 已前置该检查 |
| 单元测试 | ✅ 11/11 | `npm test`，260 ms |
| 端到端冒烟 | ✅ SMOKE PASS | 解码回环 duration=2s；导出 WebM 16,655 B（EBML 头通过）+ 说明书 PDF 249,995 B；连跑两次字节一致 |
| 打包 | ✅ 154,058,752 字节 | sha256 `f6c98b142865c27c3b0417b7611ab3f2ad2c85e45deb0bef64369ac123847379` |
| 主程序版本信息 | ✅ 全字段合规 | Over9rowth / 微动放大镜 / 0.1.1 / Copyright (c) 2026 Over9rowth |
| 安装验收 | ✅ **16/16** | `docs/install-verify.log`；`Publisher=Over9rowth`、`DisplayVersion=0.1.1` |
| 快捷方式 | ✅ 两条都在 | 开始菜单 + 桌面「微动放大镜.lnk」 |
| 快捷方式启动 | ✅ 窗口标题 5 码位逐字一致 | 0x5fae 0x52a8 0x653e 0x5927 0x955c |
| 安装版跑管线 | ✅ SMOKE PASS | 16,655 B WebM + 249,995 B PDF，与源码树一致 |
| 卸载 | ✅ 退出码 0 | 注册表清除、两条 `.lnk` 删除 |
| 卸载残留 | ✅ 仅 Squirrel 固有项 | `.dead` + `Update.exe` + `app-0.1.1\{squirrel.exe, v8_context_snapshot.bin}`；再执行一次卸载即只剩 `.dead`/`Update.exe`/`squirrel.exe` |
| 说明书 PDF | ✅ 249,995 字节 / 3 页 | `npm run manual`；sha256 `7a643115e78940aa69543d12e38eeeed9073d4ecf6386587f7af41f3cc330168` |
| 源码归档 | ✅ 已产出 | `交付物/MotionMagnifier-0.1.1-Source.zip`（不含 `node_modules/ out/ dist/ project_meta/ SPEC.md` 与安装包产物）；字节数、条目数与 SHA-256 登记在 `project_meta/PROJECT_STATE.md`（归档内含本文件，写自身摘要会自指） |
| 仓库卫生 | ✅ 0 命中 | 5 份日志共 5 处本机用户目录 + 2 处百分号编码工程路径已脱敏（`SPEC.md` 除外，待猫猫定） |

**本轮仍未验证**：真实拍摄素材的人工效果（增益手感、伪影程度）、UI 审美人工判定、PDF 逐页人工过目、Android APK。

