#!/usr/bin/env python3
"""
Evaluation script for E11 fix: local watchdog classifier for the agent fleet.
Calculates all required metrics from the dataset files. Every model is fitted on the train split and scored on the
test split (same split, same seed for every system).

Step 3 (brief E11-step-3.md): when data/lm_scores.jsonl exists (written by lm_feature.py), it also evaluates
Baseline 2 = Baseline 1's features + the small-LM garble score, with the same metrics, and applies the kill rule:
Baseline 2 is kept only if it beats Baseline 1 by MORE than 2 points of garble recall, with false alarms per
8 agent-hours <= 1 and <= 1 s CPU per poll (the LM score's own ms included).

    python3 evaluate.py                # Baseline 1, plus Baseline 2 if data/lm_scores.jsonl exists
    python3 evaluate.py --no-lm        # Baseline 1 only
"""

import argparse
import json
import os
import sys
import time
import numpy as np
from datetime import datetime
from pathlib import Path
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import recall_score

from baselines import PANE_STATE_CLASSES, row_label, build_features, evaluate_baseline_1

# Configuration (paths relative to this script)
HERE = Path(__file__).resolve().parent
DATA_DIR = str(HERE / "data")
RESULTS_DIR = str(HERE / "results")
LM_SCORES_PATH = os.path.join(DATA_DIR, "lm_scores.jsonl")
JOBS_PATH = os.path.join(DATA_DIR, "jobs.jsonl")

HELD_OUT_GENERATOR = 'truncated_json'
CPU_TIMING_WINDOWS = 200          # CPU ms per classification = median over this many test windows
KILL_RULE_POINTS = 0.02           # plan: "if the compression + regex baseline comes within 2 points, keep the baseline"
MAX_FALSE_ALARMS_PER_8H = 1.0     # pass bar
MAX_CPU_MS_PER_POLL = 1000.0      # pass bar: <= 1 s CPU per poll
NOT_MEASURABLE = "not measurable (0 test windows)"

def load_dataset(split):
    """Load dataset from JSONL file. Fails loudly if the file is missing or empty (preface rule 7)."""
    dataset_path = os.path.join(DATA_DIR, f'{split}.jsonl')
    if not os.path.exists(dataset_path) or os.path.getsize(dataset_path) == 0:
        print(f"ERROR: {dataset_path} is missing or empty (run build_dataset.py first)", file=sys.stderr)
        sys.exit(1)
    texts = []
    labels = []
    generators = []
    pane_states = []
    latin_shares = []
    job_ids = []
    window_ids = []

    with open(dataset_path, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f):
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                texts.append(entry['text'])
                labels.append(entry['is_synthetic'])  # 1 for synthetic garble, 0 otherwise
                generators.append(entry.get('generator', ''))
                pane_states.append(row_label(entry))  # 5-class label; reads old rows (`pane_state` only) too
                latin_shares.append(entry.get('latin_script_share', 0.0))
                job_ids.append(entry.get('job_id', ''))
                window_ids.append(f"{split}_{line_num}")  # same id as lm_feature.py's cache
            except (json.JSONDecodeError, KeyError) as e:
                print(f"Error parsing line in {dataset_path}: {e}", file=sys.stderr)
                continue

    return {
        'texts': texts,
        'labels': np.array(labels),
        'generators': generators,
        'pane_states': np.array(pane_states),
        'latin_shares': latin_shares,
        'job_ids': job_ids,
        'window_ids': window_ids
    }

def load_jobs():
    """Job rows written by build_dataset.py (split, agent_hours); None when the dataset predates them."""
    if not os.path.exists(JOBS_PATH):
        return None
    with open(JOBS_PATH, 'r', encoding='utf-8') as f:
        return {row['job_id']: row for row in (json.loads(line) for line in f if line.strip())}

def load_lm_scores(path):
    """{window_id: row} from lm_feature.py's cache."""
    rows = {}
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                row = json.loads(line)
                rows[row['window_id']] = row
    return rows

def calculate_per_class_metrics(y_true, y_pred, class_names=['non-garble', 'garble']):
    """Calculate precision, recall, f1 for each class."""
    from sklearn.metrics import precision_score, recall_score, f1_score

    metrics = {}
    for i, class_name in enumerate(class_names):
        # Binary classification for this class vs all others
        y_true_binary = (y_true == i).astype(int)
        y_pred_binary = (y_pred == i).astype(int)

        precision = precision_score(y_true_binary, y_pred_binary, zero_division=0)
        recall = recall_score(y_true_binary, y_pred_binary, zero_division=0)
        f1 = f1_score(y_true_binary, y_pred_binary, zero_division=0)

        metrics[class_name] = {
            'precision': precision,
            'recall': recall,
            'f1': f1
        }

    return metrics

