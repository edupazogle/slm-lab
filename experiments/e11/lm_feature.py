#!/usr/bin/env python3
"""
Compute LM-based garble score for E11 step 3 (brief E11-step-3.md).
Score = mean token negative log-likelihood of a small causal LM over the window's last 1,500 bytes
(the last 512 tokens of them), on CPU. Higher = more surprising = more likely garble.

Scores are cached to data/lm_scores.jsonl keyed by window id ("<split>_<line number>", the id evaluate.py uses),
with the wall and CPU ms each window took. The run resumes from the cache, so it can be done in chunks:

    python3 lm_feature.py --limit 300      # repeat until it prints "all N windows scored"
    python3 evaluate.py                    # Baseline 1 vs Baseline 2 (+ LM score), kill rule

The model is any causal LM transformers can load: a hub id (default HuggingFaceTB/SmolLM2-135M, Apache-2.0) or a
local directory (--model, or $E11_LM_MODEL).
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

# Configuration
HERE = Path(__file__).resolve().parent
DATA_DIR = str(HERE / "data")
RESULTS_DIR = str(HERE / "results")
MODEL_NAME = os.environ.get("E11_LM_MODEL", "HuggingFaceTB/SmolLM2-135M")
CACHE_FILE = os.path.join(DATA_DIR, "lm_scores.jsonl")
WINDOW_LAST_BYTES = 1500  # Score over last 1,500 bytes
MAX_TOKENS = 512  # Truncate to 512 tokens (keeping the tail)
OMP_NUM_THREADS = 4

# Set environment variables as per preface (before torch is imported)
os.environ["NEEDLE_TELEMETRY"] = "0"
os.environ["DO_NOT_TRACK"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ.setdefault("OMP_NUM_THREADS", str(OMP_NUM_THREADS))
os.environ["TOKENIZERS_PARALLELISM"] = "false"

def load_model(model_name, threads):
    """Load the small causal LM and tokenizer (float32, CPU)."""
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    torch.set_num_threads(threads)
    print(f"Loading model {model_name}...")
    start_time = time.time()

    tokenizer = AutoTokenizer.from_pretrained(model_name)
    # .float(): some checkpoints (SmolLM2 included) are stored in bfloat16, which recent transformers keeps by default
    model = AutoModelForCausalLM.from_pretrained(model_name).float()
    model.eval()  # Set to evaluation mode

    load_time = time.time() - start_time
    n_params = sum(p.numel() for p in model.parameters())
    print(f"Model loaded in {load_time:.2f} seconds ({n_params / 1e6:.1f} M parameters)")
    return tokenizer, model

def window_tail(text, n_bytes=WINDOW_LAST_BYTES):
    """The last n_bytes of the text's UTF-8 encoding (a character cut at the boundary is dropped)."""
    return text.encode('utf-8')[-n_bytes:].decode('utf-8', errors='ignore')

def compute_lm_score(text, tokenizer, model):
    """
    Compute mean token negative log-likelihood over the window's last 1,500 bytes.
    Returns (score, n_tokens); score is 0.0 when fewer than 2 tokens can be scored.
    """
    import torch

    text = window_tail(text)
    if not text:
        return 0.0, 0

    # Tokenize, keeping the LAST MAX_TOKENS tokens (the pane's bottom is what the watchdog sees)
    tokens = tokenizer(text, add_special_tokens=False)['input_ids'][-MAX_TOKENS:]
    if len(tokens) < 2:
        return 0.0, len(tokens)

    # Convert to tensor
    input_ids = torch.tensor([tokens])

    # Get model outputs
    with torch.no_grad():
        logits = model(input_ids).logits

    # Log probability of each actual token given the ones before it
    log_probs = torch.nn.functional.log_softmax(logits[0, :-1, :].float(), dim=-1)
    target_ids = input_ids[0, 1:]
    actual_token_log_probs = log_probs.gather(1, target_ids.unsqueeze(1)).squeeze(1)

    # Mean negative log-likelihood (higher = more surprising = more likely garble)
    nll = -actual_token_log_probs.mean().item()

    return nll, len(tokens)

def load_windows(split):
    """[(window_id, text)] for one split; fails loudly if the file is missing or empty."""
    dataset_path = os.path.join(DATA_DIR, f'{split}.jsonl')
    if not os.path.exists(dataset_path) or os.path.getsize(dataset_path) == 0:
        print(f"ERROR: {dataset_path} is missing or empty (run build_dataset.py first)", file=sys.stderr)
        sys.exit(1)
    windows = []
    with open(dataset_path, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f):
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                windows.append((f"{split}_{line_num}", entry['text']))  # Unique ID per window
            except (json.JSONDecodeError, KeyError) as e:
                print(f"Error parsing line in {dataset_path}: {e}", file=sys.stderr)
                continue
    return windows

