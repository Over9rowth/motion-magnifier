// Copyright (C) 2026 Over9rowth
// SPDX-License-Identifier: GPL-3.0-only
// 微动放大引擎（简化欧拉运动放大，纯函数、可在 node 测试）。
// 帧序列为 Float32Array 亮度平面（W×H），逐像素时域带通 = 两个不同时间常数的一阶
// 低通之差；放大后加回原值。约定 luma 归一化到 0..255。
'use strict';

/** 一阶低通时间序列（按帧序），返回同样长度的数组 */
function lowpass(series, alpha) {
  const out = new Float32Array(series.length);
  let acc = series[0] ?? 0;
  for (let i = 0; i < series.length; i++) {
    acc += alpha * (series[i] - acc);
    out[i] = acc;
  }
  return out;
}

/**
 * 放大单像素时序。
 * frames: 每帧 Float32Array(W*H)（原始亮度）
 * 返回新帧数组：orig + gain * band，band = lowSlow - lowFast。
 * alphaFast/alphaSlow ∈ (0,1]：小=更平滑（响应更低频）。
 */
function magnifyPixel(series, { gain, alphaFast = 0.6, alphaSlow = 0.1 }) {
  const slow = lowpass(series, alphaSlow);
  const fast = lowpass(series, alphaFast);
  const out = new Float32Array(series.length);
  for (let i = 0; i < series.length; i++) out[i] = series[i] + gain * (slow[i] - fast[i]);
  return out;
}

/** 整组帧放大：frames 按帧序，共享宽高；逐像素独立处理（返回拷贝，不改输入） */
function magnify(frames, W, H, opts) {
  const N = frames.length;
  if (N === 0 || frames[0].length !== W * H) throw Error('帧序列尺寸不符');
  const out = Array.from({ length: N }, () => new Float32Array(W * H));
  for (let p = 0; p < W * H; p++) {
    const series = new Float32Array(N);
    for (let f = 0; f < N; f++) series[f] = frames[f][p];
    const amp = magnifyPixel(series, opts);
    for (let f = 0; f < N; f++) out[f][p] = amp[f];
  }
  return out;
}

/** 频带-时间常数换算：目标周期 T 帧的一阶低通等效 alpha ≈ 1 - exp(-2π/T)（截断等效） */
function alphaForCyclePeriod(T) {
  return Math.min(1, Math.max(0.01, 1 - Math.exp(-(2 * Math.PI) / Math.max(1, T))));
}

module.exports = { lowpass, magnifyPixel, magnify, alphaForCyclePeriod };
