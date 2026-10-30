// Copyright (C) 2026 Over9rowth
// SPDX-License-Identifier: GPL-3.0-only
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { magnify, alphaForCyclePeriod } from '../domain/magnify.cjs';
import { buildWebM } from '../domain/webm.cjs';

declare global {
  interface Window {
    magnifier: {
      saveWebm: (dataUrl: string, name?: string) => Promise<{ path: string; bytes: number } | null>;
      exportManualPdf: () => Promise<{ path: string; bytes: number } | null>;
      smokeReady: (p: { mounted: boolean; engineOk: boolean }) => void;
      onSmokeRun: (cb: () => void) => void;
      smokeResult: (payload: string) => void;
    };
  }
}
const api = (window as any).magnifier as Window['magnifier'];

const EXTRACT_W = 160, EXTRACT_H = 120, FPS = 30, MAX_SECONDS = 15;

interface Clip { frames: Float32Array[]; colors: ImageData[]; W: number; H: number; }

async function extractFrames(src: string, onProgress: (p: number) => void): Promise<Clip> {
  const video = document.createElement('video');
  video.src = src; video.muted = true; video.playsInline = true;
    await new Promise<void>((res, rej) => {
      video.onloadedmetadata = () => res();
      video.onerror = () => rej(Error(`视频无法解码（支持 MP4/WebM）blob=${src.length}字节 MediaError=${(video.error as MediaError | null)?.code}`));
    });
  let duration = video.duration;
  console.log('[smoke] duration0=', duration);
  // MediaRecorder 产物时长为 Infinity：先 seek 到极大值逼出真实时长，再归零
  if (!isFinite(duration)) {
    await new Promise<void>((res) => { video.onseeked = () => res(); video.currentTime = 1e7; });
    duration = video.duration;
    console.log('[smoke] duration1=', duration);
    await new Promise<void>((res) => { video.onseeked = () => res(); video.currentTime = 0; });
  }
  duration = Math.min(duration, MAX_SECONDS);
  if (!isFinite(duration) || duration < 0.5) throw Error('视频太短或读不到时长');
  const W = EXTRACT_W, H = EXTRACT_H;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  const total = Math.max(2, Math.floor(duration * FPS));
  const frames: Float32Array[] = [], colors: ImageData[] = [];
  for (let i = 0; i < total; i++) {
    await new Promise<void>((res) => {
      video.onseeked = () => res();
      video.currentTime = Math.min(duration - 0.001, i / FPS);
    });
    g.drawImage(video, 0, 0, W, H);
    const im = g.getImageData(0, 0, W, H);
    colors.push(im);
    const luma = new Float32Array(W * H);
    for (let p = 0; p < W * H; p++) luma[p] = 0.299 * im.data[p * 4] + 0.587 * im.data[p * 4 + 1] + 0.114 * im.data[p * 4 + 2];
    frames.push(luma);
    onProgress(i / total);
  }
  return { frames, colors, W, H };
}

function toImageData(orig: ImageData, ampLuma: Float32Array, origLuma: Float32Array): ImageData {
  const out = new ImageData(new Uint8ClampedArray(orig.data), orig.width, orig.height);
  for (let p = 0; p < origLuma.length; p++) {
    const diff = ampLuma[p] - origLuma[p];
    out.data[p * 4] = Math.max(0, Math.min(255, out.data[p * 4] + diff));
    out.data[p * 4 + 1] = Math.max(0, Math.min(255, out.data[p * 4 + 1] + diff));
    out.data[p * 4 + 2] = Math.max(0, Math.min(255, out.data[p * 4 + 2] + diff));
  }
  return out;
}

/** WebCodecs 编码签名改为返回编码帧列表，复用器在调用侧选择变体 */
async function encodeFrames(imageDatas: ImageData[], fps: number): Promise<{ W: number; H: number; frames: { data: Uint8Array; timestampMs: number }[] }> {
  const W = imageDatas[0].width, H = imageDatas[0].height;
  if (!('VideoEncoder' in window)) throw Error('此环境缺少 WebCodecs 视频编码器，无法导出');
  const support = await VideoEncoder.isConfigSupported({ codec: 'vp8', width: W, height: H, bitrate: 2_000_000, framerate: fps });
  if (!support?.supported) throw Error('此环境不支持 VP8 软件编码');
  const off = document.createElement('canvas'); off.width = W; off.height = H;
  const og = off.getContext('2d')!;
  const frames: { data: Uint8Array; timestampMs: number }[] = [];
  let encError: Error | null = null;
  const enc = new VideoEncoder({
    output: (chunk) => {
      const buf = new Uint8Array(chunk.byteLength);
      chunk.copyTo(buf);
      frames.push({ data: buf, timestampMs: Math.round(chunk.timestamp / 1000) });
    },
    error: (e) => { encError = new Error('编码器错误: ' + e.message); },
  });
  enc.configure({ codec: 'vp8', width: W, height: H, bitrate: 2_000_000, framerate: fps });
  for (let i = 0; i < imageDatas.length; i++) {
    og.putImageData(imageDatas[i], 0, 0);
    const vf = new VideoFrame(off, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
    enc.encode(vf, { keyFrame: true }); // 全关键帧：配合最简 WebM 结构
    vf.close();
    if (enc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 20));
  }
  await enc.flush();
  enc.close();
  if (encError) throw encError;
  if (frames.length !== imageDatas.length) throw Error(`编码帧数不符（${frames.length}/${imageDatas.length}）`);
  return { W, H, frames };
}

