"""Read only existing Recall project assignments and the failed watchdog receipt.

No events, configuration values, credentials, writes, service control or inference.
Uses the already established operator SSH/Root-terminal transport.
"""
import argparse
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import subprocess

DATABASE = Path('/var/lib/netaigis-recall/recall.sqlite3')
CONFIGURATION = Path('/etc/netaigis-coding-agent/recall.env')
WATCHDOG = 'netaigis-watchdog.service'


def identifier(value):
    return '"' + value.replace('"', '""') + '"'


def read_projects(database=DATABASE):
    # Read the live WAL through SQLite itself, never immutable=1 or a file copy.
    with sqlite3.connect(database.as_uri() + '?mode=ro', uri=True, timeout=5) as connection:
        connection.execute('PRAGMA query_only=ON')
        connection.execute('BEGIN')
        tables = [row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
        result = []
        for table in tables:
            columns = [row[1] for row in connection.execute('PRAGMA table_info(' + identifier(table) + ')')]
            if 'project_id' not in columns:
                continue
            rows = connection.execute('SELECT project_id,COUNT(*) FROM ' + identifier(table)
                                      + ' GROUP BY project_id ORDER BY project_id LIMIT 1001').fetchall()
            if len(rows) > 1000:
                raise ValueError('project_listing_limit_reached')
            result.append({'table': table, 'columns': columns,
                           'projects': [{'project_id': row[0], 'row_count': row[1]} for row in rows]})
        connection.rollback()
    return result


def configuration_summary(path=CONFIGURATION):
    keys = set()
    projects = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if line.startswith('export '):
            line = line[7:].lstrip()
        key, separator, value = line.partition('=')
        key = key.strip()
        if separator and key.replace('_', '').isalnum():
            keys.add(key)
            # Exact nonsecret allowlist; never evaluate shell or print arbitrary values.
            if key in ('PROJECT_ID', 'RECALL_PROJECT_ID', 'RECALL_PROJECT', 'TOTAL_RECALL_PROJECT_ID'):
                projects[key] = value.strip().strip('\"\'')
    return {'keys': sorted(keys), 'explicit_project_values': projects}


def watchdog_receipt():
    output = subprocess.run(['journalctl', '--no-pager', '-o', 'json', '-n', '40', '-u', WATCHDOG],
                            capture_output=True, text=True, timeout=10, check=True)
    receipts = []
    for line in output.stdout.splitlines():
        entry = json.loads(line)
        # Trusted journal attribution and manager lifecycle fields only.
        row = {key: entry[key] for key in (
            '__CURSOR', '__REALTIME_TIMESTAMP', '_PID', '_SYSTEMD_UNIT', '_SYSTEMD_INVOCATION_ID',
            'UNIT', 'INVOCATION_ID', 'MESSAGE_ID', 'JOB_RESULT', 'RESULT', 'EXIT_CODE', 'EXIT_STATUS',
            'CODE_FUNC') if key in entry}
        try:
            value = json.loads(entry.get('MESSAGE', ''))
        except (ValueError, TypeError):
            value = None
        if (entry.get('_SYSTEMD_UNIT') == WATCHDOG and isinstance(value, dict)
                and value.get('component') == 'netaigis-watchdog'):
            row['observation'] = {key: value.get(key) for key in ('version', 'at', 'component')}
            row['observation']['observations'] = [
                {key: target.get(key) for key in ('unit', 'state', 'findings', 'health', 'process', 'service')}
                for target in value.get('observations', []) if isinstance(target, dict)]
        receipts.append(row)
    return receipts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--remote', action='store_true')
    args = parser.parse_args()
    if args.remote:
        helper = Path(__file__).with_name('netaigis-coding-agent-adapter-remote.py')
        spec = importlib.util.spec_from_file_location('existing_readonly_terminal_transport', helper)
        transport = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(transport)
        source = Path(__file__).read_bytes()
        program = ('import base64,hashlib,sys; s=base64.b64decode('
                   + repr(base64.b64encode(source).decode()) + '); assert hashlib.sha256(s).hexdigest()=='
                   + repr(hashlib.sha256(source).hexdigest()) + '; sys.argv=["recall-project-inspect"]; '
                   + 'exec(compile(s,"public-readonly-recall-inspector","exec"),{"__name__":"__main__"})')
        with open('/dev/tty') as terminal:
            return subprocess.call(transport.ssh_command(program), stdin=terminal)
    if os.geteuid() != 0:
        raise SystemExit('Existing Root terminal required; no password in chat')
    report = {'ok': True, 'database': str(DATABASE), 'source_modified': False,
              'configuration_modified': False, 'service_modified': False, 'model_request': False}
    for key, operation in (('project_assignments', read_projects),
                           ('configuration', configuration_summary), ('watchdog_journal', watchdog_receipt)):
        try:
            report[key] = operation()
        except Exception as error:
            report['ok'] = False
            report[key] = {'error_class': type(error).__name__}
    print(json.dumps(report))
    return 0 if report['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
