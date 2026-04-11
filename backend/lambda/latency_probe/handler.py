"""
latency_probe/handler.py
─────────────────────────────────────────────────────────────────────────────
Shared anycast detection service — deployed in BOTH ap-southeast-1 AND us-east-1.
Called directly (Lambda-to-Lambda invoke) by dns_discovery and https_discovery.

Input event:
  {
    "ips":  ["1.2.3.4", "5.6.7.8"],   # required — list of IPs to probe
    "port": 443                         # optional — default 443, fallback 80
  }

Output:
  {
    "region":  "us-east-1",
    "results": [
      { "ip": "1.2.3.4", "ms": 8.2,  "error": null },
      { "ip": "5.6.7.8", "ms": null, "error": "unreachable" }
    ]
  }

No DynamoDB, no layers — pure stdlib only.
Lambda timeout: 15s is sufficient (probes run in parallel, 5s each).
"""
import json
import os
import socket
import time
import concurrent.futures

REGION = os.environ.get('AWS_REGION', 'unknown')


def lambda_handler(event, context):
    ips  = event.get('ips', [])
    port = int(event.get('port', 443))

    if not ips:
        return {'region': REGION, 'results': []}

    # Deduplicate while preserving order
    seen = set()
    unique_ips = [ip for ip in ips if not (ip in seen or seen.add(ip))]

    def probe(ip):
        return _tcp_latency(ip, port)

    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        futures = {ex.submit(probe, ip): ip for ip in unique_ips}
        for fut in concurrent.futures.as_completed(futures, timeout=12):
            ip = futures[fut]
            try:
                ms, err = fut.result()
            except Exception as e:
                ms, err = None, str(e)
            results.append({'ip': ip, 'ms': ms, 'error': err})

    # Preserve input order in output
    order = {ip: i for i, ip in enumerate(unique_ips)}
    results.sort(key=lambda r: order.get(r['ip'], 999))

    return {'region': REGION, 'results': results}


def _tcp_latency(ip, port=443, timeout=5):
    """
    Measure TCP connect latency in milliseconds.
    Tries port 443 first, falls back to port 80.
    Returns (ms: float | None, error: str | None).
    """
    for p in ([port] if port == 80 else [port, 80]):
        try:
            start = time.perf_counter()
            with socket.create_connection((ip, p), timeout=timeout):
                ms = (time.perf_counter() - start) * 1000
                return round(ms, 1), None
        except socket.timeout:
            continue
        except ConnectionRefusedError:
            # Port refused = host responded = we have a RTT
            ms = (time.perf_counter() - start) * 1000
            return round(ms, 1), 'port_refused'
        except OSError:
            continue
    return None, 'unreachable'
