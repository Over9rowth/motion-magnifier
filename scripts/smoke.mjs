import { spawn } from 'node:child_process';
import path from 'node:path';
import electronPath from 'electron';

const root = path.resolve(import.meta.dirname, '..');
// --disable-gpu 等参数：本机（无显卡直通的会话）GPU 进程会崩
// （exit_code=-1073741819 → GPU process isn't usable. Goodbye.），
// 渲染进程一起挂，冒烟无法完成。只影响自动化，用户机运行时不带这些参数。
const args = ['.', '--smoke', '--no-sandbox', '--disable-gpu', '--disable-gpu-sandbox', '--in-process-gpu'];
const child = spawn(electronPath, args, {
  cwd: root,
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
  stdio: 'inherit',
});
child.on('exit', (code) => {
  if (code === 0) console.log('SMOKE PASS');
  process.exit(code ?? 1);
});
