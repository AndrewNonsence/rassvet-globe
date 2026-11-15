"""Orbit freshness report and a read-only check of a published tracker."""
import argparse
import datetime as dt
import json
import re
import sys
import urllib.request

UTC = dt.timezone.utc


def blocks(page):
    out = {}
    for attrs, body in re.findall(r'<script\b([^>]*)>(.*?)</script>', page, re.S | re.I):
        match = re.search(r'\bid=["\']([^"\']+)', attrs)
        if match and 'application/json' in attrs:
            out[match[1]] = json.loads(body)
    return out


def age_days(epoch, now):
    try:
        value = dt.datetime.fromisoformat(str(epoch).replace('Z', '+00:00'))
        return (now - value.replace(tzinfo=UTC)).total_seconds() / 86400
    except (TypeError, ValueError):
        return None


def report(page, now=None, max_days=30):
    now = now or dt.datetime.now(UTC)
    data = blocks(page)
    systems = {}
    for key, value in data.items():
        if not isinstance(value, dict):
            continue
        if 'satellites' in value:
            epochs = [(s.get('elements') or {}).get('epoch') for s in value['satellites']
                      if (s.get('status') or {}).get('value') != 'decayed']
        elif 'rows' in value and 'epoch' in value.get('fields', []):
            ix = value['fields'].index('epoch')
            epochs = [row[ix] for row in value['rows']]
        else:
            continue
        ages = [age_days(epoch, now) for epoch in epochs]
        systems[key] = {
            'total': len(epochs),
            'current': sum(a is not None and -2 <= a <= 7 for a in ages),
            'stale': sum(a is not None and 7 < a <= max_days for a in ages),
            'expired': sum(a is not None and a > max_days for a in ages),
            'missing': sum(a is None or a < -2 for a in ages),
        }
    return {'schemaVersion': 1, 'generatedAt': data.get('data-meta', {}).get('generatedAt'),
            'checkedAt': now.isoformat(), 'maxEpochAgeDays': max_days, 'systems': systems}


def problems(data, now=None, max_hours=18):
    now = now or dt.datetime.now(UTC)
    issues = []
    age = age_days(data.get('generatedAt'), now)
    if age is None or age < -0.01 or age * 24 > max_hours:
        issues.append('publication missing, future-dated or older than limit')
    systems = data.get('systems') or {}
    for key in ('data-rassvet', 'data-stations'):
        item = systems.get(key) or {}
        total = item.get('total', 0)
        if not total or item.get('current', 0) / total < 0.95:
            issues.append(key + ': fewer than 95% of active records have recent elements')
    return issues


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--url', help='published site root')
    source.add_argument('--file', help='HTML file, or - for standard input')
    parser.add_argument('--max-hours', type=float, default=18)
    args = parser.parse_args()
    try:
        if args.file:
            if args.file == '-':
                page = sys.stdin.buffer.read(16 * 1024 * 1024 + 1)
            else:
                with open(args.file, 'rb') as stream:
                    page = stream.read(16 * 1024 * 1024 + 1)
        else:
            url = args.url.rstrip('/') + '/'
            request = urllib.request.Request(url, headers={'User-Agent': 'Rassvet-health/1.0'})
            with urllib.request.urlopen(request, timeout=25) as response:
                if response.status != 200:
                    raise ValueError('page does not return 200')
                page = response.read(16 * 1024 * 1024 + 1)
        if len(page) > 16 * 1024 * 1024:
            raise ValueError('page exceeds size limit')
        data = report(page.decode('utf-8'))
        issues = problems(data, max_hours=args.max_hours)
        print(json.dumps(data, ensure_ascii=False))
        for issue in issues:
            print('FAIL: ' + issue)
        return 1 if issues else 0
    except Exception as error:
        print('FAIL: ' + type(error).__name__)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
