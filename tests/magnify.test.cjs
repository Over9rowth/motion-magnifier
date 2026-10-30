'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { magnify, magnifyPixel, alphaForCyclePeriod } = require('../src/domain/magnify.cjs');

// 合成夹具：8×8 图 20 帧；左上 2×2 区块做 ±2 亮度正弦摆动（周期 10 帧），其余静止 128
function synthFrames(N = 20, W = 8, H = 8, amplitude = 2, period = 10) {
  const frames = [];
  for (let f = 0; f < N; f++) {
    const fr = new Float32Array(W * H).fill(128);
    const v = amplitude * Math.sin((2 * Math.PI * f) / period);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) fr[y * W + x] = 128 + v;
    frames.push(fr);
  }
  return frames;
}

function regionAmplitude(frames, W) {
  let min = Infinity, max = -Infinity;
  for (const fr of frames) {
    const v = fr[0]; // 左上区块像素
    if (v < min) min = v; if (v > max) max = v;
  }
  return (max - min) / 2;
}

test('放大：动区振幅随增益单调增长，静止背景基本不动', () => {
  const frames = synthFrames();
  const W = 8, H = 8;
  const opts = { alphaFast: alphaForCyclePeriod(3), alphaSlow: alphaForCyclePeriod(14) };
  const g1 = magnify(frames, W, H, { ...opts, gain: 1 });
  const g20 = magnify(frames, W, H, { ...opts, gain: 20 });
  const a1 = regionAmplitude(g1, W), a20 = regionAmplitude(g20, W);
  assert.ok(a20 > a1 * 5, `增益 20 的振幅 (${a20.toFixed(2)}) 应明显大于增益 1 (${a1.toFixed(2)})`);
  // 背景（像素 40）在放大前后都应接近 128（带通分量小）
  const bgBefore = frames.map((f) => f[40]);
  const bgAfter = g20.map((f) => f[40]);
  const bgAmp = (arr) => Math.max(...arr) - Math.min(...arr);
  assert.ok(bgAmp(bgAfter) < Math.max(2, bgAmp(bgBefore) * 25 + 4), `背景振幅异常: ${bgAmp(bgAfter).toFixed(3)}`);
});

test('增益 0 恒等返回（安全边界）', () => {
  const frames = synthFrames();
  const out = magnify(frames, 8, 8, { gain: 0 });
  for (let f = 0; f < frames.length; f++)
    for (let i = 0; i < frames[f].length; i++)
      assert.ok(Math.abs(out[f][i] - frames[f][i]) < 1e-6);
});

test('不修改输入帧（纯函数）', () => {
  const frames = synthFrames();
  const before = frames[0][0];
  magnify(frames, 8, 8, { gain: 30 });
  assert.ok(Math.abs(frames[0][0] - before) < 1e-9);
});

test('尺寸不符抛错', () => {
  assert.throws(() => magnify(synthFrames(5), 9, 8, { gain: 1 }));
});

test('alphaForCyclePeriod：周期越大 alpha 越小（响应更低频）', () => {
  assert.ok(alphaForCyclePeriod(20) < alphaForCyclePeriod(3));
  assert.ok(alphaForCyclePeriod(1) <= 1 && alphaForCyclePeriod(1) > 0.9);
});

test('反向对照：把带通改成恒等（gain 恒 0 行为）后振幅单调性断言必须失败', () => {
  // 模拟引擎退化（例如误把 slow/fast 用同一个 alpha），放大不再随增益增长
  const frames = synthFrames();
  const W = 8, H = 8;
  const broken = (gain) => magnify(frames, W, H, { gain, alphaFast: 0.3, alphaSlow: 0.3 }); // 带通恒 0
  const a1 = regionAmplitude(broken(1), W), a20 = regionAmplitude(broken(20), W);
  assert.ok(!(a20 > a1 * 5), '反向对照失败：退化引擎不应通过单调性断言');
});
