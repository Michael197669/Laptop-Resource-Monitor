"""Safety regression tests; no real processes are terminated."""
import pathlib, sys, unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
import dashboard as monitor

class SafetyTests(unittest.TestCase):
    def test_protect_windows_critical(self):
        for name in ("svchost.exe","lsass.exe","explorer.exe","MsMpEng.exe","dwm.exe"):
            with self.subTest(process=name): self.assertEqual(monitor.safe(name,name),"Protected")
    def test_unknown_requires_review(self):
        self.assertEqual(monitor.safe("UnknownApplication.exe","UnknownApplication.exe"),"Review")
    def test_chatgpt_helper_blocked(self):
        self.assertEqual(monitor.safe("ChatGPT.exe","ChatGPT.exe --type=renderer"),"Review")
    def test_chatgpt_main_allowed(self):
        self.assertEqual(monitor.safe("ChatGPT.exe","ChatGPT.exe"),"Safe")
    def test_monitor_browser_protected(self):
        self.assertEqual(monitor.safe("chrome.exe","chrome.exe --app="+monitor.BASE),"Protected")
    def test_local_binding(self):
        self.assertTrue(monitor.BASE.startswith("http://127.0.0.1:"))
        self.assertTrue(monitor.WEB.is_dir())
    def test_token_random(self): self.assertGreaterEqual(len(monitor.TOKEN),24)

if __name__=="__main__": unittest.main()
