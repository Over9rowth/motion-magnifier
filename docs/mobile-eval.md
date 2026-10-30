# 移动端评估：微动放大镜

日期：2026-10-29。本机构建条件实测见 shadow-craft/docs/mobile-eval.md。

## 结论

- **可行但最重**：抽帧/放大/导出均为浏览器能力，可 Capacitor 包装；但逐像素时域滤波是 CPU 密集，移动端需进一步降分辨率（≤240px）或砍时长（≤8s）。
- 本桌面环境实测结论对跨端直接适用：MediaRecorder 不可靠 → 用 WebCodecs + 内置 WebM 复用器（Android Chrome 支持 WebCodecs）。
- **工作量估计**：2–3 天（含真机性能调优）。

## 状态

- [x] 移动端评估（本文件）
- [ ] Android APK 交付——**未验证**（工具链未装）
