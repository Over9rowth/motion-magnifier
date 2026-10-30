// Copyright (C) 2026 Over9rowth
// SPDX-License-Identifier: GPL-3.0-only
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';

let win: BrowserWindow | null = null;
const smoke = process.argv.includes('--smoke');

// Squirrel 安装/卸载钩子：快捷方式由应用自己创建与删除
function squirrelShortcuts(create: boolean) {
  const target = process.execPath;
  const links = [
    path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', '微动放大镜.lnk'),
    path.join(process.env.USERPROFILE || '', 'Desktop', '微动放大镜.lnk'),
  ];
  for (const lnk of links) {
    try {
      if (create) shell.writeShortcutLink(lnk, 'create', { target, description: '把视频里看不见的微小运动放大到看得见' });
      else if (fsSync.existsSync(lnk)) fsSync.unlinkSync(lnk);
    } catch { /* 单个快捷方式失败不阻断 */ }
  }
}

const squirrelArg = process.argv[1];
if (squirrelArg === '--squirrel-install' || squirrelArg === '--squirrel-updated') {
  squirrelShortcuts(true);
  app.quit();
} else if (squirrelArg === '--squirrel-uninstall') {
  squirrelShortcuts(false);
  app.quit();
}

function senderCheck(e: { sender: Electron.WebContents; senderFrame: Electron.WebFrameMain | null }) {
  if (!win || e.sender !== win.webContents || e.senderFrame !== win.webContents.mainFrame) throw Error('拒绝未知窗口');
}

async function htmlToPdf(html: string): Promise<Buffer> {
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await new Promise((r) => setTimeout(r, 400));
    return await w.webContents.printToPDF({ preferCSSPageSize: true, printBackground: true });
  } finally {
    w.destroy();
  }
}

async function saveBinary(e: unknown, dataUrl: unknown, defaultName: string): Promise<{ path: string; bytes: number } | null> {
  senderCheck(e as never);
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:video/webm;base64,')) throw Error('视频数据无效（仅支持 WebM）');
  const r = await dialog.showSaveDialog(win!, { defaultPath: defaultName, filters: [{ name: 'WebM 视频', extensions: ['webm'] }] });
  if (r.canceled || !r.filePath) return null;
  const buf = Buffer.from(dataUrl.slice('data:video/webm;base64,'.length), 'base64');
  await fs.writeFile(r.filePath, buf);
  return { path: r.filePath, bytes: buf.length };
}

app.whenReady().then(async () => {
  if (!smoke) {
    ipcMain.handle('save-webm', (e, dataUrl: unknown, name: unknown) =>
      saveBinary(e, dataUrl, typeof name === 'string' && name ? name : '微动放大-结果.webm'));

    ipcMain.handle('export-manual-pdf', async (e) => {
      senderCheck(e);
      const html = await fs.readFile(path.join(__dirname, '../manual.html'), 'utf8');
      const r = await dialog.showSaveDialog(win!, {
        defaultPath: '微动放大镜-说明书.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (r.canceled || !r.filePath) return null;
      const pdf = await htmlToPdf(html);
      await fs.writeFile(r.filePath, pdf);
      return { path: r.filePath, bytes: pdf.length };
    });
  } else {
    const os = await import('node:os');
    const targets = {
      webm: path.join(os.tmpdir(), `motionmagnifier-smoke-${Date.now()}.webm`),
      manual: path.join(os.tmpdir(), `motionmagnifier-smoke-manual-${Date.now()}.pdf`),
    };
    ipcMain.handle('save-webm', async (e, dataUrl: unknown) => {
      senderCheck(e);
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:video/webm;base64,')) throw Error('视频数据无效');
      const buf = Buffer.from(dataUrl.slice('data:video/webm;base64,'.length), 'base64');
      await fs.writeFile(targets.webm, buf);
      return { path: targets.webm, bytes: buf.length };
    });
    ipcMain.handle('export-manual-pdf', async (e) => {
      senderCheck(e);
      const html = await fs.readFile(path.join(__dirname, '../manual.html'), 'utf8');
      const pdf = await htmlToPdf(html);
      await fs.writeFile(targets.manual, pdf);
      return { path: targets.manual, bytes: pdf.length };
    });

    ipcMain.on('smoke-ready', (e, payload) => {
      try {
        senderCheck(e);
        console.log('[smoke] renderer ready, mounted=' + payload.mounted + ' engineOk=' + payload.engineOk);
        if (!payload.mounted || !payload.engineOk) { app.exit(1); return; }
        win!.webContents.send('smoke:run');
      } catch { app.exit(1); }
    });
    ipcMain.handle('smoke:result', async (e, payload) => {
      try { senderCheck(e); } catch { app.exit(1); return; }
      try {
        const r = typeof payload === 'string' ? JSON.parse(payload) : payload;
        if (r.error) throw Error('渲染进程报告: ' + r.error);
        const buf = await fs.readFile(targets.webm);
        if (buf.length < 1000 || !(buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3))
          throw Error('导出文件不是 WebM（EBML 头校验失败）');
        console.log(`[smoke] webm ok: ${targets.webm} (${buf.length} 字节, EBML 头通过)`);
        const pdf = await fs.readFile(targets.manual);
        if (!(pdf[0] === 0x25 && pdf[1] === 0x50)) throw Error('说明书 PDF 头校验失败');
        console.log(`[smoke] manual PDF ok: ${targets.manual} (${pdf.length} 字节)`);
        console.log('SMOKE PASS');
        app.exit(0);
      } catch (err) {
        console.log('[smoke] FAIL: ' + String((err as Error).message ?? err));
        app.exit(1);
      }
    });
    setTimeout(() => { console.log('[smoke] 超时未收到渲染进程就绪'); app.exit(1); }, 120_000);
  }

  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    // 冒烟也显示窗口：隐藏窗口的画布采集会被合成器节流（实测 captureStream 产不出帧）
    show: true,
    useContentSize: true,
    backgroundColor: '#faf7f2',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  await win.loadFile(path.join(__dirname, '../renderer/index.html'), smoke ? { query: { smoke: '1' } } : undefined);
});

app.on('window-all-closed', () => app.quit());
