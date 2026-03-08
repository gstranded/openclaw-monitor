#!/usr/bin/env python3
import argparse
import fnmatch
import json
import posixpath
import sys
from pathlib import PurePosixPath

ROOT = PurePosixPath('.')

GOOD_PATHS = [
    'docs/runbook.md',
    'content/notes/today.md',
    'fixtures/markdown/example.markdown',
]

BAD_PATHS = [
    '.git/config.md',
    '.github/workflows/ci.md',
    '.ssh/id_rsa.md',
    'state/session.md',
    'tmp/draft.md',
    'docs/../../etc/passwd.md',
    '../outside.md',
    'docs/runbook.txt',
    'docs/.env',
]


def normalize(path: str) -> str:
    path = path.replace('\\', '/')
    norm = posixpath.normpath(path)
    if norm == '.':
        return ''
    while norm.startswith('./'):
        norm = norm[2:]
    return norm


def matches_glob(path: str, pattern: str) -> bool:
    return fnmatch.fnmatch(path, pattern)


def is_allowed(path: str, policy: dict) -> tuple[bool, str]:
    original = path
    path = normalize(path)
    lowered = path.lower()

    if not path:
        return False, f'{original}: empty path after normalization'

    for fragment in policy['deniedPathFragments']:
        if fragment.lower().replace('\\', '/') in original.lower().replace('\\', '/'):
            return False, f'{original}: contains denied fragment {fragment}'

    for prefix in policy['deniedPathPrefixes']:
        prefix_norm = normalize(prefix)
        if lowered == prefix_norm.lower().rstrip('/') or lowered.startswith(prefix_norm.lower().rstrip('/') + '/'):
            return False, f'{original}: denied by prefix {prefix}'

    name = PurePosixPath(path).name
    if name in policy['deniedExactNames']:
        return False, f'{original}: denied by exact name {name}'

    suffix = ''.join(PurePosixPath(path).suffixes)
    if suffix not in policy['allowedExtensions']:
        ext = suffix or '<none>'
        return False, f'{original}: extension {ext} is not allowed'

    for pattern in policy['approvedMarkdownRoots']:
        if matches_glob(path, pattern):
            return True, f'{original}: allowed by {pattern}'

    return False, f'{original}: outside approved roots'


def validate_policy(policy: dict) -> list[str]:
    errors = []
    required = [
        'approvedMarkdownRoots',
        'deniedPathPrefixes',
        'deniedPathFragments',
        'deniedExactNames',
        'allowedExtensions',
        'requireBackupBeforeWrite',
        'backupDir',
        'requireAuditLog',
        'auditLogPath',
    ]
    for key in required:
        if key not in policy:
            errors.append(f'missing required key: {key}')

    for pattern in policy.get('approvedMarkdownRoots', []):
        if pattern in ('**', '/**', '*'):
            errors.append(f'dangerous allowlist pattern: {pattern}')
        if pattern.startswith('/'):
            errors.append(f'allowlist pattern must be repo-relative: {pattern}')

    for denied in policy.get('deniedPathPrefixes', []):
        if denied in ('', '/', '**'):
            errors.append(f'invalid denied prefix: {denied!r}')

    if not policy.get('requireBackupBeforeWrite', False):
        errors.append('requireBackupBeforeWrite must stay enabled')
    if not policy.get('requireAuditLog', False):
        errors.append('requireAuditLog must stay enabled')

    backup_dir = normalize(policy.get('backupDir', ''))
    audit_path = normalize(policy.get('auditLogPath', ''))
    if not backup_dir.startswith('.rollback/'):
        errors.append('backupDir must stay under .rollback/')
    if not audit_path.startswith('.audit/'):
        errors.append('auditLogPath must stay under .audit/')

    return errors


def run_fixture_checks(policy: dict) -> list[str]:
    errors = []
    for path in GOOD_PATHS:
        allowed, reason = is_allowed(path, policy)
        if not allowed:
            errors.append(f'expected allowed but denied: {reason}')
    for path in BAD_PATHS:
        allowed, reason = is_allowed(path, policy)
        if allowed:
            errors.append(f'expected denied but allowed: {reason}')
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description='Validate markdown path boundary policy.')
    parser.add_argument('--policy', default='config/markdown-boundaries.json')
    parser.add_argument('--check-path', action='append', default=[])
    args = parser.parse_args()

    with open(args.policy, 'r', encoding='utf-8') as f:
        policy = json.load(f)

    errors = validate_policy(policy)
    errors.extend(run_fixture_checks(policy))

    for path in args.check_path:
        allowed, reason = is_allowed(path, policy)
        print(reason)
        if not allowed:
            errors.append(f'path check failed: {reason}')

    if errors:
        print('markdown boundary check failed:', file=sys.stderr)
        for err in errors:
            print(f' - {err}', file=sys.stderr)
        return 1

    print('markdown boundary check passed')
    print(f"backupDir={policy['backupDir']}")
    print(f"auditLogPath={policy['auditLogPath']}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
