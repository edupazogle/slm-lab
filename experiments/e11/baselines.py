#!/usr/bin/env python3
"""
Baselines for E11: local watchdog classifier for the agent fleet.
Implements:
(0) today's heuristic (non-Latin ratio) reimplemented from tools/vf-fleet-watch
(1) a compression-ratio (zlib) + regex feature set with logistic regression
"""

import json
import os
import zlib
import re
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
import sys

# Configuration
DATA_DIR = "/home/edu/Public/bizloop/slm/experiments/e11/data"
MODEL_DIR = "/home/edu/Public/bizloop/slm/experiments/e11/models"
RESULTS_DIR = "/home/edu/Public/bizloop/slm/experiments/e11/results"

# Characters beyond Latin Extended-B (U+01FF) are considered likely model garbage
LATIN_EXTENDED_B_END = 0x01FF

def is_beyond_latin_extended_b(ch):
    """Return True if character is beyond Latin Extended-B."""
    return ord(ch) > LATIN_EXTENDED_B_END

def compute_non_latin_ratio(text):
    """Compute the ratio of characters beyond Latin Extended-B (today's heuristic)."""
    if not text:
        return 0.0
    beyond_count = sum(1 for ch in text if is_beyond_latin_extended_b(ch))
    return beyond_count / len(text)

def extract_features_zlib_regex(text):
    """
    Extract features for baseline (1):
    - zlib compression ratio
    - regex features: counts of various patterns
    """
    if not text:
        # Return zero features for empty text
        return [0.0] * 10  # 1 compression + 9 regex features

    features = []

    # 1. zlib compression ratio
    # Compression ratio = len(compressed) / len(original)
    # Lower ratio means more compressible (less random)
    try:
        compressed = zlib.compress(text.encode('utf-8'))
        compression_ratio = len(compressed) / len(text.encode('utf-8'))
    except:
        compression_ratio = 1.0  # worst case if compression fails
    features.append(compression_ratio)

    # 2-10. Regex features
    # Count various patterns that might indicate garble vs normal text

    # 2. Ratio of non-printable ASCII characters (control chars 0-31, 127)
    non_printable = sum(1 for ch in text if ord(ch) < 32 or ord(ch) == 127)
    features.append(non_printable / len(text))

    # 3. Ratio of digits
    digits = sum(1 for ch in text if ch.isdigit())
    features.append(digits / len(text))

    # 4. Ratio of uppercase letters
    uppercase = sum(1 for ch in text if ch.isupper())
    features.append(uppercase / len(text))

    # 5. Ratio of lowercase letters
    lowercase = sum(1 for ch in text if ch.islower())
    features.append(lowercase / len(text))

    # 6. Ratio of punctuation
    punctuation = sum(1 for ch in text if ch in '.,!?;:()[]{}"\'')
    features.append(punctuation / len(text))

    # 7. Ratio of whitespace
    whitespace = sum(1 for ch in text if ch.isspace())
    features.append(whitespace / len(text))

    # 8. Average word length (approximate)
    words = text.split()
    if words:
        avg_word_len = sum(len(w) for w in words) / len(words)
    else:
        avg_word_len = 0
    features.append(avg_word_len / 10.0)  # normalize by typical word length

    # 9. Ratio of repeated characters (sequences of 3+ same char)
    repeated_chars = 0
    i = 0
    while i < len(text) - 2:
        if text[i] == text[i+1] == text[i+2]:
            repeated_chars += 1
            # Skip ahead to avoid overlapping counts
            while i < len(text) - 1 and text[i] == text[i+1]:
                i += 1
        i += 1
    features.append(repeated_chars / len(text))

    # 10. Ratio of non-Latin-1 characters (beyond 0xFF)
    non_latin1 = sum(1 for ch in text if ord(ch) > 0xFF)
    features.append(non_latin1 / len(text))

    return features

