'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { buildWebM } = require('../src/domain/webm.cjs');

function fakeFrame(tsMs, size = 50) {
  return { data: new Uint8Array(size).fill(0xab), timestampMs: tsMs };
}

test('文件头：EBML 魔数 + DocType webm + VP8 CodecID', () => {
  const out = buildWebM({ width: 160, height: 120, fps: 30, frames: [fakeFrame(0), fakeFrame(33)] });
  assert.deepEqual([...out.slice(0, 4)], [0x1a, 0x45, 0xdf, 0xa3]);
  const text = Buffer.from(out).toString('latin1');
  assert.ok(text.includes('webm'), '应包含 DocType webm');
  assert.ok(text.includes('V_VP8'), '应包含 CodecID V_VP8');
});

test('SimpleBlock 数量与帧数一致（遍历 Cluster）', () => {
  const N = 7;
  const out = buildWebM({ width: 160, height: 120, fps: 30, frames: Array.from({ length: N }, (_, i) => fakeFrame(i * 33)) });
  const bytes = Buffer.from(out);
  const vintLen = (b) => { let l = 1; while (!(b & (1 << (8 - l))) && l < 8) l++; return l; };
  const readSize = (buf, p) => {
    const l = vintLen(buf[p]);
    let v = buf[p] & (0xff >> l);
    for (let i = 1; i < l; i++) v = v * 256 + buf[p + i];
    return [v, p + l];
  };
  const clusterIdPos = bytes.indexOf(Buffer.from([0x1f, 0x43, 0xb6, 0x75]));
  assert.ok(clusterIdPos > 0, '应存在 Cluster');
  let p = clusterIdPos + 4;
  const [clusterLen, after] = readSize(bytes, p);
  p = after;
  const end = p + clusterLen;
  let blocks = 0;
  while (p < end) {
    const id = bytes[p]; p += 1; // Cluster 内子元素 ID（0xE7/0xA3）均为 1 字节
    const [len, next] = readSize(bytes, p);
    p = next;
    if (id === 0xa3) blocks++;
    p += len;
  }
  assert.equal(blocks, N);
  assert.equal(p, end, 'Cluster 长度应恰好闭合');
});

test('帧数据完整写入（SimpleBlock 载荷 = 4 字节头 + 帧数据）', () => {
  const payload = new Uint8Array(1000).fill(0xcd);
  const out = buildWebM({ width: 160, height: 120, fps: 30, frames: [fakeFrame(0, 0), { data: payload, timestampMs: 0 }] });
  const found = Buffer.from(out).indexOf(Buffer.alloc(1000, 0xcd));
  assert.ok(found > 0, '帧载荷应原样写入');
});

test('参数不完整抛错；时间码越界抛错', () => {
  assert.throws(() => buildWebM({ width: 160, height: 120, fps: 30, frames: [] }));
  assert.throws(() => buildWebM({ width: 160, height: 120, fps: 30, frames: [fakeFrame(40000)] }));
});

test('反向对照：故意写错一个 size 字段会让闭合校验失败', () => {
  const out = buildWebM({ width: 160, height: 120, fps: 30, frames: [fakeFrame(0), fakeFrame(33)] });
  const bytes = Buffer.from(out);
  const clusterIdPos = bytes.indexOf(Buffer.from([0x1f, 0x43, 0xb6, 0x75]));
  // 篡改 Cluster size 字段为实际+1
  bytes[clusterIdPos + 4] = (bytes[clusterIdPos + 4] & 0x80) | ((bytes[clusterIdPos + 4] & 0x7f) + 1);
  const p0 = clusterIdPos + 5;
  const len = bytes[clusterIdPos + 4] & 0x7f;
  // 按被篡改的长度闭合时，最后元素必然越界或读不满 → 手动模拟校验
  let p = p0, blocks = 0, over = false;
  const end = p0 + len;
  while (p < end) {
    if (p + 2 > bytes.length) { over = true; break; }
    const id = bytes[p]; p += 1;
    const sb = bytes[p]; p += 1;
    const l = sb & 0x7f;
    p += l;
    if (id === 0xa3) blocks++;
  }
  assert.ok(over || blocks !== 2, '被篡改的容器必须无法闭合（否则校验无意义）');
});