def label_counts(pane_states):
    return {c: int(np.sum(pane_states == c)) for c in PANE_STATE_CLASSES}

def check_label_counts(train_counts, test_counts):
    """Print per-class window counts per split; warn for any class a job-level split left out of the test set."""
    print("Windows per label (train / test):")
    for c in PANE_STATE_CLASSES:
        print(f"  {c}: {train_counts[c]} / {test_counts[c]}")
    warnings = []
    for c in PANE_STATE_CLASSES:
        if test_counts[c] == 0:
            warnings.append(f"'{c}' has 0 test windows ({train_counts[c]} in train): its recall is {NOT_MEASURABLE}")
    for w in warnings:
        print(f"WARNING: {w}", file=sys.stderr)
    return warnings

def fit_pane_state_classifier(X_train, y_train):
    """Multinomial logistic regression over the 5 labels, on the same features as the garble classifier."""
    scaler = StandardScaler()
    clf = LogisticRegression(random_state=42, max_iter=1000)
    clf.fit(scaler.fit_transform(X_train), y_train)
    return clf, scaler

def calculate_pane_state_accuracy(y_true, y_pred):
    """5-class accuracy over the `label` field (before 2026-09-25 this was the binary garble accuracy)."""
    return float(np.mean(y_true == y_pred))

def calculate_pane_state_per_class(y_true, y_pred):
    """Per-label precision/recall on the test split; recall is NOT_MEASURABLE for a label with no test windows."""
    from sklearn.metrics import precision_score
    out = {}
    for c in PANE_STATE_CLASSES:
        n = int(np.sum(y_true == c))
        t, p = (y_true == c).astype(int), (y_pred == c).astype(int)
        out[c] = {
            'test_windows': n,
            'precision': precision_score(t, p, zero_division=0) if p.sum() else 'not measurable (never predicted)',
            'recall': recall_score(t, p, zero_division=0) if n else NOT_MEASURABLE
        }
    return out

def calculate_waiting_permission_recall(y_true, y_pred):
    """Recall of the 'waiting-permission' label (it was a hard-coded 0.0 placeholder before 2026-09-25)."""
    mask = y_true == 'waiting-permission'
    if not np.any(mask):
        return NOT_MEASURABLE
    return float(np.mean(y_pred[mask] == 'waiting-permission'))

def calculate_garble_recall_by_generator(y_true, y_pred, generators):
    """Calculate garble recall for each generator."""
    from sklearn.metrics import recall_score

    recall_by_gen = {}
    unique_gens = set(generators)

    for gen in unique_gens:
        if gen == '':  # Skip empty generators (non-synthetic)
            continue

        # Find indices where this generator was used
        gen_indices = [i for i, g in enumerate(generators) if g == gen]
        if not gen_indices:
            recall_by_gen[gen] = 0.0
            continue

        # Extract true labels and predictions for this generator
        y_true_gen = y_true[gen_indices]
        y_pred_gen = y_pred[gen_indices]

        # Calculate recall for garble class (class 1)
        if np.sum(y_true_gen) == 0:  # No positive samples
            recall_by_gen[gen] = 0.0
        else:
            recall = recall_score(y_true_gen, y_pred_gen, zero_division=0)
            recall_by_gen[gen] = recall

    return recall_by_gen

def calculate_latin_slice_recall(y_true, y_pred, latin_shares, threshold=0.5):
    """Calculate garble recall on Latin-script slice (high latin_script_share)."""
    from sklearn.metrics import recall_score

    # Latin slice: high share of ASCII letters
    latin_mask = np.array(latin_shares) >= threshold

    if not np.any(latin_mask):
        return NOT_MEASURABLE

    y_true_latin = y_true[latin_mask]
    y_pred_latin = y_pred[latin_mask]

    if np.sum(y_true_latin) == 0:  # No positive samples in Latin slice
        return NOT_MEASURABLE

    recall = recall_score(y_true_latin, y_pred_latin, zero_division=0)
    return recall

def calculate_held_out_generator_recall(y_true, y_pred, generators, held_out_generator):
    """Calculate garble recall for held-out generator."""
    from sklearn.metrics import recall_score

    # Find indices where held-out generator was used
    held_out_indices = [i for i, g in enumerate(generators) if g == held_out_generator]
    if not held_out_indices:
        return NOT_MEASURABLE

    y_true_held = y_true[held_out_indices]
    y_pred_held = y_pred[held_out_indices]

    if np.sum(y_true_held) == 0:  # No positive samples
        return NOT_MEASURABLE

    recall = recall_score(y_true_held, y_pred_held, zero_division=0)
    return recall

