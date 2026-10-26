"""Laptop Resource Monitor - local-only dashboard and safe manual controls.
Python 3.11 + psutil. Binds 127.0.0.1 only. No remote management endpoint.
"""
import csv, ctypes, datetime as dt, json, os, pathlib, re, secrets, subprocess, sys, threading, time, urllib.parse, urllib.request, html, winreg
from collections import Counter, defaultdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import psutil

ROOT = pathlib.Path(__file__).resolve().parent
RESOURCE_ROOT = pathlib.Path(getattr(sys, "_MEIPASS", ROOT))
WEB = RESOURCE_ROOT / "web"
DATA_DIR = pathlib.Path(os.getenv("LOCALAPPDATA", str(pathlib.Path.home()))) / "LaptopResourceMonitor"
LOGS = DATA_DIR / "Logs"
LOGS.mkdir(parents=True, exist_ok=True)
def configured_port():
    try:
        i = sys.argv.index("--port")
        value = int(sys.argv[i + 1])
        if not 1024 <= value <= 65535: raise ValueError("port outside allowed range")
        return value
    except ValueError as e:
        if "--port" in sys.argv: raise ValueError("Invalid --port setting") from e
        return 18767
    except IndexError as e:
        raise ValueError("A port number must follow --port") from e
PORT = configured_port()
BASE = "http://127.0.0.1:%d" % PORT
TOKEN = secrets.token_urlsafe(32)
PYTHON = pathlib.Path(sys.executable)
STARTUP = pathlib.Path(os.getenv("APPDATA","")) / "Microsoft/Windows/Start Menu/Programs/Startup"
LOCK = threading.RLock()
STATE = {}
GPU_AT = 0
GPU = {"temp":None,"usage":None,"used":None,"total":None}
HISTORY = []
STARTUP_AT = 0
STARTUP_ITEMS = []
PROTECTED_KEYWORDS = ("desktop-commander", "desktopcommander", "remote-access", "bridge",
 "medical", "health-monitor", "monitor.ps1", "resource-monitor", "codex",
 "pythonw.exe", "gateway", "antivirus")
ALLOW_NAMES = {"notepad.exe","notepad++.exe","mspaint.exe","calc.exe","vlc.exe",
               "spotify.exe","winword.exe","excel.exe","powerpnt.exe","chatgpt.exe","chrome.exe"}
SAFE_START_NAMES = ("btweb","MicrosoftEdgeAutoLaunch_")

def log(message):
    with (LOGS / "dashboard-actions.log").open("a",encoding="utf-8") as f:
        f.write("%s %s\n" % (dt.datetime.now().isoformat(timespec="seconds"),message))

# Optional voluntary support is processed ONLY on the official PayPal website.
# The public GitHub configuration lets us enable the button once a verified
# business-owned payment link exists, without a new downloadable EXE.
SUPPORT_CONFIG_URL = "https://raw.githubusercontent.com/Michael197669/Laptop-Resource-Monitor/main/donation.json"

def verified_paypal_url(candidate):
    if not isinstance(candidate, str) or len(candidate) > 500:
        return None
    try:
        p = urllib.parse.urlsplit(candidate.strip())
        if p.scheme.lower() != "https" or p.username or p.password or p.fragment:
            return None
        host=(p.hostname or "").lower()
        path=p.path.lower()
        if host in ("paypal.me", "www.paypal.me") and path.strip("/"):
            return candidate.strip()
        if host in ("www.paypal.com","paypal.com") and (
            path.startswith("/donate") or path.startswith("/ncp/payment/")
        ):
            return candidate.strip()
        return None
    except (ValueError,AttributeError):
        return None

def paypal_support_link():
    """Called only after a user clicks Support. No automatic external requests."""
    try:
        request=urllib.request.Request(SUPPORT_CONFIG_URL,headers={"User-Agent":"LaptopResourceMonitor/0.1"})
        with urllib.request.urlopen(request,timeout=5) as response:
            raw=response.read(4096)
        obj=json.loads(raw.decode("utf-8"))
        return verified_paypal_url(obj.get("paypal_url"))
    except (OSError,ValueError,UnicodeError,KeyError,TimeoutError):
        return None