function engineOk(): boolean {
  const frames = Array.from({ length: 12 }, (_, f) => new Float32Array(64).fill(100 + (f % 2 ? 2 : 0)));
  const out = magnify(frames, 8, 8, { gain: 10, alphaFast: alphaForCyclePeriod(3), alphaSlow: alphaForCyclePeriod(12) });
  // 第 0 帧带通恒为 0，检查后续帧的放大差值
  return out.some((fr, i) => i > 0 && Math.abs(fr[0] - frames[i][0]) > 1);
}

function App() {
  const [step, setStep] = useState(1);
  const [clip, setClip] = useState<Clip | null>(null);
  const [band, setBand] = useState(12);      // 运动快慢：目标运动周期（帧）
  const [gain, setGain] = useState(12);
  const [status, setStatus] = useState('把一段固定机位的小视频拖进来');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const beforeRef = useRef<HTMLCanvasElement | null>(null);
  const afterRef = useRef<HTMLCanvasElement | null>(null);

  const opts = useMemo(() => ({
    gain,
    alphaFast: alphaForCyclePeriod(Math.max(2, band * 0.35)),
    alphaSlow: alphaForCyclePeriod(band * 2.2),
  }), [gain, band]);

  const drawCompare = useCallback(() => {
    if (!clip || !beforeRef.current || !afterRef.current) return;
    const { frames, colors, W, H } = clip;
    const amp = magnify(frames, W, H, opts);
    const b = beforeRef.current.getContext('2d')!, a = afterRef.current.getContext('2d')!;
    b.putImageData(colors[Math.floor(colors.length / 2)], 0, 0);
    const mid = Math.floor(frames.length / 2);
    a.putImageData(toImageData(colors[mid], amp[mid], frames[mid]), 0, 0);
  }, [clip, opts]);

  useEffect(() => { if (step === 2 && clip) drawCompare(); }, [step, clip, drawCompare]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setBusy(true); setStatus('正在抽帧分析…');
    try {
      const url = URL.createObjectURL(f);
      const c = await extractFrames(url, (p) => setProgress(Math.round(p * 100)));
      setSourceUrl(url); setClip(c); setStep(2);
      setStatus(`分析完成：${c.frames.length} 帧（约 ${(c.frames.length / FPS).toFixed(1)} 秒，按 ${FPS}fps 抽帧，工作分辨率 ${c.W}×${c.H}）`);
    } catch (err) { setStatus('出错了：' + String((err as Error).message ?? err)); }
    setBusy(false);
  }

  async function onExport() {
    if (!clip) return;
    setBusy(true); setStatus('正在逐帧处理并录制导出（实时耗时，约 ' + (clip.frames.length / FPS).toFixed(1) + ' 秒）…');
    try {
      const { frames, colors, W, H } = clip;
      const amp = magnify(frames, W, H, opts);
      const outs = colors.map((c, i) => toImageData(c, amp[i], frames[i]));
      const encd = await encodeFrames(outs, FPS);
      const dataUrl = await muxToBase64(encd.W, encd.H, FPS, encd.frames);
      const r = await api.saveWebm(dataUrl, '微动放大-结果.webm');
      setStatus(r ? `已保存：${r.path}（${r.bytes.toLocaleString()} 字节）` : '已取消');
    } catch (err) { setStatus('出错了：' + String((err as Error).message ?? err)); }
    setBusy(false);
  }

  async function onManual() {
    setBusy(true);
    try { const r = await api.exportManualPdf(); setStatus(r ? `说明书已保存：${r.path}` : '已取消'); }
    catch (err) { setStatus('出错了：' + String((err as Error).message ?? err)); }
    setBusy(false);
  }

function muxToDataUrl(W: number, H: number, fps: number, frames: { data: Uint8Array; timestampMs: number }[], muxOpts: Record<string, boolean> = {}): string {
  const bytes = buildWebM({ width: W, height: H, fps, frames, ...muxOpts });
  const blob = new Blob([bytes], { type: 'video/webm' });
  return URL.createObjectURL(blob);
}

async function muxToBase64(W: number, H: number, fps: number, frames: { data: Uint8Array; timestampMs: number }[], muxOpts: Record<string, boolean> = {}): Promise<string> {
  const bytes = buildWebM({ width: W, height: H, fps, frames, ...muxOpts });
  const blob = new Blob([bytes], { type: 'video/webm' });
  return await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob); });
}