def load_dataset(split):
    """Load dataset from JSONL file."""
    dataset_path = os.path.join(DATA_DIR, f'{split}.jsonl')
    texts = []
    labels = []

    with open(dataset_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                texts.append(entry['text'])
                # Label is 1 if synthetic garble, 0 otherwise
                labels.append(entry['is_synthetic'])
            except (json.JSONDecodeError, KeyError) as e:
                print(f"Error parsing line in {dataset_path}: {e}", file=sys.stderr)
                continue

    return texts, np.array(labels)

def evaluate_baseline_0(texts, labels):
    """Evaluate baseline (0): today's heuristic (non-Latin ratio)."""
    # Use threshold of 0.15 as in tools/vf-fleet-watch
    threshold = 0.15
    predictions = []
    for text in texts:
        ratio = compute_non_latin_ratio(text)
        predictions.append(1 if ratio > threshold else 0)
    predictions = np.array(predictions)

    # Calculate metrics
    from sklearn.metrics import precision_score, recall_score, f1_score, accuracy_score

    accuracy = accuracy_score(labels, predictions)
    precision = precision_score(labels, predictions, zero_division=0)
    recall = recall_score(labels, predictions, zero_division=0)
    f1 = f1_score(labels, predictions, zero_division=0)

    return {
        'accuracy': accuracy,
        'precision': precision,
        'recall': recall,
        'f1': f1,
        'predictions': predictions
    }

def evaluate_baseline_1(texts, labels):
    """Evaluate baseline (1): zlib + regex features with logistic regression."""
    # Extract features
    features_list = []
    for text in texts:
        features = extract_features_zlib_regex(text)
        features_list.append(features)

    X = np.array(features_list)
    y = labels

    # Check if we have at least 2 classes
    if len(np.unique(y)) < 2:
        # Only one class present, return dummy metrics
        # All predictions will be the majority class
        maj_class = np.bincount(y).argmax() if len(y) > 0 else 0
        predictions = np.full_like(y, maj_class)

        # Calculate metrics
        from sklearn.metrics import precision_score, recall_score, f1_score, accuracy_score

        accuracy = accuracy_score(y, predictions)
        precision = precision_score(y, predictions, zero_division=0)
        recall = recall_score = recall_score(y, predictions, zero_division=0)
        f1 = f1_score(y, predictions, zero_division=0)

        return {
            'accuracy': accuracy,
            'precision': precision,
            'recall': recall,
            'f1': f1,
            'predictions': predictions,
            'model': None,
            'scaler': None
        }

    # Standardize features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Train logistic regression
    clf = LogisticRegression(random_state=42, max_iter=1000)
    clf.fit(X_scaled, y)

    # Predict
    predictions = clf.predict(X_scaled)

    # Calculate metrics
    from sklearn.metrics import precision_score, recall_score, f1_score, accuracy_score

    accuracy = accuracy_score(y, predictions)
    precision = precision_score(y, predictions, zero_division=0)
    recall = recall_score(y, predictions, zero_division=0)
    f1 = f1_score(y, predictions, zero_division=0)

    return {
        'accuracy': accuracy,
        'precision': precision,
        'recall': recall,
        'f1': f1,
        'predictions': predictions,
        'model': clf,
        'scaler': scaler
    }

def main():
    # Ensure directories exist
    os.makedirs(MODEL_DIR, exist_ok=True)
    os.makedirs(RESULTS_DIR, exist_ok=True)

    # Load datasets
    print("Loading datasets...")
    train_texts, train_labels = load_dataset('train')
    test_texts, test_labels = load_dataset('test')

    print(f"Train: {len(train_texts)} samples ({sum(train_labels)} garble)")
    print(f"Test: {len(test_texts)} samples ({sum(test_labels)} garble)")

    # Evaluate baseline 0 on train and test
    print("\n=== Baseline 0: Today's heuristic (non-Latin ratio) ===")
    train_metrics_0 = evaluate_baseline_0(train_texts, train_labels)
    test_metrics_0 = evaluate_baseline_0(test_texts, test_labels)

    print("Train:")
    print(f"  Accuracy: {train_metrics_0['accuracy']:.4f}")
    print(f"  Precision: {train_metrics_0['precision']:.4f}")
    print(f"  Recall: {train_metrics_0['recall']:.4f}")
    print(f"  F1: {train_metrics_0['f1']:.4f}")

    print("Test:")
    print(f"  Accuracy: {test_metrics_0['accuracy']:.4f}")
    print(f"  Precision: {test_metrics_0['precision']:.4f}")
    print(f"  Recall: {test_metrics_0['recall']:.4f}")
    print(f"  F1: {test_metrics_0['f1']:.4f}")

    # Evaluate baseline 1 on train and test
    print("\n=== Baseline 1: zlib + regex + logistic regression ===")
    train_metrics_1 = evaluate_baseline_1(train_texts, train_labels)
    test_metrics_1 = evaluate_baseline_1(test_texts, test_labels)

    print("Train:")
    print(f"  Accuracy: {train_metrics_1['accuracy']:.4f}")
    print(f"  Precision: {train_metrics_1['precision']:.4f}")
    print(f"  Recall: {train_metrics_1['recall']:.4f}")
    print(f"  F1: {train_metrics_1['f1']:.4f}")

    print("Test:")
    print(f"  Accuracy: {test_metrics_1['accuracy']:.4f}")
    print(f"  Precision: {test_metrics_1['precision']:.4f}")
    print(f"  Recall: {test_metrics_1['recall']:.4f}")
    print(f"  F1: {test_metrics_1['f1']:.4f}")

    # Save results
    results = {
        'baseline_0': {
            'train': {k: v for k, v in train_metrics_0.items() if k not in ['predictions']},
            'test': {k: v for k, v in test_metrics_0.items() if k not in ['predictions']}
        },
        'baseline_1': {
            'train': {k: v for k, v in train_metrics_1.items() if k not in ['predictions', 'model', 'scaler']},
            'test': {k: v for k, v in test_metrics_1.items() if k not in ['predictions', 'model', 'scaler']}
        }
    }

    import json
    results_path = os.path.join(RESULTS_DIR, 'baselines_results.json')
    with open(results_path, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to {results_path}")

    # Save models for baseline 1
    import pickle
    model_path = os.path.join(MODEL_DIR, 'baseline_1_model.pkl')
    scaler_path = os.path.join(MODEL_DIR, 'baseline_1_scaler.pkl')
    with open(model_path, 'wb') as f:
        pickle.dump(train_metrics_1['model'], f)
    with open(scaler_path, 'wb') as f:
        pickle.dump(train_metrics_1['scaler'], f)
    print(f"Baseline 1 model saved to {model_path}")
    print(f"Baseline 1 scaler saved to {scaler_path}")

if __name__ == '__main__':
    main()