def safe(proc_name, command):
    n=proc_name.lower()
    cmd=(command or "").lower()
    # Only a genuine main application may be safely terminated. Electron helpers are not.
    if n=="chatgpt.exe":
        return "Review" if "--type=" in cmd or "--utility-sub-type=" in cmd else "Safe"
    if n=="chrome.exe" and (BASE in cmd or "laptopresourcemonitor" in cmd or "laptop-resource-monitor" in cmd):
        return "Protected"
    if any(k in cmd for k in PROTECTED_KEYWORDS):return "Protected"
    if n not in ALLOW_NAMES: return "Protected" if any(n.startswith(k) for k in (
        "svchost","lsass","wininit","dwm","explorer","system","powershell","cmd","node","python","runtimebroker",
        "audiosrv","security","msmpeng","syncthing","asus","aura","ollama","wscript","conhost","searchhost",
        "microsoftedge","phoneexperience","winlogon")) else "Review"
    if "--type=" in cmd or "--utility-sub-type=" in cmd: return "Review"
    return "Safe"

def role(n, cmd, ppid=0):
    name=n.lower(); s=cmd.lower()
    if "desktop-commander" in s: return "Desktop Commander remote agent"
    if "nas-bridge" in s or "network-bridge" in s:return "Network bridge service"
    if "health-monitor" in s or "medical" in s:return "Health / medical service"
    if "monitor.ps1" in s or "dashboard.py" in s:return "Laptop Resource Monitor"
    if name=="chatgpt.exe":
        kind=re.search(r"--type=([\w-]+)",s)
        return "ChatGPT helper: "+kind.group(1) if kind else "ChatGPT MAIN application"
    if name=="chrome.exe":
        kind=re.search(r"--type=([\w-]+)",s)
        return "Chrome helper: "+kind.group(1) if kind else "Chrome MAIN application"
    if "codex" in s or "artifact-session" in s:return "Codex supporting service"
    if name.startswith("aura"):return "ASUS Aura"
    if name.startswith("asus") or "armoury" in name:return "ASUS hardware utility"
    if "ollama" in name:return "Ollama local AI"
    if "syncthing" in name:return "Syncthing file synchronization"
    if name=="msedgewebview2.exe":return "Microsoft WebView helper"
    if name in ("conhost.exe","runtimebroker.exe","svchost.exe"):return "Windows supporting service"
    return n[:-4] if n.endswith(".exe") else n

def group(n, cmd):
    n=n.lower(); s=cmd.lower()
    if n=="chatgpt.exe":return "ChatGPT"
    if n=="chrome.exe":return "Chrome"
    if "desktop-commander" in s:return "Desktop Commander"
    if "nas-bridge" in s or "network-bridge" in s:return "NAS Bridge"
    if "ollama" in n:return "Ollama"
    if n.startswith("aura."):return "ASUS Aura"
    return "Other Background"

def gpu_sample():
    global GPU,GPU_AT
    if time.time()-GPU_AT<20:return
    GPU_AT=time.time()
    try:
        p=subprocess.run(["nvidia-smi","--query-gpu=temperature.gpu,utilization.gpu,memory.used,memory.total",
         "--format=csv,noheader,nounits"],capture_output=True,text=True,timeout=4,creationflags=0x08000000)
        cells=[int(x.strip()) for x in p.stdout.strip().splitlines()[0].split(",")]
        GPU=dict(zip(("temp","usage","used","total"),cells))
    except Exception: pass

def startup_scan(force=False):
    global STARTUP_AT,STARTUP_ITEMS
    if not force and time.time()-STARTUP_AT<70:return STARTUP_ITEMS
    items=[]
    try:
        for p in STARTUP.iterdir():
            if p.name.lower()=="desktop.ini":continue
            label=p.stem
            items.append(dict(id="file:"+str(p),name=label,method="Startup folder",
             status="Enabled",command=str(p),safety="Protected" if "virtual pet" in label.lower() or "commander" in label.lower() else "Review"))
    except OSError:pass
    for hive,flag in ((winreg.HKEY_CURRENT_USER,"HKCU"),(winreg.HKEY_LOCAL_MACHINE,"HKLM")):
        keypath=r"Software\Microsoft\Windows\CurrentVersion\Run"
        try:
            with winreg.OpenKey(hive,keypath) as key:
                idx=0
                while True:
                    try: name,value,kind=winreg.EnumValue(key,idx);idx+=1
                    except OSError:break
                    is_safe=flag=="HKCU" and (name=="btweb" or name.startswith("MicrosoftEdgeAutoLaunch_"))
                    items.append(dict(id=flag+":"+name,name=name,method="Registry "+flag,
                      status="Enabled",command=str(value),safety="Safe" if is_safe else "Protected"))
        except OSError:pass
    # Scheduled tasks: one read-only inventory. Never change via UI.
    try:
        call=subprocess.run(["powershell.exe","-NoProfile","-Command",
          "Get-ScheduledTask | Where-Object {$_.TaskPath -eq '\\'} | Select-Object TaskName,State | ConvertTo-Json -Compress"],
          capture_output=True,text=True,timeout=9,creationflags=0x08000000)
        data=json.loads(call.stdout or "[]")
        if isinstance(data,dict):data=[data]
        for it in data:
            name=it.get("TaskName","")
            items.append(dict(id="task:"+name,name=name,method="Task Scheduler",
                   status="Disabled" if str(it.get("State","")).lower() in ("disabled","1") else "Enabled",
                   command="Scheduled task",safety="Protected"))
    except Exception:pass
    STARTUP_ITEMS=sorted(items,key=lambda a:a["name"].lower())
    STARTUP_AT=time.time()
    return STARTUP_ITEMS

