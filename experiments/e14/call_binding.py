#!/usr/bin/env python3
"""
call_binding.py: Test the local llama.cpp binding by resolving a role and making a chat completion call.
"""
import json
import sys
import time
from pathlib import Path

# Add the gateway directory to the path so we can import lanes
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from gateway.lanes import resolve, load_config

def main():
    # Load our local models.json
    models_path = Path(__file__).parent / "models.json"
    config = load_config(str(models_path))

    # Define a new role for testing - we'll use "local_test" which we added to models.json
    role = "local_test"
    env = "poc"  # poc maps to lab lane

    print(f"Resolving role '{role}' in environment '{env}'...")

    try:
        binding = resolve(role, env, config=config)
        print(f"Resolved binding: {json.dumps(binding, indent=2)}")

        # Extract the base URL from the binding
        # For llamacpp provider, we need to construct the URL
        # Based on our serve.sh, it's http://127.0.0.1:8190/v1
        base_url = "http://127.0.0.1:8190/v1"

        # Test the binding with a simple chat completion
        import urllib.request
        import urllib.error

        data = {
            "model": binding["model"],
            "messages": [
                {"role": "user", "content": "Hello, how are you?"}
            ],
            "max_tokens": 10,
            "temperature": 0.0
        }

        req = urllib.request.Request(
            f"{base_url}/chat/completions",
            data=json.dumps(data).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )

        latencies = []
        token_counts = []

        print("Making 5 calls to measure latency and tokens...")
        for i in range(5):
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
        # Our model is not in pricing.json, so we should note that

        results = {
            "resolved_binding": binding,
            "base_url": base_url,
            "latency_ms": median_latency,
            "prompt_tokens": avg_prompt,
            "completion_tokens": avg_completion,
            "total_tokens": avg_total,
            "cost_line": "not measured (model not in pricing.json)",
            "note": "Model smollm2-360m-instruct-q8_0 not found in cockpit/pricing.json"
        }

        # Write results to file
        results_path = Path(__file__).parent / "results.json"
        with open(results_path, 'w') as f:
            json.dump(results, f, indent=2)

        print(f"\nResults written to {results_path}")
        print(json.dumps(results, indent=2))

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()