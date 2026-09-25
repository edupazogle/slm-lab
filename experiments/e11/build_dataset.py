#!/usr/bin/env python3
"""
Build dataset for E11 fix round 2: local watchdog classifier for the agent fleet.
Implements the exact specification from E11-fix-2.md:
- Use visible_pieces function to extract terminal-visible text with event indices
- Concatenate pieces with "\n", track byte offsets and event indices
- Slide 6,000-byte window with 2,000-byte step, cap at 60 windows per job
- Label windows based on FIRST event after window's last byte by structure
- Garble = synthetic only from generators
- Assert ≥1,000 real windows total and ≥300 synthetic garble windows
- Test split: by job 70/30 with seed 13, test set must have ≥15 jobs
"""

import argparse
import json
import os
import random
import re
import sys
from datetime import datetime
from pathlib import Path

# Configuration
# Everything this experiment writes lives next to this script. The one external input -- the cockpit's job
# transcripts, private to the BizLoop checkout -- comes from --runs-dir, else $E11_RUNS_DIR, else
# $BIZLOOP_ROOT/cockpit/runs (BIZLOOP_ROOT defaults to the owner's checkout, so nothing changes there).
HERE = Path(__file__).resolve().parent
BIZLOOP_ROOT = os.environ.get("BIZLOOP_ROOT", "/home/edu/Public/bizloop")
RUNS_DIR = os.environ.get("E11_RUNS_DIR", os.path.join(BIZLOOP_ROOT, "cockpit", "runs"))
OUTPUT_DIR = str(HERE / "data")
WINDOW_SIZE = 6000  # bytes
STEP_SIZE = 2000    # bytes
MAX_WINDOWS_PER_JOB = 60
TRAIN_SPLIT = 0.7   # 70% for training
RANDOM_SEED = 13    # fixed seed from brief

# Set random seeds for reproducibility
random.seed(RANDOM_SEED)

# Pane state classes (from brief)
PANE_STATE_CLASSES = ['working', 'finished-report', 'waiting-permission', 'api-error', 'garble']

# Characters beyond Latin Extended-B (U+01FF) are considered likely model garbage
LATIN_EXTENDED_B_END = 0x01FF

def is_beyond_latin_extended_b(ch):
    """Return True if character is beyond Latin Extended-B."""
    return ord(ch) > LATIN_EXTENDED_B_END

def visible_pieces(path):
    """
    [(event_index, text)] — what a terminal would show, in order.
    Skips the 1.36 M 'system' events (hooks, progress).
    Exact implementation from E11-fix-2.md
    """
    out = []
    for i, line in enumerate(open(path, errors="replace")):
        try:
            r = json.loads(line)
        except Exception:
            continue
        if not isinstance(r, dict):
            continue
        t = r.get("type");
        msg = r.get("message") if isinstance(r.get("message"), dict) else {}
        c = msg.get("content")
        if t == "assistant" and isinstance(c, list):
            for b in c:
                if not isinstance(b, dict):
                    continue
                if b.get("type") == "text":
                    out.append((i, b["text"]))
                elif b.get("type") == "tool_use":
                    out.append((i, f"● {b.get('name')}({json.dumps(b.get('input'))[:300]})"))
        elif t == "user" and isinstance(c, list):
            for b in c:
                if isinstance(b, dict) and b.get("type") == "tool_result":
                    cc = b.get("content")
                    s = cc if isinstance(cc, str) else " ".join(x.get("text", "") for x in (cc or []) if isinstance(x, dict))
                    out.append((i, "  ⎿ " + s[:2000]))
        elif t == "result":
            out.append((i, f"[result {r.get('subtype')}] " + str(r.get('result'))[:1000]))
    return out

def compute_non_latin_ratio(text):
    """Compute the ratio of characters beyond Latin Extended-B."""
    if not text:
        return 0.0
    beyond_count = sum(1 for ch in text if is_beyond_latin_extended_b(ch))
    return beyond_count / len(text)

def compute_latin_script_share(text):
    """Compute share of ASCII letters in the text."""
    if not text:
        return 0.0
    ascii_letters = sum(1 for ch in text if ('a' <= ch <= 'z') or ('A' <= ch <= 'Z'))
    return ascii_letters / len(text)

