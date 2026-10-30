import fs from 'node:fs';

const path = 'src/renderer/App.tsx';
let t = fs.readFileSync(path, 'utf8');
const start = t.indexOf('/** 冒烟：合成');
const endMark = "api.smokeResult(JSON.stringify({ error: 'VARIANTS '";
const endPos = t.indexOf(endMark);
if (start < 0 || endPos < 0) { console.error('marker not found', start, endPos); process.exit(1); }
const after = t.indexOf('}', endPos) + 1;
const newFlow = `  /** 冒烟：合成微动帧 → WebCodecs 编码 + 内置复用器 → 解码回环 → 放大 → 导出 → 说明书 */
  async function smokeFlow() {
    const N = 60; // 2 秒 @30fps
    const imageDatas: ImageData[] = [];
    for (let i = 0; i < N; i++) {
      const im = new ImageData(160, 120);
      for (let p = 0; p < 160 * 120; p++) { im.data[p * 4] = 0xe8; im.data[p * 4 + 1] = 0xe2; im.data[p * 4 + 2] = 0xd8; im.data[p * 4 + 3] = 255; }
      const t = i / 30;
      const y = 60 + 1.2 * Math.sin((2 * Math.PI * t) / 1.5); // ±1.2px 微动
      for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) {
        const q = (Math.round(y) + dy) * 160 + 78 + dx;
        im.data[q * 4] = 0x4a; im.data[q * 4 + 1] = 0x66; im.data[q * 4 + 2] = 0xc9;
      }
      imageDatas.push(im);
    }
    // 1) 编码 + 复用：得到等价于用户导入的 WebM 输入
    const encd = await encodeFrames(imageDatas, FPS);
    const inputUrl = muxToDataUrl(encd.W, encd.H, FPS, encd.frames);
    // 2) 解码回环：浏览器解码器消费我们的复用输出（复用器正确性的端到端证明）
    const c = await extractFrames(inputUrl, () => {});
    // 3) 放大 + 导出
    const amp = magnify(c.frames, c.W, c.H, { gain: 20, alphaFast: alphaForCyclePeriod(3), alphaSlow: alphaForCyclePeriod(14) });
    const outs = c.colors.map((cl, i) => toImageData(cl, amp[i], c.frames[i]));
    const encd2 = await encodeFrames(outs, FPS);
    const saved = await api.saveWebm(await muxToBase64(encd2.W, encd2.H, FPS, encd2.frames));
    await api.exportManualPdf();
    api.smokeResult(JSON.stringify({ video: saved, roundTripFrames: c.frames.length }));
  }`;
t = t.slice(0, start) + newFlow + t.slice(after);
fs.writeFileSync(path, t);
console.log('replaced ok');