function tryDecode(url: string): Promise<boolean> {
  return new Promise((res) => {
    const v = document.createElement('video');
    v.muted = true; v.preload = 'auto';
    const timer = setTimeout(() => res(false), 2500);
    v.onloadedmetadata = () => { clearTimeout(timer); res(v.videoWidth > 0); };
    v.onerror = () => { clearTimeout(timer); res(false); };
    v.src = url;
  });
}

  /** 冒烟：合成微动帧 → WebCodecs 编码 + 内置复用器 → 解码回环 → 放大 → 导出 → 说明书 */
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
  }

  useEffect(() => {
    if (!api.onSmokeRun) return;
    api.onSmokeRun(() => { smokeFlow().catch((err) => api.smokeResult(JSON.stringify({ error: String(err?.stack ?? err) }))); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="app">
      <header>
        <span className="logo">🔍</span>
        <div>
          <h1>微动放大镜</h1>
          <div className="sub">把视频里看不见的微小运动放大到看得见（固定机位小视频）</div>
        </div>
        <div className="spacer" />
        <button className="link" onClick={onManual} disabled={busy}>📄 图文说明书（PDF）</button>
      </header>

      <div className="steps">
        {['导入视频', '调节放大', '导出结果'].map((t, i) => (
          <div key={t} className={`step ${step === i + 1 ? 'active' : ''} ${step > i + 1 ? 'done' : ''}`}>
            <span className="n">{step > i + 1 ? '✓' : i + 1}</span>{t}
          </div>
        ))}
      </div>

      <main>
        <div className="panel">
          {step === 1 && <>
            <h2>第一步：导入一段小视频</h2>
            <p className="hint">固定手机或相机拍一段（≤15 秒）：音箱振动、吊灯轻晃、蜡烛火苗……软件按 30fps 抽帧、宽 160px 工作分辨率分析。</p>
            <div className="import-row">
              <label className="btn">选择视频文件<input type="file" accept="video/mp4,video/webm" onChange={onFile} /></label>
              {busy && <span>{progress}%</span>}
            </div>
          </>}

          {step === 2 && <>
            <h2>第二步：把微动调到看得见</h2>
            <p className="hint">右边是同一帧的"原图 vs 放大后"对比。两个滑块实时生效。</p>
            <div className="opt">运动快慢：{band <= 8 ? '快（振动、火苗）' : band <= 16 ? '中（树叶、窗帘）' : '慢（吊灯、呼吸起伏）'}（周期 {band} 帧）<input type="range" min="4" max="26" value={band} onChange={(e) => setBand(+e.target.value)} /></div>
            <div className="opt">放大倍数：×{gain}<input type="range" min="2" max="50" value={gain} onChange={(e) => setGain(+e.target.value)} /></div>
            <p className="hint">倍数太大画面会"发光发虚"——调到刚好能看清就停手。</p>
            <div className="nextrow">
              <button className="btn ghost" onClick={() => setStep(1)}>← 换一段视频</button>
              <button className="btn" onClick={() => setStep(3)}>下一步：导出 →</button>
            </div>
          </>}

          {step === 3 && <>
            <h2>第三步：导出</h2>
            <p className="hint">导出为 WebM 视频（浏览器实时录制，耗时约等于片段时长）。</p>
            <div className="bigbtns">
              <button className="btn big" onClick={onExport} disabled={busy}>🎥 导出放大后的视频（WebM）</button>
              <button className="btn ghost" onClick={onManual} disabled={busy}>📄 导出图文说明书（PDF）</button>
            </div>
            <div className="nextrow">
              <button className="btn ghost" onClick={() => setStep(2)}>← 上一步</button>
              <span />
            </div>
          </>}
        </div>

        <div className="preview-wrap">
          <div className="preview-card"><div className="t"><span>原图（当前帧）</span></div><canvas ref={beforeRef} width={160} height={120} style={{ imageRendering: 'pixelated' }} /></div>
          <div className="preview-card"><div className="t"><span>放大后（当前帧）</span><span>×{gain}</span></div><canvas ref={afterRef} width={160} height={120} style={{ imageRendering: 'pixelated' }} /></div>
        </div>
      </main>

      <div className="statusline">{status}{busy ? ' …' : ''}</div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
window.addEventListener('load', () => {
  if (new URLSearchParams(location.search).get('smoke') === '1') {
    setTimeout(() => {
      try { api.smokeReady({ mounted: !!document.getElementById('root')?.children.length, engineOk: engineOk() }); }
      catch { /* 非冒烟环境 */ }
    }, 300);
  }
});
