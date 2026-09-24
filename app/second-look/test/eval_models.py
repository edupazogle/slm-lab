import sys, json, numpy as np, onnxruntime as ort
from tokenizers import BertWordPieceTokenizer
D = sys.argv[1]; M = D + "/models/"
tok = BertWordPieceTokenizer(M + "xtremedistil/vocab.txt", lowercase=True)
nli = ort.InferenceSession(M + "xtremedistil/model_quantized.onnx"); emb = ort.InferenceSession(M + "minilm/model_quantized.onnx")
C = json.load(open(D + "/cases.json"))
def pad(rows, L): return [r + [0]*(L-len(r)) for r in rows]
def nli_logits(p, hs):
    es = [tok.encode(p, h) for h in hs]; L = max(len(e.ids) for e in es)
    f = {"input_ids": np.array(pad([e.ids for e in es], L), np.int64), "attention_mask": np.array(pad([[1]*len(e.ids) for e in es], L), np.int64), "token_type_ids": np.array(pad([e.type_ids for e in es], L), np.int64)}
    return nli.run(None, f)[0]
def p_yes(p, hs):  # ensemble: mean of entailment probability over paraphrases
    l = nli_logits(p, hs); e = np.exp(l - l.max(1, keepdims=True)); return float((e[:, 0] / e.sum(1)).mean())
def embed(texts):
    es = [tok.encode(t) for t in texts]; L = max(len(e.ids) for e in es)
    ids = np.array(pad([e.ids for e in es], L), np.int64); am = np.array(pad([[1]*len(e.ids) for e in es], L), np.int64)
    f = {"input_ids": ids, "attention_mask": am, "token_type_ids": np.zeros_like(ids)}
    names = {i.name for i in emb.get_inputs()}; f = {k: v for k, v in f.items() if k in names}
    h = emb.run(None, f)[0]; m = am[..., None]; v = (h*m).sum(1)/m.sum(1); return v/np.linalg.norm(v, axis=1, keepdims=True)
def auc(scores, y):
    pos = [s for s, t in zip(scores, y) if t]; neg = [s for s, t in zip(scores, y) if not t]
    return sum((a > b) + 0.5*(a == b) for a in pos for b in neg) / (len(pos)*len(neg))
