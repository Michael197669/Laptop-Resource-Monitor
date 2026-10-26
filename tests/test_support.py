import pathlib, sys, unittest
from unittest.mock import patch, MagicMock
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
import dashboard

class SupportTests(unittest.TestCase):
    def test_rejects_non_paypal(self):
        for url in [
            'http://paypal.me/abc','https://paypal.me.evil.example/good',
            'https://www.paypal.com.evil.example/donate', 'https://paypal.com:evil@evil.example/donate',
            'https://evil.example/donate','https://www.paypal.com/signin',
            'https://www.paypal.com/donate#other', 'https://paypal.me/',
            'file:///C:/Windows/System32/cmd.exe'
        ]:
            with self.subTest(url=url):
                self.assertIsNone(dashboard.verified_paypal_url(url))
    def test_accepts_official(self):
        for url in ('https://www.paypal.com/donate/?hosted_button_id=example',
                    'https://www.paypal.com/ncp/payment/EXAMPLE',
                    'https://paypal.me/ExampleBusiness'):
            with self.subTest(url=url):
                self.assertEqual(dashboard.verified_paypal_url(url),url)
    def test_no_url_is_not_a_payment(self):
        self.assertIsNone(dashboard.verified_paypal_url(""))
        self.assertIsNone(dashboard.verified_paypal_url(None))

if __name__=="__main__":
    unittest.main()