def collect():
    gpu_sample()
    vm=psutil.virtual_memory()
    cpu=psutil.cpu_percent(interval=None)
    elements=[]
    group_mb=defaultdict(float)
    cores=Counter()
    for p in psutil.process_iter(["pid","ppid","name","memory_info","cpu_percent","create_time"]):
        try:
            info=p.info; name=info["name"] or ""
            try: cmdline=p.cmdline()
            except (psutil.AccessDenied,psutil.NoSuchProcess):cmdline=[]
            command=" ".join(cmdline)[:480]
            try: executable=p.exe()
            except (psutil.AccessDenied,psutil.NoSuchProcess): executable=""
            mem=round(info["memory_info"].rss/1048576,1) if info["memory_info"] else 0
            purpose=role(name,command,info["ppid"])
            risk=safe(name,command)
            bucket=group(name,command)
            group_mb[bucket]+=mem
            cores[bucket]+=1
            elements.append(dict(pid=info["pid"],ppid=info["ppid"],name=name,ram=mem,
                cpu=round(p.cpu_percent(interval=None),1),type="Helper" if "--type=" in command else "Main / service",
                role=purpose,command=command,exe=executable,safety=risk,bucket=bucket,
                create_time=round(info["create_time"] or 0,2)))
        except (psutil.AccessDenied,psutil.NoSuchProcess,psutil.ZombieProcess):continue
    elements.sort(key=lambda a:a["ram"],reverse=True)
    percent=round(vm.percent,1)
    HIST=dict(time=dt.datetime.now().strftime("%H:%M:%S"),value=percent)
    HISTORY.append(HIST)
    if len(HISTORY)>360:del HISTORY[:-360]
    ram_gb=round((vm.total-vm.available)/(1024**3),1)
    total_gb=round(vm.total/(1024**3),1)
    metric=dict(ram=percent,ram_used=ram_gb,ram_total=total_gb,ram_available=round(vm.available/1024**3,1),
        cpu=round(cpu,1),gpu_temp=GPU["temp"],gpu_load=GPU["usage"],gpu_vram=GPU["used"],
        gpu_total=GPU["total"],boot=dt.datetime.fromtimestamp(psutil.boot_time()).strftime("%I:%M %p"),
        uptime=int(time.time()-psutil.boot_time()))
    group_names=("ChatGPT","Chrome","Desktop Commander","NAS Bridge","Ollama","ASUS Aura","Other Background")
    groups=[dict(name=name,mb=round(group_mb[name]),count=cores[name]) for name in group_names]
    now=dt.datetime.now()
    with LOCK:
        STATE.update(dict(metrics=metric,groups=groups,processes=elements,history=HISTORY[-360:],
                          startup=startup_scan(),stamp=now.strftime("%I:%M:%S %p"),token=TOKEN))
    file=LOGS/("usage-"+now.strftime("%Y-%m-%d")+".csv")
    exists=file.exists()
    with file.open("a",encoding="utf-8",newline="") as f:
        writer=csv.writer(f)
        if not exists:writer.writerow(("Timestamp","RAMPercent","CPULoadPercent","GPUTempC","GPUUtilPercent",
                    "GPUVRAMMB","ChatGPT_MB","Chrome_MB","DesktopCommander_MB","NASBridge_MB",
                    "OtherNode_MB","Codex_MB","Ollama_MB","Aura_MB"))
        writer.writerow((now.isoformat(timespec="seconds"),percent,cpu,GPU["temp"] or "",GPU["usage"] or "",
         GPU["used"] or "",round(group_mb["ChatGPT"]),round(group_mb["Chrome"]),round(group_mb["Desktop Commander"]),
         round(group_mb["NAS Bridge"]),0,0,round(group_mb["Ollama"]),round(group_mb["ASUS Aura"])))

