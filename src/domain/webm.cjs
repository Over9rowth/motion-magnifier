// Copyright (C) 2026 Over9rowth
// SPDX-License-Identifier: GPL-3.0-only
// 最小 WebM (EBML) 复用器：VP8 全关键帧、单 Track、单 Cluster。
// 纯函数、node 可测。设计约束：输出可被浏览器 <video> 直接解码（冒烟里以解码回环验证）。
// 简化边界：仅支持单视频轨、帧时间戳等距、总时长 ≤ 65 秒（SimpleBlock 时间码 int16 毫秒）。
'use strict';

function idBytes(id) {
  // EBML ID：按首字节前导零确定长度
  if (id >>> 24) return [(id >>> 24) & 0xff, (id >>> 16) & 0xff, (id >>> 8) & 0xff, id & 0xff];
  if (id >>> 16) return [(id >>> 16) & 0xff, (id >>> 8) & 0xff, id & 0xff];
  if (id >>> 8) return [(id >>> 8) & 0xff, id & 0xff];
  return [id & 0xff];
}

function sizeBytes(n) {
  // EBML Size VINT：首字节高位标记长度
  if (n < 127) return [0x80 | n];
  if (n < 16383) return [0x40 | (n >> 8), n & 0xff];
  if (n < (1 << 21) - 1) return [0x20 | (n >> 16), (n >> 8) & 0xff, n & 0xff];
  if (n < (1 << 28) - 1) return [0x10 | (n >>> 24), (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
  throw Error('element too large for 4-byte size: ' + n);
}

function element(id, data) {
  const i = idBytes(id);
  const s = sizeBytes(data.length);
  const out = new Uint8Array(i.length + s.length + data.length);
  out.set(i, 0); out.set(s, i.length); out.set(data, i.length + s.length);
  return out;
}

function uintEl(id, value) {
  if (value === 0) return element(id, [0]);
  const b = [];
  let v = value;
  while (v > 0) { b.unshift(v & 0xff); v = Math.floor(v / 256); }
  return element(id, b);
}

function floatEl(id, value) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setFloat32(0, value);
  return element(id, b);
}

function strEl(id, s) {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return element(id, b);
}

function int16Bytes(n) {
  return [(n >> 8) & 0xff, n & 0xff];
}

/**
 * 构建 WebM 文件。
 * @param opts {width, height, fps, frames: [{data: Uint8Array, timestampMs: number}]}
 *   帧按时间戳升序；全部按关键帧写（VP8 全关键帧，文件偏大但结构最简）。
 */
/**
 * 构建 WebM 文件。
 * @param opts {width, height, fps, frames, noDuration?, omitInfo?, docTypeV4?, unknownSegment?}
 *   frames 帧按时间戳升序；全部按关键帧写（VP8 全关键帧，文件偏大但结构最简）。
 *   变体开关仅供容器格式排查实验使用。
 */
function buildWebM(opts) {
  const { width, height, fps, frames } = opts;
  if (!width || !height || !fps || !Array.isArray(frames) || !frames.length)
    throw Error('buildWebM 参数不完整');
  const totalMs = Math.round(frames[frames.length - 1].timestampMs + 1000 / fps);

  const headerChildren = [
    uintEl(0x4286, 1),   // EBMLVersion
    uintEl(0x42F7, 1),   // EBMLReadVersion
    uintEl(0x42F2, 4),   // EBMLMaxIDLength
    uintEl(0x42F3, 8),   // EBMLMaxSizeLength
    strEl(0x4282, 'webm'), // DocType
    uintEl(0x4287, opts.docTypeV4 ? 4 : 2),   // DocTypeVersion
    uintEl(0x4285, opts.docTypeV4 ? 4 : 2),   // DocTypeReadVersion
  ];
  const ebml = element(0x1A45DFA3, concat(headerChildren));

  const infoChildren = [uintEl(0x2AD7B1, 1000000)]; // TimecodeScale: 1ms
  if (!opts.noDuration) infoChildren.push(floatEl(0x4489, totalMs));
  infoChildren.push(strEl(0x4D80, 'shadow-tools'));
  infoChildren.push(strEl(0x5741, 'shadow-tools'));
  const info = element(0x1549A966, concat(infoChildren));

  const trackEntry = element(0xAE, concat([
    uintEl(0xD7, 1),            // TrackNumber
    uintEl(0x73C5, 1),          // TrackUID
    uintEl(0x83, 1),            // TrackType: video
    strEl(0x86, 'V_VP8'),       // CodecID
    element(0xE0, concat([uintEl(0xB0, width), uintEl(0xBA, height)])), // Video: PixelWidth/Height
  ]));
  const tracks = element(0x1654AE6B, trackEntry);

  const blocks = [];
  for (const f of frames) {
    const tc = Math.round(f.timestampMs);
    if (tc < 0 || tc > 32767) throw Error('帧时间码超出 int16 毫秒范围');
    const head = [0x81, ...int16Bytes(tc), 0x80]; // track=1, 相对时间码, 关键帧标志
    blocks.push(element(0xA3, concat([new Uint8Array(head), f.data])));
  }
  const cluster = element(0x1F43B675, concat([uintEl(0xE7, 0), ...blocks]));

  const segmentContent = concat([opts.omitInfo ? new Uint8Array(0) : info, tracks, cluster]);
  if (opts.unknownSegment) {
    const segId = idBytes(0x18538067);
    const unknown = [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
    return concat([ebml, new Uint8Array(segId), new Uint8Array(unknown), segmentContent]);
  }
  return concat([ebml, element(0x18538067, segmentContent)]);
}

function concat(arrs) {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

module.exports = { buildWebM };
