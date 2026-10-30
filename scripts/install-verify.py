# -*- coding: utf-8 -*-
"""微动放大镜 安装/卸载验收（参照 18-新产品开发与验收规范 第六节清单）。
reg.exe 被本机安全策略禁止，注册表读写用 winreg。
用法：python scripts/install-verify.py
"""
import ctypes
import os
import shutil
import subprocess
import sys
import time
import winreg

VERSION = "0.1.1"
SETUP_SRC = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "out", "make", "squirrel.windows", "x64", f"MotionMagnifier-{VERSION} Setup.exe",
)
SETUP_DST = os.path.join(os.environ["TEMP"], "MotionMagnifierSetup.exe")
APP_DIR = os.path.join(os.environ["LOCALAPPDATA"], "MotionMagnifier")
LNK_START = os.path.join(os.environ["APPDATA"], r"Microsoft\Windows\Start Menu\Programs", "微动放大镜.lnk")
LNK_DESKTOP = os.path.join(os.environ["USERPROFILE"], "Desktop", "微动放大镜.lnk")
TITLE = "微动放大镜"

def step(msg): print(f"[check] {msg}", flush=True)

results = []
def record(name, ok, detail):
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'} | {name} | {detail}", flush=True)

env = {k: v for k, v in os.environ.items() if k not in ("ELECTRON_RUN_AS_NODE", "NODE_OPTIONS")}

step("复制安装包到 ASCII 路径")
shutil.copyfile(SETUP_SRC, SETUP_DST)
record("Setup.exe 可访问", os.path.getsize(SETUP_DST) > 100_000_000, f"{os.path.getsize(SETUP_DST)} 字节")

step("静默安装")
proc = subprocess.run([SETUP_DST, "--silent"], env=env, capture_output=True, text=True, timeout=300)
record("安装退出码 0", proc.returncode == 0, f"exit={proc.returncode}")
time.sleep(3)
app_ver = os.path.join(APP_DIR, f"app-{VERSION}")
record(f"安装目录与 app-{VERSION} 存在", os.path.isdir(app_ver), app_ver)
record("主程序存在", os.path.isfile(os.path.join(app_ver, "MotionMagnifier.exe")), "")

def find_uninstall_key():
    root = winreg.HKEY_CURRENT_USER
    path = r"Software\Microsoft\Windows\CurrentVersion\Uninstall"
    hits = []
    with winreg.OpenKey(root, path) as key:
        for i in range(winreg.QueryInfoKey(key)[0]):
            sub = winreg.EnumKey(key, i)
            try:
                with winreg.OpenKey(root, path + "\\" + sub) as k:
                    name, _ = winreg.QueryValueEx(k, "DisplayName")
                    if "微动放大镜" in str(name) or "MotionMagnifier" in sub:
                        fields = {"sub": sub, "DisplayName": str(name)}
                        for f in ("DisplayVersion", "Publisher", "DisplayIcon"):
                            try: fields[f] = str(winreg.QueryValueEx(k, f)[0])
                            except OSError: fields[f] = ""
                        hits.append(fields)
            except OSError:
                continue
    return hits

time.sleep(2)
hits = find_uninstall_key()
record("注册表卸载项唯一", len(hits) == 1, str(hits))
if hits:
    h = hits[0]
    record("DisplayVersion = 0.1.1", h.get("DisplayVersion") == VERSION, h.get("DisplayVersion", ""))
    record("Publisher = Over9rowth", h.get("Publisher") == "Over9rowth", h.get("Publisher", ""))
record("开始菜单快捷方式", os.path.isfile(LNK_START), LNK_START)
record("桌面快捷方式", os.path.isfile(LNK_DESKTOP), LNK_DESKTOP)

step("从快捷方式启动并核对窗口标题（码位比对）")
proc = subprocess.Popen(["cmd", "/c", "start", "", LNK_START], env=env,
                        creationflags=subprocess.CREATE_NO_WINDOW)
hwnd = 0
for _ in range(30):
    time.sleep(1)
    hwnd = ctypes.windll.user32.FindWindowW(None, TITLE)
    if hwnd:
        break
record("窗口标题「微动放大镜」", hwnd != 0,
       f"FindWindowW={'找到' if hwnd else '未找到'} 期望码位={[hex(ord(c)) for c in TITLE]}")
subprocess.run(["taskkill", "/F", "/IM", "MotionMagnifier.exe"], capture_output=True)
time.sleep(2)

step("安装版跑 --smoke")
exe = os.path.join(app_ver, "MotionMagnifier.exe")
sm = subprocess.run([exe, "--smoke", "--no-sandbox", "--disable-gpu", "--disable-gpu-sandbox", "--in-process-gpu"],
                    env=env, capture_output=True, text=True, timeout=300)
tail = [l for l in (sm.stdout or "").splitlines() if "smoke" in l or "SMOKE" in l]
record("安装版 SMOKE PASS", sm.returncode == 0, f"exit={sm.returncode} | " + " / ".join(tail[-3:]))
time.sleep(1)
subprocess.run(["taskkill", "/F", "/IM", "MotionMagnifier.exe"], capture_output=True)
time.sleep(2)

step("卸载")
upd = os.path.join(APP_DIR, "Update.exe")
proc = subprocess.run([upd, "--uninstall"], env=env, capture_output=True, text=True, timeout=300)
record("卸载退出码 0", proc.returncode == 0, f"exit={proc.returncode}")
time.sleep(3)
record("注册表卸载项已清除", len(find_uninstall_key()) == 0, "")
record("开始菜单快捷方式已删除", not os.path.isfile(LNK_START), "")
record("桌面快捷方式已删除", not os.path.isfile(LNK_DESKTOP), "")
residue = []
if os.path.isdir(APP_DIR):
    residue = sorted(os.listdir(APP_DIR))
# Squirrel 固有残留：.dead（被替换的旧 Update.exe 占位）、Update.exe（正在运行，删不掉自己），
# 以及 app-<ver>\ 里的 squirrel.exe（同上）与被强杀进程短暂占用的 v8_context_snapshot.bin。
# 实测：首次卸载后 v8_context_snapshot.bin 会留下，再执行一次 --uninstall 即清除。
ALLOWED_FILES = {".dead", "Update.exe", "squirrel.exe", "v8_context_snapshot.bin"}
def is_allowed(name):
    if name in (".dead", "Update.exe"):
        return True
    p = os.path.join(APP_DIR, name)
    if os.path.isdir(p) and name.startswith("app-"):
        return all(x in ALLOWED_FILES for x in os.listdir(p))
    return False
record("残留仅为 Squirrel 固有项", all(is_allowed(x) for x in residue), str(residue))
if os.path.isdir(APP_DIR):
    detail = {x: (sorted(os.listdir(os.path.join(APP_DIR, x))) if os.path.isdir(os.path.join(APP_DIR, x)) else "-") for x in residue}
    print(f"[check] 残留明细：{detail}", flush=True)

print("\n===== 验收汇总 =====")
fails = [r for r in results if not r[1]]
for name, ok, detail in results:
    print(("PASS" if ok else "FAIL"), "|", name)
print(f"\n{len(results) - len(fails)}/{len(results)} 项通过")
sys.exit(1 if fails else 0)