def calculate_false_alarms_per_8h(y_true, y_pred, job_ids, jobs):
    """
    False alarms per 8 agent-hours (brief E11-fix-1.md, step 5):
    (garble false positives on the test jobs) / (test jobs' agent-hours from first to last event timestamp) x 8.
    Agent-hours come from data/jobs.jsonl (build_dataset.py). Before 2026-09-25 this was fp_rate x 800, a placeholder.
    """
    if jobs is None:
        return "not measured (no data/jobs.jsonl: rebuild the dataset with build_dataset.py)"
    test_jobs = sorted(set(job_ids))
    missing = [j for j in test_jobs if jobs.get(j, {}).get('agent_hours') is None]
    if missing:
        return f"not measured ({len(missing)} of {len(test_jobs)} test jobs have no timestamps)"
    hours = sum(jobs[j]['agent_hours'] for j in test_jobs)
    if hours <= 0:
        return "not measured (test jobs span 0 agent-hours)"
    false_positives = int(np.sum((y_pred == 1) & (y_true == 0)))
    return false_positives / hours * 8

def calculate_cpu_ms_per_classification(texts, garble_model, garble_scaler, pane_model, pane_scaler, extra=None):
    """
    CPU ms to classify one window (features + both classifiers), median over CPU_TIMING_WINDOWS test windows.
    The LM score's own time is not in here: lm_feature.py measures it per window and it is added per poll.
    """
    timings = []
    for i, text in enumerate(texts[:CPU_TIMING_WINDOWS]):
        t0 = time.process_time_ns()
        X = build_features([text], None if extra is None else [extra[i]])
        garble_model.predict(garble_scaler.transform(X))
        pane_model.predict(pane_scaler.transform(X))
        timings.append((time.process_time_ns() - t0) / 1e6)
    return float(np.median(timings)) if timings else NOT_MEASURABLE

def evaluate_shuffled_predictions(y_true):
    """Evaluate deliberately shuffled predictions to prove a metric can fail."""
    from sklearn.metrics import recall_score

    # Create shuffled predictions (random, seeded)
    y_pred_shuffled = np.random.default_rng(13).permutation(y_true)

    # Calculate recall for garble class
    recall_shuffled = recall_score(y_true, y_pred_shuffled, zero_division=0)

    return recall_shuffled