def monitor_loop():
    psutil.cpu_percent(interval=None)
    while True:
        try:collect()
        except Exception as e:log("SAMPLE ERROR "+str(e)[:200])
        time.sleep(10)

def kill_safe(body):
    pid=int(body.get("pid",0))
    created=float(body.get("create_time",0))
    if pid<=4 or pid==os.getpid():raise ValueError("Protected process")
    p=psutil.Process(pid)
    if abs(p.create_time()-created)>.02: raise ValueError("Process PID has changed")
    cmd=" ".join(p.cmdline())
    if safe(p.name(),cmd)!="Safe":raise ValueError("Only confirmed safe application processes can be ended")
    if p.name().lower() not in ALLOW_NAMES:raise ValueError("Not on allowlist")
    p.terminate()
    try:p.wait(timeout=3)
    except psutil.TimeoutExpired:raise ValueError("Process did not exit; not forcing termination")
    log("MANUAL KILL "+p.name()+" "+str(pid))
    return {"ok":True,"message":"Process ended"}

def reveal_safe(body):
    pid=int(body.get("pid",0))
    created=float(body.get("create_time",0))
    if pid<=4 or pid==os.getpid():raise ValueError("Protected process")
    p=psutil.Process(pid)
    if abs(p.create_time()-created)>.02:raise ValueError("Process identity changed")
    if safe(p.name()," ".join(p.cmdline()))!="Safe":raise ValueError("Protected process location")
    executable=p.exe()
    if not executable or not pathlib.Path(executable).is_file():
        raise ValueError("Executable location unavailable")
    subprocess.Popen(["explorer.exe","/select,",executable],creationflags=0x08000000)
    return {"ok":True,"message":"Opened verified file location"}

def disable_startup(body):
    ident=str(body.get("id",""))
    if not ident.startswith("HKCU:"):raise ValueError("Only approved user startup entries can be disabled")
    name=ident[5:]
    if not (name=="btweb" or name.startswith("MicrosoftEdgeAutoLaunch_")):raise ValueError("Protected startup entry")
    keypath=r"Software\Microsoft\Windows\CurrentVersion\Run"
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER,keypath,0,winreg.KEY_READ|winreg.KEY_SET_VALUE) as key:
        value,kind=winreg.QueryValueEx(key,name)
        backup=DATA_DIR/"Startup-Backups"/"Safe-Changes"
        backup.mkdir(parents=True,exist_ok=True)
        b=backup/("startup-"+dt.datetime.now().strftime("%Y%m%d-%H%M%S")+".json")
        b.write_text(json.dumps({"name":name,"value":value,"type":kind},indent=2),encoding="utf-8")
        winreg.DeleteValue(key,name)
    startup_scan(force=True)
    log("DISABLED STARTUP "+name)
    return {"ok":True,"message":"Optional startup disabled. Program remains installed."}

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*a):pass
    def headers_common(self,status=200,ctype="application/json; charset=utf-8"):
        self.send_response(status)
        self.send_header("Content-Type",ctype)
        self.send_header("Cache-Control","no-store")
        self.send_header("X-Content-Type-Options","nosniff")
        self.send_header("Referrer-Policy","no-referrer")
        self.send_header("Content-Security-Policy","default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'")
        self.end_headers()
    def do_GET(self):
        path=urllib.parse.urlsplit(self.path).path
        if path=="/support/paypal":
            link=paypal_support_link()
            if link:
                self.send_response(302)
                self.send_header("Location",link)
                self.send_header("Cache-Control","no-store")
                self.send_header("Referrer-Policy","no-referrer")
                self.send_header("X-Content-Type-Options","nosniff")
                self.end_headers()
            else:
                page=('<!doctype html><html lang="en"><meta charset="utf-8">'
                      '<title>Support Development</title>'
                      '<meta name="viewport" content="width=device-width,initial-scale=1">'
                      '<style>body{margin:0;background:#0c1727;color:#e7f4ff;'
                      'font:18px Segoe UI,Arial,sans-serif;display:grid;place-items:center;'
                      'min-height:95vh}main{padding:28px;border:1px solid #344a64;'
                      'background:#16263c;border-radius:13px;max-width:540px}'
                      'h1{font-size:27px}p{line-height:1.6;color:#bfcee1}'
                      'a{color:#86beff}</style><main><h1>Support development</h1>'
                      '<p>Thank you for considering a voluntary contribution. '
                      'The official PayPal payment link has not been configured '
                      'yet. No payment has been requested or collected.</p>'
                      '<p>The software remains free. '
                      '<a href="https://github.com/Michael197669/Laptop-Resource-Monitor">'
                      'Project updates</a></p></main></html>').encode("utf-8")
                self.headers_common(200,"text/html; charset=utf-8")
                self.wfile.write(page)
            return
        if path=="/api/state":
            with LOCK:out=json.dumps(STATE).encode("utf-8")
            self.headers_common();self.wfile.write(out);return
        if path in ("/","/index.html","/ui.css","/ui.js"):
            name="index.html" if path=="/" else path[1:]
            f=WEB/name
            if not f.exists():self.send_error(404);return
            mime="text/html; charset=utf-8" if name.endswith(".html") else "text/css; charset=utf-8" if name.endswith(".css") else "text/javascript; charset=utf-8"
            self.headers_common(200,mime);self.wfile.write(f.read_bytes());return
        self.send_error(404)
    def do_POST(self):
        if self.path not in ("/api/kill","/api/startup-disable","/api/reveal"):self.send_error(404);return
        if self.headers.get("Origin","")!=BASE or self.headers.get("Content-Type","")!="application/json":
            self.send_error(403);return
        length=int(self.headers.get("Content-Length","0"))
        if length<=0 or length>1024:self.send_error(413);return
        try:
            req=json.loads(self.rfile.read(length))
            if not secrets.compare_digest(str(req.get("token","")),TOKEN):raise ValueError("Access token mismatch")
            result=(kill_safe(req) if self.path=="/api/kill" else
                    reveal_safe(req) if self.path=="/api/reveal" else disable_startup(req))
            code=200
        except Exception as e:result={"ok":False,"message":str(e)[:200]};code=400
        self.headers_common(code);self.wfile.write(json.dumps(result).encode("utf-8"))

