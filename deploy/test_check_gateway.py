"""Regression checks for gateway verification without public-IP loopback."""

import io
import json
import subprocess
import unittest
from unittest.mock import patch

import check_gateway


HEALTH = json.dumps({"configured": True, "reachable": True, "databaseReady": True})


class GatewayTests(unittest.TestCase):
    @patch("check_gateway.subprocess.run")
    def test_http_uses_loopback_without_replacing_public_host_or_port(self, run):
        run.side_effect = [
            subprocess.CompletedProcess([], 0, "homepage"),
            subprocess.CompletedProcess([], 0, HEALTH),
        ]
        check_gateway.check_gateway("http://194.33.105.246:8080", attempts=1)
        for call in run.call_args_list:
            args = call.args[0]
            self.assertEqual(args[args.index("--connect-to") + 1], "::127.0.0.1:")
            self.assertEqual(args[args.index("--noproxy") + 1], "*")
        self.assertEqual(run.call_args_list[1].args[0][-1], "http://194.33.105.246:8080/api/backend-health")

    @patch("check_gateway.subprocess.run")
    def test_https_keeps_hostname_and_certificate_validation(self, run):
        run.return_value = subprocess.CompletedProcess([], 0, HEALTH)
        check_gateway.check_gateway("https://app.example.com", attempts=1)
        for call in run.call_args_list:
            self.assertTrue(call.args[0][-1].startswith("https://app.example.com/"))
            self.assertNotIn("--insecure", call.args[0])
            self.assertNotIn("-k", call.args[0])

    @patch("check_gateway.fetch")
    def test_unhealthy_database_is_not_accepted(self, fetch):
        fetch.side_effect = ["homepage", HEALTH.replace('"databaseReady": true', '"databaseReady": false')]
        with self.assertRaisesRegex(RuntimeError, "application/database"):
            check_gateway.check_gateway("http://194.33.105.246", attempts=1)

    @patch("check_gateway.fetch")
    def test_connection_failure_is_not_accepted(self, fetch):
        fetch.side_effect = subprocess.CalledProcessError(7, ["curl"], stderr="Connection refused")
        with self.assertRaisesRegex(RuntimeError, "Connection refused"):
            check_gateway.check_gateway("http://194.33.105.246", attempts=1)

    @patch("check_gateway.fetch")
    def test_non_json_health_response_is_not_accepted(self, fetch):
        fetch.side_effect = ["homepage", "<html>not the health route</html>"]
        with self.assertRaises(RuntimeError):
            check_gateway.check_gateway("http://194.33.105.246", attempts=1)

    @patch("check_gateway.fetch")
    def test_origin_cannot_include_credentials(self, fetch):
        with self.assertRaises(ValueError):
            check_gateway.check_gateway("https://user:secret@example.com", attempts=1)
        fetch.assert_not_called()

    @patch("check_gateway.time.sleep")
    @patch("check_gateway.fetch")
    def test_retries_gateway_while_it_starts(self, fetch, sleep):
        fetch.side_effect = [
            subprocess.CalledProcessError(7, ["curl"], stderr="Starting"),
            "homepage", HEALTH,
        ]
        check_gateway.check_gateway("http://194.33.105.246", attempts=2, delay=5)
        sleep.assert_called_once_with(5)

    @patch("check_gateway.check_gateway")
    def test_compose_input_does_not_expose_secrets(self, check):
        config = {
            "services": {
                "frontend": {"environment": {"APP_ORIGIN": "http://194.33.105.246"}},
                "backend": {"environment": {"DB_PASSWORD": "private-test-value"}},
            },
        }
        output = io.StringIO()
        with patch("sys.stdin", io.StringIO(json.dumps(config))), patch("sys.stdout", output):
            check_gateway.main()
        check.assert_called_once_with("http://194.33.105.246")
        self.assertNotIn("private-test-value", output.getvalue())


if __name__ == "__main__":
    unittest.main()
