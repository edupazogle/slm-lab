# E11 — fix round 2 (from the supervisor)

Your rebuilt dataset still has 38 train + 16 test windows, the `label` field is `None` on every row, and there are 23
synthetic garble windows (the brief asks ≥ 300). The supervisor measured the transcripts: **63 jobs, 3.09 MB of visible
text (median 32.5 KB per job) → 1,256 windows** at 6,000 bytes / 2,000-byte step / cap 60. Your extraction is dropping
almost everything. Replace it with this reconstruction (tested by the supervisor):

```python
def visible_pieces(path):
    """[(event_index, text)] — what a terminal would show, in order. Skips the 1.36 M 'system' events (hooks, progress)."""
    out = []
    for i, line in enumerate(open(path, errors="replace")):
        try: r = json.loads(line)
        except Exception: continue
        if not isinstance(r, dict): continue
        t = r.get("type"); msg = r.get("message") if isinstance(r.get("message"), dict) else {}
        c = msg.get("content")
        if t == "assistant" and isinstance(c, list):
            for b in c:
                if not isinstance(b, dict): continue
                if b.get("type") == "text": out.append((i, b["text"]))
                elif b.get("type") == "tool_use": out.append((i, f"● {b.get('name')}({json.dumps(b.get('input'))[:300]})"))
        elif t == "user" and isinstance(c, list):
            for b in c:
                if isinstance(b, dict) and b.get("type") == "tool_result":
                    cc = b.get("content")
                    s = cc if isinstance(cc, str) else " ".join(x.get("text", "") for x in (cc or []) if isinstance(x, dict))
                    out.append((i, "  ⎿ " + s[:2000]))
        elif t == "result":
            out.append((i, f"[result {r.get('subtype')}] " + str(r.get('result'))[:1000]))
    return out
```

1. Concatenate the pieces (join with "\n"), remembering each piece's byte offset and event index. Slide the window; each
   window's **label** comes from the FIRST event after the window's last byte, by structure:
   - the next event is a `result` → `finished-report`;
   - the last tool result in the window contains "requires approval" / "permission" / "not allowed" → `waiting-permission`;
   - the window contains an API error signature (`API Error`, `402`, `429`, `overloaded`, `Insufficient Balance`,
     `rate limit`) within its last 800 bytes → `api-error`;
   - otherwise → `working`.
   `garble` windows come only from the synthetic generators. `label` is always one of the 5 strings: assert it.
2. `assert` ≥ 1,000 real windows in total and ≥ 300 synthetic garble windows; the test split (by job, 70/30, seed 13)
   must hold ≥ 15 jobs. Print the per-label counts; if a class has < 10 examples, say so in `DATA.md` instead of padding it.
3. Keep the held-out-generator rotation, the Latin-script slice, the false-alarm rate per 8 agent-hours and CPU ms, as in
   fix round 1. Recompute everything; rewrite `REPORT.md` from the results JSON only.

Every message must contain a tool call until the brief is done; foreground runs with explicit timeouts; text only in the
final reply, in the preface's format.