def tint_dashboard_chrome():
    """Use a dark title bar only on this dashboard window; no Windows theme changes."""
    try:
        user32=ctypes.windll.user32
        user32.FindWindowW.argtypes=[ctypes.c_wchar_p,ctypes.c_wchar_p]
        user32.FindWindowW.restype=ctypes.c_void_p
        dark=ctypes.c_int(1)
        for _ in range(35):
            hwnd=user32.FindWindowW(None,"Laptop Resource Monitor")
            if hwnd:
                ctypes.windll.dwmapi.DwmSetWindowAttribute(
                    ctypes.c_void_p(hwnd),ctypes.c_uint(20),
                    ctypes.byref(dark),ctypes.sizeof(dark))
                break
            time.sleep(.2)
    except Exception:
        pass

def show_app():
    chrome=r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    edge=r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
    browser=chrome if pathlib.Path(chrome).exists() else edge
    if pathlib.Path(browser).exists():
        subprocess.Popen([browser,"--app="+BASE,"--window-size=1536,816",
            "--force-device-scale-factor=1",
            "--user-data-dir="+str(DATA_DIR/"ChromeProfile"),
            "--no-first-run","--disable-sync","--no-default-browser-check","--disable-extensions"],
            stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=0x08000000)
        threading.Thread(target=tint_dashboard_chrome,daemon=True).start()
    else:
        import webbrowser
        webbrowser.open(BASE)

def main():
    mutex=ctypes.windll.kernel32.CreateMutexW(None,False,"Local\\DDSLaptopResourceMonitor_"+str(PORT))
    if ctypes.windll.kernel32.GetLastError()==183:
        if "--show" in sys.argv:show_app()
        return
    bg=threading.Thread(target=monitor_loop,daemon=True);bg.start()
    server=ThreadingHTTPServer(("127.0.0.1",PORT),Handler)
    server.daemon_threads=True
    if "--no-window" not in sys.argv:
        threading.Timer(2.5,show_app).start()
    try:server.serve_forever(poll_interval=.5)
    finally:
        server.server_close()
        ctypes.windll.kernel32.ReleaseMutex(mutex)
        ctypes.windll.kernel32.CloseHandle(mutex)

if __name__=="__main__":
    try:main()
    except Exception as e:log("FATAL "+repr(e));raise
