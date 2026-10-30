# 微动放大镜（motion-magnifier）

视频里有些东西一直在动，但幅度太小，肉眼几乎看不出来——音箱纸盆的振动、桌面的微颤、吊灯的轻晃、火苗的抖动。这个工具把这种**微小的周期性运动**放大到看得见，并且保留原画面做左右对照。

做法是经典的欧拉运动放大简化版：逐像素在时间轴上做**两个不同时间常数的一阶低通**，两者相减得到带通（只留「不快不慢」的那一段频率），再把这段信号乘上增益加回原值。

## 它是什么

- **三步向导**：① 导入一段小视频（≤15 秒）→ ② 两个滑块（「运动快慢」按目标运动周期调带通、「放大倍数」调增益），左右并排看「原图 / 放大后」→ ③ 导出放大后的 WebM。
- **真带通，不是加抖动**：`alphaFast` / `alphaSlow` 由目标运动周期换算（`1 - exp(-2π/T)`），只放大落在该周期附近的分量，静止部分基本不动。
- **不依赖录屏**：导出走 WebCodecs VP8 编码 + 内置 WebM 复用器（自己写 EBML），不经过 `MediaRecorder` 的画布采集。
- **零网络**：没有网络请求，视频只在本机内存里逐帧处理。

## 它不是什么

- **不是测量仪器**：它只告诉你「这里在动、动得比刚才明显」，**不输出任何毫米级的绝对位移**。像素位移与真实位移之间的换算需要镜头标定，本工具不做。
- **不做医疗或工业诊断**：不用于判断设备故障、不用于任何健康相关判断。
- **不能处理大幅运动**：位移超过几个像素时，线性近似失效，画面会出现明显的拖影与振铃。它是「把看不见的动变可见」，不是「把动得大的变小」。
- **工作分辨率是 160×120**：为了实时性，分析（以及导出结果）都在 160×120 上做，所以**导出的是小尺寸视频**，不是原分辨率。想看清细节请以预览窗口的对照为准。
- **要求固定机位**：相机自己动了，全局位移会被当成「运动」一起放大。

## 安装与使用

- 安装：运行 `交付物` 里的 `MotionMagnifier-<版本>-Setup.exe`（未签名，系统如提示请选择"仍要运行"）。安装后从开始菜单打开「微动放大镜」。
- 卸载：Windows 设置 → 应用 → 已安装的应用 → 微动放大镜 → 卸载。
- 第一次用：固定手机拍一段 5～10 秒的小视频（画面里有个会轻微动的东西），拖进窗口 → 把「放大倍数」拉大、「运动快慢」调到跟那个东西的抖动节奏接近 → 看左右对照，满意就导出。

## 开发命令

```bash
npm install        # 安装依赖
npm test           # 引擎 + WebM 复用器单元测试（node --test，11 项含反向对照）
npm run build      # 先 tsc --noEmit 类型检查，再用 esbuild 构建到 dist/
npm run typecheck  # 只跑类型检查
npm run smoke      # 真实启动 Electron：合成微动视频 → 编码 → 解码回环 → 放大 → 导出 → 校验
npm run dev        # 构建 + 打开应用
npm run manual     # 生成《用户使用说明书.pdf》到 交付物/
npm run icon       # 由 resources/icon.svg 重新生成各尺寸 PNG 与 icon.ico（需本机有 sharp）
npm run make       # electron-forge 打包（中文路径需先 subst，见 docs/implementation-status.md）
```

## 架构

- `src/domain/magnify.cjs`：放大引擎（`lowpass` / `magnifyPixel` / `magnify` / `alphaForCyclePeriod`），纯函数，可被 node 直接测试；`magnify.d.cts` 是对应类型声明。
- `src/domain/webm.cjs`：内置 WebM（EBML）复用器，只写 VP8 全关键帧，供导出与冒烟解码回环使用；`webm.d.cts` 是对应类型声明。
- `src/renderer/App.tsx`：React 三步向导；抽帧、带通放大、双画布对照、WebCodecs 编码都在渲染进程。
- `src/main/index.ts`：主进程（窗口、WebM 落盘、说明书 `printToPDF`、`--smoke` 全链路校验、Squirrel 快捷方式自管理）。
- `src/preload/index.ts`：contextIsolation 下的窄接口。
- `resources/manual.html`：内置图文说明书，经主进程 `printToPDF` 导出。

## 已知限制

- 分析与导出分辨率固定 160×120、30fps、最长 15 秒；长视频请先自己剪。
- 只输出 WebM（VP8），没有 MP4/H.264 编码路径。
- 相机抖动、光照突变会被当成运动放大；建议固定机位、避免开关灯。
- Windows 安装包未做代码签名。

## 第三方

- Electron 44.9.3、React 19.1.1、esbuild 0.25.11、TypeScript 5.9.3、@electron-forge 7.10.2（MIT/BSD 系许可，见 node_modules 内各包声明）。

## 许可

MIT，见 `LICENSE`。