def evaluate_system(name, train_data, test_data, jobs, extra_train=None, extra_test=None):
    """Fit on train, score test: the garble classifier (binary) and the pane-state classifier (5 labels)."""
    print(f"\n=== {name} ===")
    train_metrics = evaluate_baseline_1(train_data['texts'], train_data['labels'], extra=extra_train)
    if train_metrics['model'] is None:
        print("ERROR: the train split holds one class only; the garble classifier cannot be fitted", file=sys.stderr)
        sys.exit(1)
    test_metrics = evaluate_baseline_1(test_data['texts'], test_data['labels'], extra=extra_test,
                                       model=train_metrics['model'], scaler=train_metrics['scaler'])
    y_test_true = test_data['labels']
    y_test_pred = test_metrics['predictions']

    pane_model, pane_scaler = fit_pane_state_classifier(build_features(train_data['texts'], extra_train),
                                                        train_data['pane_states'])
    pane_pred = pane_model.predict(pane_scaler.transform(build_features(test_data['texts'], extra_test)))

    # Per-class precision/recall
    class_metrics = calculate_per_class_metrics(y_test_true, y_test_pred)
    print("Per-class precision/recall (garble classifier):")
    for class_name, metrics in class_metrics.items():
        print(f"  {class_name}: precision {metrics['precision']:.4f}, recall {metrics['recall']:.4f}, "
              f"F1 {metrics['f1']:.4f}")

    pane_state_acc = calculate_pane_state_accuracy(test_data['pane_states'], pane_pred)
    pane_per_class = calculate_pane_state_per_class(test_data['pane_states'], pane_pred)
    wp_recall = calculate_waiting_permission_recall(test_data['pane_states'], pane_pred)
    garble_recall_overall = recall_score(y_test_true, y_test_pred, zero_division=0)
    recall_by_gen = calculate_garble_recall_by_generator(y_test_true, y_test_pred, test_data['generators'])
    latin_slice_recall = calculate_latin_slice_recall(y_test_true, y_test_pred, test_data['latin_shares'])
    held_out_recall = calculate_held_out_generator_recall(y_test_true, y_test_pred, test_data['generators'],
                                                          HELD_OUT_GENERATOR)
    false_alarms_per_8h = calculate_false_alarms_per_8h(y_test_true, y_test_pred, test_data['job_ids'], jobs)
    cpu_ms = calculate_cpu_ms_per_classification(test_data['texts'], train_metrics['model'], train_metrics['scaler'],
                                                 pane_model, pane_scaler, extra_test)
    shuffled_recall = evaluate_shuffled_predictions(y_test_true)

    fmt = lambda v: f"{v:.4f}" if isinstance(v, float) else str(v)
    print(f"Pane-state accuracy (5 labels): {pane_state_acc:.4f}")
    print(f"Waiting-permission recall: {fmt(wp_recall)}")
    print(f"Garble recall overall: {garble_recall_overall:.4f}")
    for gen, recall in recall_by_gen.items():
        print(f"  {gen}: {recall:.4f}")
    print(f"Garble recall on Latin-script slice: {fmt(latin_slice_recall)}")
    print(f"Garble recall on held-out generator ({HELD_OUT_GENERATOR}): {fmt(held_out_recall)}")
    print(f"False alarms per 8 agent-hours: {fmt(false_alarms_per_8h)}")
    print(f"CPU ms per classification (features + classifiers): {fmt(cpu_ms)}")
    print(f"Garble recall with shuffled predictions: {shuffled_recall:.4f} "
          f"(drop {garble_recall_overall - shuffled_recall:.4f})")

    return {
        'per_class_metrics': class_metrics,
        'pane_state_accuracy': pane_state_acc,
        'pane_state_per_class': pane_per_class,
        'waiting_permission_recall': wp_recall,
        'garble_recall_overall': garble_recall_overall,
        'garble_recall_by_generator': recall_by_gen,
        'garble_recall_latin_slice': latin_slice_recall,
        'garble_recall_held_out_generator': held_out_recall,
        'false_alarms_per_8_agent_hours': false_alarms_per_8h,
        'cpu_ms_per_classification': cpu_ms,
        'shuffled_prediction_recall': shuffled_recall,
        'recall_drop_from_shuffling': garble_recall_overall - shuffled_recall
    }

def apply_kill_rule(b1, b2):
    """Plan's kill rule + step-3 conditions: keep the LM feature only if it wins by MORE than 2 points of garble
    recall, keeps false alarms per 8 agent-hours <= 1, and stays <= 1 s CPU per poll."""
    gain = b2['garble_recall_overall'] - b1['garble_recall_overall']
    fa = b2['false_alarms_per_8_agent_hours']
    cpu = b2['cpu_ms_per_poll']
    if gain <= KILL_RULE_POINTS:
        decision = (f"keep Baseline 1, drop the LM feature: garble recall {gain * 100:+.1f} points, "
                    f"not more than the kill rule's 2 points")
    elif not isinstance(cpu, float) or cpu > MAX_CPU_MS_PER_POLL:
        decision = f"drop the LM feature: {cpu} CPU ms per poll exceeds {MAX_CPU_MS_PER_POLL:.0f}"
    elif not isinstance(fa, float):
        decision = (f"undecided: the LM feature gains {gain * 100:+.1f} points of garble recall, "
                    f"but false alarms per 8 agent-hours are {fa}")
    elif fa > MAX_FALSE_ALARMS_PER_8H:
        decision = f"drop the LM feature: {fa:.2f} false alarms per 8 agent-hours exceeds {MAX_FALSE_ALARMS_PER_8H}"
    else:
        decision = f"keep Baseline 2 (LM feature): {gain * 100:+.1f} points of garble recall, within FA and CPU bars"
    return {'garble_recall_gain_points': gain * 100, 'decision': decision}

def parse_args():
    ap = argparse.ArgumentParser(description="E11: fit on train, score test; Baseline 1 and (optional) Baseline 2.")
    ap.add_argument("--lm-scores", default=LM_SCORES_PATH,
                    help="lm_feature.py's cache; Baseline 2 is evaluated when it exists (default: %(default)s)")
    ap.add_argument("--no-lm", action="store_true", help="evaluate Baseline 1 only")
    return ap.parse_args()

