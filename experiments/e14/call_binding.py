#!/usr/bin/env python3
"""
call_binding.py: Test the local llama.cpp binding by resolving a role and making a chat completion call.

The resolver is BizLoop's own (gateway.lanes), imported from the BizLoop checkout: --bizloop-root, else
$BIZLOOP_ROOT, else /home/edu/Public/bizloop. The binding file is this folder's models.json (--models to change).

The request goes to the binding's own `base_url` (and `api_key_env`, when set) -- see PROPOSAL.md. A binding without
`base_url` falls back to the spike's hard-coded http://127.0.0.1:8190/v1, which is the finding: without the field the
caller has to know the URL.

    python3 call_binding.py --dry-run     # resolve and print the request; nothing is sent, results.json untouched
    python3 call_binding.py               # 5 real calls; writes results.json
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
BIZLOOP_ROOT = os.environ.get("BIZLOOP_ROOT", "/home/edu/Public/bizloop")
FALLBACK_BASE_URL = "http://127.0.0.1:8190/v1"  # the spike's hard-coded URL (serve.sh), used only without base_url

def parse_args():
    ap = argparse.ArgumentParser(description="Resolve a role through gateway.lanes and call the bound model.")
    ap.add_argument("--bizloop-root", default=BIZLOOP_ROOT,
                    help="BizLoop checkout holding gateway/lanes.py (default: $BIZLOOP_ROOT or %(default)s)")
    ap.add_argument("--models", default=str(HERE / "models.json"), help="binding file (default: %(default)s)")
    ap.add_argument("--role", default="local_test")
    ap.add_argument("--env", default="poc", help="environment passed to resolve(); poc maps to the lab lane")
    ap.add_argument("--calls", type=int, default=5)
    ap.add_argument("--dry-run", action="store_true",
                    help="resolve and print the request without sending it; without the gateway, a stand-in "
                         "resolver that only reads roles/bindings from --models is used (and says so)")
    ap.add_argument("--lane", default="lab", help="lane for the dry-run stand-in resolver only")
    return ap.parse_args()

def stand_in_resolve(role, lane, models_path):
    """
    NOT gateway.lanes.resolve: an offline stand-in for --dry-run when no BizLoop checkout is present. It reads
    roles[role][lane] and bindings[name] from the JSON and returns them in the shape results.json recorded from the
    real resolver ({"binding", "lane", **binding}); it applies none of the gateway's guards.
    """
    with open(models_path) as f:
        config = json.load(f)
    name = config["roles"][role][lane]
    return {"binding": name, "lane": lane, **config["bindings"][name]}

def resolve_binding(args):
    """The resolved binding, and which resolver produced it."""
    lanes_py = Path(args.bizloop_root) / "gateway" / "lanes.py"
    if lanes_py.exists():
        # Add the checkout to the path so we can import gateway.lanes
        sys.path.insert(0, str(Path(args.bizloop_root).resolve()))
        from gateway.lanes import resolve, load_config
        config = load_config(str(args.models))
        return resolve(args.role, args.env, config=config), f"gateway.lanes.resolve ({lanes_py})"
    if args.dry_run:
        print(f"NOTE: {lanes_py} not found; the dry run uses a stand-in resolver, not gateway.lanes.resolve.")
        return stand_in_resolve(args.role, args.lane, args.models), "stand-in (gateway not found)"
    print(f"ERROR: {lanes_py} not found. This script calls BizLoop's own resolver; point at a BizLoop checkout with\n"
          f"  --bizloop-root DIR or BIZLOOP_ROOT=DIR, or use --dry-run to check the request offline.", file=sys.stderr)
    sys.exit(1)

def build_request(binding):
    """(url, headers, body, base_url_source) for one chat completion to the resolved binding."""
    base_url = binding.get("base_url")
    base_url_source = "binding"
    if not base_url:
        # The finding: the binding shape has no URL, so the caller must know it (a code change per provider)
        base_url, base_url_source = FALLBACK_BASE_URL, "hard-coded fallback (binding has no base_url)"
    headers = {"Content-Type": "application/json"}
    key_env = binding.get("api_key_env")
    if key_env:
        if os.environ.get(key_env):
            headers["Authorization"] = f"Bearer {os.environ[key_env]}"
        else:
            headers["Authorization"] = f"(api_key_env {key_env} is not set)"
    body = {
        "model": binding["model"],
        "messages": [
            {"role": "user", "content": "Hello, how are you?"}
        ],
        "max_tokens": 10,
        "temperature": 0.0
    }
    return f"{base_url.rstrip('/')}/chat/completions", headers, body, base_url_source

def main():
    args = parse_args()
    print(f"Resolving role '{args.role}' in environment '{args.env}' from {args.models}...")

    try:
        binding, resolver = resolve_binding(args)
        print(f"Resolved binding ({resolver}): {json.dumps(binding, indent=2)}")
        url, headers, data, base_url_source = build_request(binding)

        if args.dry_run:
            shown = {k: ("Bearer ***" if k == "Authorization" and v.startswith("Bearer ") else v)
                     for k, v in headers.items()}
            print("Dry run -- request that would be sent:")
            print(json.dumps({"resolver": resolver, "base_url_source": base_url_source, "method": "POST",
                              "url": url, "headers": shown, "body": data}, indent=2))
            return
        if headers.get("Authorization", "").startswith("("):
            print(f"ERROR: {headers['Authorization']}", file=sys.stderr)
            sys.exit(1)

        # Test the binding with a simple chat completion
        import urllib.request
        import urllib.error

        req = urllib.request.Request(
            url,
            data=json.dumps(data).encode('utf-8'),
            headers=headers
        )

        latencies = []
        token_counts = []

        print(f"Making {args.calls} calls to {url} to measure latency and tokens...")
        for i in range(args.calls):
            start_time = time.time()
            try:
                response = urllib.request.urlopen(req, timeout=30)
                latency_ms = (time.time() - start_time) * 1000
                latencies.append(latency_ms)

                response_data = json.loads(response.read().decode('utf-8'))

                # Extract usage information
                usage = response_data.get('usage', {})
                prompt_tokens = usage.get('prompt_tokens', 0)
                completion_tokens = usage.get('completion_tokens', 0)
                total_tokens = usage.get('total_tokens', 0)

                token_counts.append({
                    'prompt': prompt_tokens,
                    'completion': completion_tokens,
                    'total': total_tokens
                })

                print(f"  Call {i+1}: {latency_ms:.1f}ms, tokens: {total_tokens}")

            except Exception as e:
                print(f"  Call {i+1}: ERROR - {e}")
                # Still record the attempt
                latencies.append(None)
                token_counts.append(None)

        # Calculate median latency
        valid_latencies = [l for l in latencies if l is not None]
        if valid_latencies:
            valid_latencies.sort()
            median_latency = valid_latencies[len(valid_latencies) // 2]
        else:
            median_latency = None

        # Calculate average tokens
        valid_tokens = [t for t in token_counts if t is not None]
        if valid_tokens:
            avg_prompt = sum(t['prompt'] for t in valid_tokens) // len(valid_tokens)
            avg_completion = sum(t['completion'] for t in valid_tokens) // len(valid_tokens)
            avg_total = sum(t['total'] for t in valid_tokens) // len(valid_tokens)
        else:
            avg_prompt = avg_completion = avg_total = 0

        # Determine cost - since our model is not in pricing.json, cost should be unknown/not measured
        # According to the brief: "do not invent a price. If the resolver cannot take your config without a code change, record that as the finding"
        # This line is written here, not printed by BizLoop's pricing code; PROPOSAL.md (b) is the row that would change it

        results = {
            "resolved_binding": binding,
            "resolver": resolver,
            "base_url": url.rsplit("/chat/completions", 1)[0],
            "base_url_source": base_url_source,
            "latency_ms": median_latency,
            "prompt_tokens": avg_prompt,
            "completion_tokens": avg_completion,
            "total_tokens": avg_total,
            "cost_line": "not measured (model not in pricing.json)",
            "note": "Model smollm2-360m-instruct-q8_0 not found in cockpit/pricing.json"
        }

        # Write results to file
        results_path = HERE / "results.json"
        with open(results_path, 'w') as f:
            json.dump(results, f, indent=2)

        print(f"\nResults written to {results_path}")
        print(json.dumps(results, indent=2))

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
