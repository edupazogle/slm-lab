"""Throughput benchmark done properly (phase-1's was not).

Phase 1 reported completion_tokens / total wall time, n=1, no warm-up, with the GGUF mmapped from
/mnt/e (NTFS over 9p). This separates load, prefill and decode, warms up, repeats, and compares
storage locations and thread counts.
"""
import json, sys, time, statistics as st, gc, os
from llama_cpp import Llama, llama_print_system_info

PROMPT = ("You are an insurance claims assistant. " + "The policyholder reported water damage in the kitchen after a pipe burst. " * 30
          + "\nSummarise the situation in one sentence.")
def run(path, n_threads, use_mmap, label, reps=3, gen=128):
    t0 = time.perf_counter()
    llm = Llama(model_path=path, n_ctx=2048, n_threads=n_threads, n_threads_batch=n_threads, use_mmap=use_mmap, verbose=False)
    load_s = time.perf_counter() - t0
    llm.create_completion("Hello", max_tokens=8)                      # warm-up
    n_prompt = len(llm.tokenize(PROMPT.encode()))
    prefill, decode, ttft = [], [], []
    for i in range(reps):
        llm.reset()
        t0 = time.perf_counter(); first = None; n = 0
        for _ in llm.create_completion(PROMPT + f" (run {i})", max_tokens=gen, stream=True, temperature=0.0):
            n += 1
            if first is None: first = time.perf_counter()
        end = time.perf_counter()
        ttft.append(first - t0); prefill.append(n_prompt / (first - t0))
        if n > 1: decode.append((n - 1) / (end - first))
    del llm; gc.collect()
    m = lambda x: round(st.mean(x), 1); s = lambda x: round(st.pstdev(x), 1)
    return {"label": label, "threads": n_threads, "mmap": use_mmap, "load_s": round(load_s, 2), "prompt_tokens": n_prompt,
            "prefill_tok_s": m(prefill), "prefill_sd": s(prefill), "decode_tok_s": m(decode), "decode_sd": s(decode),
            "ttft_s": round(st.mean(ttft), 2), "reps": reps}

EXT4 = os.path.expanduser("~/.cache/slm-models/qwen2.5-1.5b-instruct-q4_k_m.gguf")
NINEP = "/mnt/e/VF/gguf-models/qwen2.5-1.5b/qwen2.5-1.5b-instruct-q4_k_m.gguf"
out = {"system_info": llama_print_system_info().decode(errors="ignore"), "model": "Qwen2.5-1.5B-Instruct Q4_K_M", "runs": []}
for path, label in [(EXT4, "ext4"), (NINEP, "9p:/mnt/e")]:
    for th in (8, 16):
        r = run(path, th, True, label); out["runs"].append(r); print(json.dumps(r), flush=True)
r = run(NINEP, 8, False, "9p:/mnt/e no-mmap"); out["runs"].append(r); print(json.dumps(r), flush=True)
json.dump(out, open("bench_llamacpp.json", "w"), indent=1)
print("SYSTEM:", out["system_info"][:400])