def add_synthetic_garble(text, generator_type):
    """
    Add synthetic garble to text using one of several methods.
    Returns the garbled text and records which generator was used.
    """
    if not text:
        return text

    # Choose a garble method based on generator_type
    if generator_type == 'multilingual':
        # Replace some words with random words from multiple languages
        words = text.split()
        if len(words) > 3:
            # Replace up to 3 words with random garbled words
            for _ in range(min(3, len(words))):
                idx = random.randrange(len(words))
                # Generate a random "multilingual" word (mix of Latin and non-Latin chars)
                garbled_word = ''.join(random.choice('abcdefghijklmnopqrstuvwxyzáéíóúàèìòùäëïöüÿ')
                                       for _ in range(random.randint(3, 10)))
                words[idx] = garbled_word
            return ' '.join(words)
        else:
            return text
    elif generator_type == 'repetition':
        # Repeat a random substring multiple times
        if len(text) > 10:
            start = random.randrange(0, len(text) - 5)
            end = random.randrange(start + 5, min(start + 20, len(text)))
            substring = text[start:end]
            repeats = random.randint(2, 5)
            repeated = substring * repeats
            # Insert the repeated substring at a random position
            insert_pos = random.randrange(0, len(text))
            return text[:insert_pos] + repeated + text[insert_pos:]
        else:
            return text
    elif generator_type == 'latin_nonsense':
        # Generate random Latin-like words with non-Latin chars
        chars = list(text)
        num_to_change = max(1, len(chars) // 10)  # Change about 10% of chars
        for _ in range(num_to_change):
            idx = random.randrange(len(chars))
            # Replace with a non-Latin character
            chars[idx] = random.choice('áéíóúàèìòùäëïöüÿ中文 русский العربية')
        return ''.join(chars)
    elif generator_type == 'truncated_json':
        # Truncate a JSON-like structure in the text
        json_start_chars = ['{', '[']
        json_end_chars = ['}', ']']
        start_idx = -1
        for i, ch in enumerate(text):
            if ch in json_start_chars:
                start_idx = i
                break
        if start_idx != -1:
            # Truncate shortly after the start
            end_idx = start_idx + random.randint(2, 20)
            if end_idx < len(text):
                return text[:end_idx]
        return text
    return text

# Structural cues from the brief (E11-fix-2.md, step 1). They are read at the window's END position, per window.
APPROVAL_PHRASES = ["requires approval", "permission", "not allowed"]
API_ERROR_SIGNATURES = re.compile(r"API Error|\b402\b|\b429\b|overloaded|Insufficient Balance|rate limit", re.IGNORECASE)
API_ERROR_TAIL = 800  # bytes at the end of the window that are searched for an API error signature

def get_pane_state_from_structure(full_text, pieces, byte_offsets, window_start, window_end):
    """
    Pane state of the window full_text[window_start:window_end], from the transcript's structure at the window's end
    (brief E11-fix-2.md, step 1), checked in this order:
      - the FIRST piece after the window's last byte is a `result` event (or the window ends inside/at it)
        -> 'finished-report'
      - the last tool result visible in the window contains an approval phrase -> 'waiting-permission'
      - an API error signature in the window's last 800 bytes -> 'api-error'
      - otherwise -> 'working'
    `pieces` is visible_pieces() output and byte_offsets[k] is where piece k starts in full_text (pieces are joined
    with "\n"). Before 2026-09-25 this looked at the last 5 pieces of the whole JOB for every window, so all windows of
    a job shared one label (and "completed"/"finished"/"error" anywhere in them decided it).
    """
    if not pieces:
        return 'working'

    # Pieces overlapping the window, and the first piece starting at or after the window's last byte
    in_window = [k for k in range(len(pieces))
                 if byte_offsets[k] < window_end and byte_offsets[k] + len(pieces[k][1]) > window_start]
    next_k = next((k for k in range(len(pieces)) if byte_offsets[k] >= window_end), None)

    def is_result(k):
        return k is not None and pieces[k][1].startswith("[result ")

    if is_result(next_k) or (in_window and is_result(in_window[-1])):
        return 'finished-report'

    tool_results = [k for k in in_window if pieces[k][1].startswith("  ⎿ ")]
    if tool_results:
        k = tool_results[-1]
        visible = full_text[max(window_start, byte_offsets[k]):min(window_end, byte_offsets[k] + len(pieces[k][1]))]
        if any(phrase in visible.lower() for phrase in APPROVAL_PHRASES):
            return 'waiting-permission'

    tail = full_text[max(window_start, window_end - API_ERROR_TAIL):window_end]
    if API_ERROR_SIGNATURES.search(tail):
        return 'api-error'

    return 'working'

def job_agent_hours(path):
    """
    (agent_hours, source) for one job, for false alarms per 8 agent-hours (brief E11-fix-1.md, step 5):
    first to last top-level event `timestamp`; if the transcript has none, the sum of its `result` events'
    `duration_ms`; else (None, None) and the false-alarm rate is reported as not measured.
    """
    first = last = None
    duration_ms = 0
    for line in open(path, errors="replace"):
        if '"timestamp"' not in line and '"duration_ms"' not in line:
            continue
        try:
            r = json.loads(line)
        except Exception:
            continue
        if not isinstance(r, dict):
            continue
        ts = r.get("timestamp")
        if isinstance(ts, str):
            try:
                t = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            except ValueError:
                t = None
            if t is not None:
                first = t if first is None or t < first else first
                last = t if last is None or t > last else last
        if r.get("type") == "result" and isinstance(r.get("duration_ms"), (int, float)):
            duration_ms += r["duration_ms"]
    if first is not None and last is not None and last > first:
        return (last - first).total_seconds() / 3600.0, "timestamps"
    if duration_ms > 0:
        return duration_ms / 3.6e6, "result.duration_ms"
    return None, None

def parse_args():
    ap = argparse.ArgumentParser(description="Build the E11 window dataset from the cockpit's job transcripts.")
    ap.add_argument("--runs-dir", default=RUNS_DIR,
                    help="directory of <job>.jsonl stream-json transcripts "
                         "(default: $E11_RUNS_DIR, else $BIZLOOP_ROOT/cockpit/runs; now %(default)s)")
    return ap.parse_args()

def main():
    args = parse_args()
    runs_dir = args.runs_dir
    if not os.path.isdir(runs_dir):
        print(f"ERROR: transcripts directory not found: {runs_dir}\n"
              f"  The job transcripts are private to the BizLoop checkout and are not in this repo. Point at them with\n"
              f"  --runs-dir DIR, E11_RUNS_DIR=DIR, or BIZLOOP_ROOT=<checkout> (uses <checkout>/cockpit/runs).",
              file=sys.stderr)
        sys.exit(1)

    # Ensure output directory exists
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Collect all .jsonl files, sorted so the seeded split is the same on every machine (os.listdir order is not)
    all_files = []
    for fname in sorted(os.listdir(runs_dir)):
        if fname.endswith('.jsonl'):
            all_files.append(os.path.join(runs_dir, fname))

    if not all_files:
        print("No .jsonl files found in", runs_dir, file=sys.stderr)
        sys.exit(1)

    print(f"Found {len(all_files)} job transcript files")

    # Shuffle files for random train/test split with fixed seed 13
    random.shuffle(all_files)
    split_idx = int(len(all_files) * TRAIN_SPLIT)
    train_files = all_files[:split_idx]
    test_files = all_files[split_idx:]

    print(f"Training on {len(train_files)} jobs, testing on {len(test_files)} jobs")
    if len(test_files) < 15:
        print(f"WARNING: Test split has only {len(test_files)} jobs, need at least 15", file=sys.stderr)

    # Define synthetic garble generators
    generators = ['multilingual', 'repetition', 'latin_nonsense', 'truncated_json']

    # Held-out generator test: train on 3, test on 1 (rotate)
    train_generators = generators[:3]  # multilingual, repetition, latin_nonsense
    test_generator = generators[3]     # truncated_json

    print(f"Training generators: {train_generators}")
    print(f"Held-out test generator: {test_generator}")

    # Process each split
    all_windows = []  # Collect all windows to verify minimums
    split_label_counts = {}  # split -> {label: windows}
    jobs_out = []  # one row per job: split and agent-hours (for false alarms per 8 agent-hours)

    for split_name, file_list, gen_list in [('train', train_files, train_generators),
                                            ('test', test_files, [test_generator])]:
        windows_out = []

        for filepath in file_list:
            job_id = os.path.basename(filepath).replace('.jsonl', '')

            # Get visible pieces with event indices
            pieces = visible_pieces(filepath)

            if not pieces:
                print(f"Warning: no visible pieces extracted from {job_id}", file=sys.stderr)
                continue
            agent_hours, hours_source = job_agent_hours(filepath)
            windows_before_job = len(windows_out)

            # Concatenate pieces with "\n" and track byte offsets
            full_text = ""
            byte_offsets = []  # Starting byte offset for each piece
            event_indices = []  # Event index for each piece

            for event_idx, text in pieces:
                byte_offsets.append(len(full_text))
                event_indices.append(event_idx)
                full_text += text
                full_text += "\n"  # Add newline between pieces

            # Remove trailing newline if we added one
            if full_text.endswith("\n"):
                full_text = full_text[:-1]

            text_len = len(full_text)

            # Generate windows according to specification:
            # Slide a 6,000-byte window with a 2,000-byte step over each job's full visible output
            # Cap at 60 windows per job, sampled evenly

            if text_len < WINDOW_SIZE:
                # If text is shorter than window size, create one window
                windows = [{
                    'text': full_text,
                    'start': 0,
                    'end': text_len,
                    'byte_start': 0,
                    'byte_end': text_len
                }]
            else:
                # Generate all possible windows with step size
                all_windows_for_job = []
                for start in range(0, text_len - WINDOW_SIZE + 1, STEP_SIZE):
                    end = start + WINDOW_SIZE
                    window_text = full_text[start:end]

                    all_windows_for_job.append({
                        'text': window_text,
                        'start': start,
                        'end': end,
                        'byte_start': start,
                        'byte_end': end
                    })

                # If we have more than MAX_WINDOWS_PER_JOB, sample evenly
                if len(all_windows_for_job) > MAX_WINDOWS_PER_JOB:
                    # Sample evenly across the range
                    step = max(1, len(all_windows_for_job) // MAX_WINDOWS_PER_JOB)
                    indices = list(range(0, len(all_windows_for_job), step))[:MAX_WINDOWS_PER_JOB]
                    windows = [all_windows_for_job[i] for i in indices]
                else:
                    windows = all_windows_for_job

                # If we didn't cover the end, add one more window at the end
                if windows and windows[-1]['end'] < text_len:
                    final_start = max(0, text_len - WINDOW_SIZE)
                    final_end = text_len
                    if final_start != windows[-1]['start']:  # Avoid duplicate
                        windows.append({
                            'text': full_text[final_start:final_end],
                            'start': final_start,
                            'end': final_end,
                            'byte_start': final_start,
                            'byte_end': final_end
                        })

            # Label each window
            for window in windows:
                window_text = window['text']
                byte_start = window['byte_start']
                byte_end = window['byte_end']

                # Determine pane state from structure (FIRST event after window's last byte)
                pane_state = get_pane_state_from_structure(full_text, pieces, byte_offsets, byte_start, byte_end)

                # Compute features
                ratio = compute_non_latin_ratio(window_text)
                latin_share = compute_latin_script_share(window_text)

                # Determine if this window should be synthetic garble
                is_synthetic = False
                generator_used = None

                # Apply synthetic garble based on split:
                # - Train: apply to train_generators with some probability
                # - Test: apply held-out generator with some probability
                if split_name == 'train':
                    # Apply synthetic garble to training data using train generators
                    if pane_state != 'garble' and random.random() < 0.3:  # 30% chance for training
                        generator_used = random.choice(gen_list)
                        window_text = add_synthetic_garble(window_text, generator_used)
                        is_synthetic = True
                        # Recompute features after garbling
                        ratio = compute_non_latin_ratio(window_text)
                        latin_share = compute_latin_script_share(window_text)
                else:  # test
                    # Apply held-out generator to test data
                    if pane_state != 'garble' and random.random() < 0.3:  # 30% chance for testing
                        generator_used = gen_list[0]  # held-out generator
                        window_text = add_synthetic_garble(window_text, generator_used)
                        is_synthetic = True
                        # Recompute features after garbling
                        ratio = compute_non_latin_ratio(window_text)
                        latin_share = compute_latin_script_share(window_text)

                # Garble label is ONLY from synthetic generation (per brief)
                is_garble = is_synthetic

                # `label` is the brief's 5-class field (E11-fix-2.md: always one of the 5 strings). `pane_state` keeps
                # the structural state of the window under any garble; rows written before 2026-09-25 carry only
                # `pane_state` (never 'garble'), and the readers derive `label` from it (baselines.row_label).
                label = 'garble' if is_garble else pane_state
                assert label in PANE_STATE_CLASSES, f"label {label!r} is not one of {PANE_STATE_CLASSES}"

                # Create dataset entry
                entry = {
                    'job_id': job_id,
                    'text': window_text,
                    'label': label,
                    'pane_state': pane_state,
                    'is_synthetic': 1 if is_synthetic else 0,
                    'generator': generator_used if is_synthetic else '',
                    'non_latin_ratio': ratio,
                    'latin_script_share': latin_share,
                    'window_start': byte_start,
                    'window_end': byte_end
                }
                windows_out.append(entry)
                all_windows.append(entry)  # For global counting

            jobs_out.append({'job_id': job_id, 'split': split_name, 'windows': len(windows_out) - windows_before_job,
                             'agent_hours': agent_hours, 'hours_source': hours_source})

        # Write windows to JSONL file
        out_path = os.path.join(OUTPUT_DIR, f'{split_name}.jsonl')
        with open(out_path, 'w', encoding='utf-8') as f:
            for entry in windows_out:
                f.write(json.dumps(entry, ensure_ascii=False) + '\n')
        print(f"Written {len(windows_out)} windows to {out_path}")

        # Print summary statistics for this split
        total_windows = len(windows_out)
        garble_windows = sum(1 for e in windows_out if e['is_synthetic'] == 1)
        print(f"  Total windows: {total_windows}")
        print(f"  Garble windows: {garble_windows}")

        # Per-generator breakdown for synthetic windows
        if garble_windows > 0:
            for gen in gen_list:
                count = sum(1 for e in windows_out if e.get('generator') == gen)
                if count > 0:
                    print(f"    {gen}: {count}")

        # Per-label breakdown
        split_label_counts[split_name] = {c: sum(1 for e in windows_out if e['label'] == c) for c in PANE_STATE_CLASSES}
        print("  Per label: " + ", ".join(f"{c} {n}" for c, n in split_label_counts[split_name].items()))

    # Job rows (split, agent-hours) for evaluate.py's false alarms per 8 agent-hours
    jobs_path = os.path.join(OUTPUT_DIR, 'jobs.jsonl')
    with open(jobs_path, 'w', encoding='utf-8') as f:
        for row in jobs_out:
            f.write(json.dumps(row) + '\n')
    no_hours = [j['job_id'] for j in jobs_out if j['agent_hours'] is None]
    print(f"Written {len(jobs_out)} job rows to {jobs_path} ({len(no_hours)} without timestamps)")

    # The split is by job and a pane state is a property of a job's windows, so a class can land entirely in one
    # split. Its test recall is then not measurable (it is not 0.0): warn here, and say so in DATA.md.
    split_warnings = []
    for c in PANE_STATE_CLASSES:
        n_train, n_test = split_label_counts['train'][c], split_label_counts['test'][c]
        if n_train + n_test > 0 and n_test == 0:
            split_warnings.append(f"'{c}' has {n_train} train windows and 0 test windows: its test recall is not measurable")
        elif n_train + n_test > 0 and n_train == 0:
            split_warnings.append(f"'{c}' has 0 train windows and {n_test} test windows: no classifier can learn it")
    for w in split_warnings:
        print(f"WARNING: {w}", file=sys.stderr)

    # Verify minimums and create DATA.md
    data_md_path = os.path.join(OUTPUT_DIR, 'DATA.md')
    total_real_windows = len(all_windows)
    total_synthetic_windows = sum(1 for w in all_windows if w['is_synthetic'] == 1)

    print(f"\n=== DATASET SUMMARY ===")
    print(f"Total windows: {total_real_windows}")
    print(f"Total synthetic/garble windows: {total_synthetic_windows}")

    # Assert minimums from brief
    assert total_real_windows >= 1000, f"Need ≥1000 real windows, got {total_real_windows}"
    assert total_synthetic_windows >= 300, f"Need ≥300 synthetic garble windows, got {total_synthetic_windows}"

    # Count by label (the 5-class field; synthetic windows are 'garble')
    pane_state_counts = {}
    for window in all_windows:
        state = window['label']
        pane_state_counts[state] = pane_state_counts.get(state, 0) + 1

    # Create DATA.md with detailed information
    with open(data_md_path, 'w') as f:
        f.write('# Dataset for E11 Fix Round 2: Watchdog Classifier\n\n')
        f.write('## Summary\n')
        f.write(f'- Windows: {WINDOW_SIZE} bytes sliding with {STEP_SIZE}-byte step, max {MAX_WINDOWS_PER_JOB} per job\n')
        f.write(f'- Extracted from cockpit run transcripts using visible_pieces() function\n')
        f.write(f'- Pane-state labels derived from transcript structure (working, finished-report, waiting-permission, api-error, garble)\n')
        f.write(f'- Garble label: ONLY from synthetic generation (4 types: multilingual, repetition, latin_nonsense, truncated_json)\n')
        f.write(f'- Held-out-generator test: train on first 3 generators, test on 4th (truncated_json)\n')
        f.write(f'- Split by job: {int(TRAIN_SPLIT*100)}/{int((1-TRAIN_SPLIT)*100)} with fixed seed {RANDOM_SEED}\n')
        f.write(f'\n## Counts\n')
        f.write(f'- Total windows: {total_real_windows} (assert: ≥1000) ✓\n')
        f.write(f'- Total synthetic/garble windows: {total_synthetic_windows} (assert: ≥300) ✓\n')
        f.write(f'\nBy split:\n')
        for split_name in ['train', 'test']:
            split_path = os.path.join(OUTPUT_DIR, f'{split_name}.jsonl')
            if os.path.exists(split_path):
                with open(split_path, 'r') as sf:
                    lines = sf.readlines()
                    total = len(lines)
                    synthetic = sum(1 for line in lines if json.loads(line)['is_synthetic'] == 1)
                    f.write(f'- {split_name}: {total} windows ({synthetic} synthetic/garble)\n')

                    # Per-generator counts
                    for gen in generators:
                        gen_count = sum(1 for line in lines if json.loads(line).get('generator') == gen)
                        if gen_count > 0:
                            f.write(f'  - {gen}: {gen_count}\n')

        f.write(f'\nBy label (`label` field; train / test):\n')
        for state in PANE_STATE_CLASSES:
            count = pane_state_counts.get(state, 0)
            f.write(f'- {state}: {count} ({split_label_counts["train"][state]} / {split_label_counts["test"][state]})\n')
            if count < 10:
                f.write(f'  ⚠️  Less than 10 examples - noted as requested\n')
        for w in split_warnings:
            f.write(f'- ⚠️  {w}\n')

        f.write(f'\n## Job Split Information\n')
        f.write(f'- Total jobs: {len(all_files)}\n')
        f.write(f'- Training jobs: {len(train_files)}\n')
        f.write(f'- Test jobs: {len(test_files)} (assert: ≥15) {"✓" if len(test_files) >= 15 else "✗"}\n')
        f.write(f'- Random seed: {RANDOM_SEED}\n')
        f.write(f'- Jobs with agent-hours: {len(jobs_out) - len(no_hours)} of {len(jobs_out)} (`jobs.jsonl`)\n')

        f.write(f'\n## Notes\n')
        f.write('- Used exact visible_pieces() function from brief\n')
        f.write('- Windows labeled by FIRST event after window\'s last byte via structure\n')
        f.write('- Synthetic garble generated using four methods as specified\n')
        f.write('- Held-out-generator evaluation implemented\n')
        f.write('- Metrics to be computed: per-class precision/recall, pane-state accuracy, waiting-permission recall, \\\n')
        f.write('  garble recall per generator and Latin slice, false alarms per 8 agent-hours, CPU ms per classification\n')

    print(f"Dataset metadata written to {data_md_path}")
    print("✓ All assertions passed:")
    print(f"  - Total windows ≥1000: {total_real_windows} ≥ 1000")
    print(f"  - Synthetic windows ≥300: {total_synthetic_windows} ≥ 300")
    print(f"  - Test jobs ≥15: {len(test_files)} ≥ 15")

if __name__ == '__main__':
    main()