def main():
    args = parse_args()
    # Ensure results directory exists
    os.makedirs(RESULTS_DIR, exist_ok=True)

    # Load datasets
    print("Loading datasets...")
    train_data = load_dataset('train')
    test_data = load_dataset('test')
    jobs = load_jobs()

    print(f"Train: {len(train_data['texts'])} samples ({sum(train_data['labels'])} garble)")
    print(f"Test: {len(test_data['texts'])} samples ({sum(test_data['labels'])} garble)")
    train_counts, test_counts = label_counts(train_data['pane_states']), label_counts(test_data['pane_states'])
    count_warnings = check_label_counts(train_counts, test_counts)
    load_1m = os.getloadavg()[0]
    print(f"Machine load (1 min): {load_1m:.2f}")

    b1 = evaluate_system("Baseline 1: zlib + regex + logistic regression", train_data, test_data, jobs)
    b1['cpu_ms_per_poll'] = b1['cpu_ms_per_classification']

    # Baseline 2: the same features + the LM garble score (step 3), when lm_feature.py has scored every window
    b2 = None
    kill_rule = None
    if args.no_lm:
        b2 = "not measured (--no-lm)"
    elif not os.path.exists(args.lm_scores):
        b2 = f"not measured (no {args.lm_scores}: run lm_feature.py first)"
    else:
        lm = load_lm_scores(args.lm_scores)
        ids = train_data['window_ids'] + test_data['window_ids']
        missing = [i for i in ids if i not in lm]
        if missing:
            print(f"ERROR: {len(missing)} of {len(ids)} windows have no LM score in {args.lm_scores} "
                  f"(first: {missing[0]}); run lm_feature.py until it reports every window scored", file=sys.stderr)
            sys.exit(1)
        models = sorted({lm[i].get('model') for i in ids})
        lm_cpu = float(np.median([lm[i]['ms_cpu'] for i in test_data['window_ids']]))
        lm_wall = float(np.median([lm[i]['ms_wall'] for i in test_data['window_ids']]))
        b2 = evaluate_system(f"Baseline 2: Baseline 1 + LM garble score ({', '.join(models)})", train_data,
                             test_data, jobs,
                             extra_train=[lm[i]['lm_score'] for i in train_data['window_ids']],
                             extra_test=[lm[i]['lm_score'] for i in test_data['window_ids']])
        b2['lm_model'] = models[0] if len(models) == 1 else models
        b2['lm_cpu_ms_per_window_median'] = lm_cpu
        b2['lm_wall_ms_per_window_median'] = lm_wall
        b2['cpu_ms_per_poll'] = b2['cpu_ms_per_classification'] + lm_cpu
        print(f"LM score per window (median over test windows): {lm_cpu:.1f} CPU ms, {lm_wall:.1f} wall ms")
        print(f"CPU ms per poll with the LM feature: {b2['cpu_ms_per_poll']:.1f}")
        kill_rule = apply_kill_rule(b1, b2)
        print(f"\nKill rule: {kill_rule['decision']}")

    # Save comprehensive results ('test_set' is Baseline 1, as before)
    comprehensive_results = {
        'evaluated_at': datetime.now().isoformat(timespec='seconds'),
        'machine_load_1min': load_1m,
        'windows_per_label': {'train': train_counts, 'test': test_counts},
        'label_count_warnings': count_warnings,
        'test_set': b1,
        'baseline_2': b2,
        'kill_rule': kill_rule
    }

    # Save to file
    output_path = os.path.join(RESULTS_DIR, 'comprehensive_results.json')
    with open(output_path, 'w') as f:
        json.dump(comprehensive_results, f, indent=2)
    print(f"\nComprehensive results saved to {output_path}")

    # Also save a summary for easy reading: Baseline 1 at the top level as before, Baseline 2 under 'baseline_2'
    summary_keys = ['garble_recall_overall', 'garble_recall_latin_slice', 'false_alarms_per_8_agent_hours',
                    'pane_state_accuracy', 'waiting_permission_recall', 'cpu_ms_per_classification', 'cpu_ms_per_poll']
    summary = {k: b1[k] for k in summary_keys}
    summary['test_windows_per_label'] = test_counts
    if isinstance(b2, dict):
        summary['baseline_2'] = {k: b2[k] for k in summary_keys + ['lm_model', 'lm_cpu_ms_per_window_median',
                                                                   'lm_wall_ms_per_window_median']}
        summary['kill_rule'] = kill_rule
    else:
        summary['baseline_2'] = b2
    summary_path = os.path.join(RESULTS_DIR, 'summary.json')
    with open(summary_path, 'w') as f:
        json.dump(summary, f, indent=2)
    print(f"Summary saved to {summary_path}")

if __name__ == '__main__':
    main()
