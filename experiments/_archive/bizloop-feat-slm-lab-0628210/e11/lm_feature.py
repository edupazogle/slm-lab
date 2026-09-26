#!/usr/bin/env python3
"""
Compute LM-based garble score for E11 step 3.
Uses HuggingFaceTB/SmolLM2-135M to compute mean token negative log-likelihood
over the window's last 1,500 bytes (truncated to 512 tokens).
"""

import json
import os
import sys
import time
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

# Configuration
DATA_DIR = "/home/edu/Public/bizloop/slm/experiments/e11/data"
MODEL_NAME = "HuggingFaceTB/SmolLM2-135M"
CACHE_FILE = os.path.join(DATA_DIR, "lm_scores.jsonl")
WINDOW_LAST_BYTES = 1500  # Score over last 1,500 bytes
MAX_TOKENS = 512  # Truncate to 512 tokens
OMP_NUM_THREADS = 4

# Set environment variables as per preface
os.environ["NEEDLE_TELEMETRY"] = "0"
os.environ["DO_NOT_TRACK"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["OMP_NUM_THREADS"] = str(OMP_NUM_THREADS)
os.environ["TOKENIZERS_PARALLELISM"] = "false"

def load_model():
    """Load the small causal LM and tokenizer."""
    print(f"Loading model {MODEL_NAME}...")
    start_time = time.time()

    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_NAME,
        dtype=torch.float32,  # Use float32 for CPU
        device_map="cpu"
    )
    model.eval()  # Set to evaluation mode

    load_time = time.time() - start_time
    print(f"Model loaded in {load_time:.2f} seconds")
    return tokenizer, model

def compute_lm_score(text, tokenizer, model):
    """
    Compute mean token negative log-likelihood over the window's last 1,500 bytes.
    Returns the score (higher = more likely to be garble).
    """
    if not text:
        return 0.0

    # Take last WINDOW_LAST_BYTES bytes
    if len(text) > WINDOW_LAST_BYTES:
        text = text[-WINDOW_LAST_BYTES:]

    # Tokenize
    tokens = tokenizer.encode(text, add_special_tokens=False, truncation=True, max_length=MAX_TOKENS)

    if len(tokens) == 0:
        return 0.0

    # Convert to tensor
    input_ids = torch.tensor([tokens])

    # Get model outputs
    with torch.no_grad():
        outputs = model(input_ids)
        logits = outputs.logits

    # Compute log probabilities
    log_probs = torch.nn.functional.log_softmax(logits, dim=-1)

    # Get log probability of each token (shifted for next token prediction)
    # We want P(token_i | token_0, ..., token_{i-1})
    token_log_probs = log_probs[0, :-1, :]  # All but last prediction
    target_ids = input_ids[0, 1:]  # All but first token

    # Get the log probability of each actual token
    actual_token_log_probs = token_log_probs.gather(1, target_ids.unsqueeze(1)).squeeze(1)

    # Mean negative log-likelihood (higher = more surprising = more likely garble)
    nll = -actual_token_log_probs.mean().item()

    return nll

def main():
    # Ensure output directory exists
    os.makedirs(DATA_DIR, exist_ok=True)

    # Load datasets to get window texts
    def load_dataset_texts(split):
        dataset_path = os.path.join(DATA_DIR, f'{split}.jsonl')
        texts = []
        ids = []  # Simple index-based ID for caching

        with open(dataset_path, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f):
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                    texts.append(entry['text'])
                    ids.append(f"{split}_{line_num}")  # Unique ID per window
                except (json.JSONDecodeError, KeyError) as e:
                    print(f"Error parsing line in {dataset_path}: {e}", file=sys.stderr)
                    continue

        return texts, ids

    print("Loading datasets...")
    train_texts, train_ids = load_dataset_texts('train')
    test_texts, test_ids = load_dataset_texts('test')

    all_texts = train_texts + test_texts
    all_ids = train_ids + test_ids

    print(f"Total windows to score: {len(all_texts)}")

    # Load model
    tokenizer, model = load_model()

    # Compute scores and cache them
    print("Computing LM scores...")
    start_time = time.time()

    scores = []
    for i, (text, window_id) in enumerate(zip(all_texts, all_ids)):
        score = compute_lm_score(text, tokenizer, model)
        scores.append(score)

        # Progress indicator
        if (i + 1) % 100 == 0:
            elapsed = time.time() - start_time
            rate = (i + 1) / elapsed if elapsed > 0 else 0
            print(f"  Processed {i + 1}/{len(all_texts)} windows ({rate:.1f} windows/sec)")

    total_time = time.time() - start_time
    median_ms_per_window = (total_time / len(all_texts)) * 1000

    print(f"Scoring completed in {total_time:.2f} seconds")
    print(f"Median time per window: {median_ms_per_window:.2f} ms")

    # Save scores to cache file
    print(f"Saving scores to {CACHE_FILE}")
    with open(CACHE_FILE, 'w', encoding='utf-8') as f:
        for window_id, score in zip(all_ids, scores):
            entry = {
                'window_id': window_id,
                'lm_score': score
            }
            f.write(json.dumps(entry, ensure_ascii=False) + '\n')

    # Also create a summary file for easy reference
    summary_file = os.path.join(DATA_DIR, 'lm_scores_summary.json')
    summary = {
        'total_windows': len(all_texts),
        'median_ms_per_window': median_ms_per_window,
        'total_time_seconds': total_time,
        'score_stats': {
            'min': min(scores),
            'max': max(scores),
            'mean': sum(scores) / len(scores),
            'std': (sum((x - (sum(scores) / len(scores))) ** 2 for x in scores) / len(scores)) ** 0.5
        }
    }

    with open(summary_file, 'w') as f:
        json.dump(summary, f, indent=2)

    print(f"Summary saved to {summary_file}")

    # Print some statistics
    print(f"\nLM Score Statistics:")
    print(f"  Min: {min(scores):.4f}")
    print(f"  Max: {max(scores):.4f}")
    print(f"  Mean: {sum(scores) / len(scores):.4f}")
    print(f"  Std: {(sum((x - (sum(scores) / len(scores))) ** 2 for x in scores) / len(scores)) ** 0.5:.4f}")

if __name__ == '__main__':
    main()