def load_cache(cache_file, model_name):
    """{window_id: row} already scored; refuses a cache written with another model (scores would not compare)."""
    cached = {}
    if not os.path.exists(cache_file):
        return cached
    with open(cache_file, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                row = json.loads(line)
                cached[row['window_id']] = row
    other = {row.get('model') for row in cached.values()} - {model_name}
    if other:
        print(f"ERROR: {cache_file} holds scores from {sorted(other)}, not {model_name}. "
              f"Move it away or pass --cache to write elsewhere.", file=sys.stderr)
        sys.exit(1)
    return cached

def median(values):
    s = sorted(values)
    n = len(s)
    return (s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2) if n else None

def parse_args():
    ap = argparse.ArgumentParser(description="E11 step 3: per-window small-LM garble score (mean token NLL).")
    ap.add_argument("--model", default=MODEL_NAME,
                    help="hub id or local directory of a causal LM (default: $E11_LM_MODEL or %(default)s)")
    ap.add_argument("--cache", default=CACHE_FILE, help="score cache, JSONL (default: %(default)s)")
    ap.add_argument("--limit", type=int, default=0,
                    help="score at most this many not-yet-cached windows in this run (0 = all)")
    ap.add_argument("--threads", type=int, default=int(os.environ["OMP_NUM_THREADS"]),
                    help="torch CPU threads (default: $OMP_NUM_THREADS or 4)")
    return ap.parse_args()

def main():
    args = parse_args()

    # Load datasets to get window texts
    print("Loading datasets...")
    windows = load_windows('train') + load_windows('test')
    cached = load_cache(args.cache, args.model)
    todo = [(wid, text) for wid, text in windows if wid not in cached]
    if args.limit:
        todo = todo[:args.limit]
    print(f"Total windows: {len(windows)}; cached: {sum(1 for wid, _ in windows if wid in cached)}; "
          f"scoring now: {len(todo)}")

    if todo:
        # Load model
        tokenizer, model = load_model(args.model, args.threads)

        # Compute scores, appending each to the cache as it is done (a killed run loses nothing)
        print("Computing LM scores...")
        start_time = time.time()
        os.makedirs(os.path.dirname(os.path.abspath(args.cache)), exist_ok=True)
        with open(args.cache, 'a', encoding='utf-8') as f:
            for i, (window_id, text) in enumerate(todo):
                t_wall, t_cpu = time.perf_counter(), time.process_time()
                score, n_tokens = compute_lm_score(text, tokenizer, model)
                row = {
                    'window_id': window_id,
                    'lm_score': score,
                    'n_tokens': n_tokens,
                    'ms_wall': (time.perf_counter() - t_wall) * 1000,
                    'ms_cpu': (time.process_time() - t_cpu) * 1000,  # all threads' CPU time
                    'model': args.model
                }
                f.write(json.dumps(row, ensure_ascii=False) + '\n')
                f.flush()
                cached[window_id] = row

                # Progress indicator
                if (i + 1) % 50 == 0:
                    elapsed = time.time() - start_time
                    print(f"  Processed {i + 1}/{len(todo)} windows ({(i + 1) / elapsed:.1f} windows/sec)")
        print(f"Scored {len(todo)} windows in {time.time() - start_time:.2f} seconds")

    scored = [cached[wid] for wid, _ in windows if wid in cached]
    remaining = len(windows) - len(scored)
    if not scored:
        print("No windows scored.", file=sys.stderr)
        sys.exit(1)

    # Summary over every cached window (median timings: the brief's "median ms per window")
    scores = [row['lm_score'] for row in scored]
    mean = sum(scores) / len(scores)
    summary = {
        'model': args.model,
        'windows_scored': len(scored),
        'windows_total': len(windows),
        'median_ms_wall_per_window': median([row['ms_wall'] for row in scored]),
        'median_ms_cpu_per_window': median([row['ms_cpu'] for row in scored]),
        'threads': args.threads,
        'machine_load_1min': os.getloadavg()[0],
        'score_stats': {
            'min': min(scores),
            'max': max(scores),
            'mean': mean,
            'std': (sum((x - mean) ** 2 for x in scores) / len(scores)) ** 0.5
        }
    }
    os.makedirs(RESULTS_DIR, exist_ok=True)
    summary_file = os.path.join(RESULTS_DIR, 'lm_scores_summary.json')
    with open(summary_file, 'w') as f:
        json.dump(summary, f, indent=2)
    print(f"Summary saved to {summary_file}")

    # Print some statistics
    print(f"\nLM Score Statistics ({len(scored)} windows):")
    print(f"  Min: {summary['score_stats']['min']:.4f}  Max: {summary['score_stats']['max']:.4f}  "
          f"Mean: {mean:.4f}  Std: {summary['score_stats']['std']:.4f}")
    print(f"  Median per window: {summary['median_ms_wall_per_window']:.1f} wall ms, "
          f"{summary['median_ms_cpu_per_window']:.1f} CPU ms ({args.threads} threads)")
    if remaining:
        print(f"{remaining} windows still to score: run lm_feature.py again.")
    else:
        print(f"All {len(windows)} windows scored. Next: python3 evaluate.py")

if __name__ == '__main__':
    main()
