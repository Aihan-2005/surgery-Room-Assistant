"""Exercise deployment ordering/failure handling without Docker, SSH or real data."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("release.sh").resolve()
SHA = "a" * 40


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.project = self.root / "project"
        self.project.mkdir()
        self.log = self.root / "commands.jsonl"
        env_file = self.root / "compose.env"
        # Example tokens in comments must not cause placeholder rejection.
        env_file.write_text("# Replace YOUR_SERVER_IP\nAPP_HOST=localhost\n")
        self.env = {
            **os.environ,
            "PATH": f"{self.bin}:{os.environ['PATH']}",
            "AIRWAY_STATE_DIR": str(self.root),
            "AIRWAY_PROJECT_DIR": str(self.project),
            "AIRWAY_ENV_FILE": str(env_file),
            "TEST_COMMAND_LOG": str(self.log),
            "TEST_LATEST_SHA": SHA,
        }
        self.stub("flock", "pass\n")  # Lock contention is handled by Linux flock.
        self.stub("curl", "pass\n")
        self.stub("python3", """
with open(os.environ['TEST_COMMAND_LOG'], 'a') as log:
    log.write(json.dumps(['python3', *sys.argv[1:]]) + '\\n')
sys.stdin.read()
if os.environ.get('TEST_FAIL_ON') == 'gateway-check':
    sys.exit(55)
""")
        self.stub("docker", """
args = sys.argv[1:]
# Simulate commands that attach to stdin, as `compose run` normally does.
sys.stdin.read()
with open(os.environ['TEST_COMMAND_LOG'], 'a') as log:
    log.write(json.dumps(['docker', *args]) + '\\n')
failure = os.environ.get('TEST_FAIL_ON')
if failure and failure in args:
    sys.exit(55)
if 'pg_dump' in args:
    print('database backup')
if 'tar' in args:
    print('media backup')
""")
        self.stub("git", """
args = sys.argv[1:]
with open(os.environ['TEST_COMMAND_LOG'], 'a') as log:
    log.write(json.dumps(['git', *args]) + '\\n')
if args[0] == 'status':
    print(os.environ.get('TEST_DIRTY', ''), end='')
if args[0] == 'rev-parse':
    print(os.environ['TEST_LATEST_SHA'])
""")

    def stub(self, name, body):
        path = self.bin / name
        path.write_text(f"#!{sys.executable}\nimport json, os, sys\n{body}")
        path.chmod(0o755)

    def run_release(self, release="local", **env):
        return subprocess.run(
            ["bash", "-s", "--", release], input=SCRIPT.read_text(), env={**self.env, **env},
            text=True, capture_output=True, timeout=15,
        )

    def calls(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def test_rejects_invalid_commit_before_commands(self):
        result = self.run_release("main; touch unexpected")
        self.assertEqual(result.returncode, 2)
        self.assertEqual(self.calls(), [])

    def test_refuses_tracked_server_edits(self):
        result = self.run_release(SHA, TEST_DIRTY=" M backend/config/settings.py")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(call[0] == "docker" for call in self.calls()))

    def test_superseded_run_does_not_checkout_or_touch_containers(self):
        result = self.run_release("b" * 40)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(any(call[0] == "docker" or "checkout" in call for call in self.calls()))

    def test_failed_pull_keeps_running_apps_untouched(self):
        result = self.run_release(SHA, TEST_FAIL_ON="pull")
        self.assertEqual(result.returncode, 55)
        self.assertFalse(any("stop" in call for call in self.calls()))
        self.assertFalse((self.root / "current-release").exists())

    def test_failed_migration_preserves_backup_and_stops_apps(self):
        marker = self.root / "current-release"
        marker.write_text("previous-sha\n")
        result = self.run_release(TEST_FAIL_ON="migrate")
        self.assertEqual(result.returncode, 55)
        self.assertEqual(marker.read_text(), "previous-sha\n")
        backup, = (self.root / "backups").iterdir()
        self.assertTrue((backup / "database.dump").stat().st_size)
        self.assertTrue((backup / "media.tar.gz").stat().st_size)
        self.assertEqual((backup / "previous-release").read_text(), "previous-sha\n")
        calls = self.calls()
        self.assertEqual(sum("stop" in call for call in calls), 2)
        self.assertFalse(any("up" in call and "frontend" in call for call in calls))

    def test_success_backs_up_before_migrating_and_records_release(self):
        result = self.run_release(SHA)
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.calls()
        position = lambda token: next(i for i, call in enumerate(calls) if token in call)
        self.assertLess(position("pull"), position("stop"))
        self.assertLess(position("stop"), position("pg_dump"))
        self.assertLess(position("pg_dump"), position("migrate"))
        self.assertLess(position("tar"), position("migrate"))
        self.assertLess(position("migrate"), position("collectstatic"))
        self.assertLess(position("collectstatic"), position("python3"))
        self.assertIn(["git", "checkout", "--detach", SHA], calls)
        self.assertEqual((self.root / "current-release").read_text(), SHA + "\n")

    def test_failed_gateway_check_stops_apps_without_recording_release(self):
        result = self.run_release(TEST_FAIL_ON="gateway-check")
        self.assertEqual(result.returncode, 55)
        self.assertEqual(sum("stop" in call for call in self.calls()), 2)
        self.assertFalse((self.root / "current-release").exists())
        backup, = (self.root / "backups").iterdir()
        self.assertTrue((backup / "database.dump").stat().st_size)


if __name__ == "__main__":
    unittest.main()
