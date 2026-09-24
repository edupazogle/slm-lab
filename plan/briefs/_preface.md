# Delegate preface — SLM Lab (read first)

You are a delegate working in the repo `/home/edu/Public/bizloop` (branch `feat/slm-lab`), in the SLM Lab under `slm/`.
A supervisor session verifies every claim you make by re-running it. A number without the script and output file that
produced it is treated as not measured.

1. **Where you write.** Only inside `slm/experiments/<your experiment id>/` (create it), unless your brief names another
   path. Do not edit anything else. Do not commit, push, or touch other git worktrees. Do not stop processes you did not start.
2. **Python.** If you need packages, make your own venv at `slm/experiments/<id>/.venv` (`python3 -m venv`, then pip).
   Never install into `~/.venvs/slm` (you may run it as it is). Before any Python run:
   `export NEEDLE_TELEMETRY=0 DO_NOT_TRACK=1 HF_HUB_DISABLE_TELEMETRY=1 OMP_NUM_THREADS=4 TOKENIZERS_PARALLELISM=false`.
3. **Long commands.** Run them in the FOREGROUND in one Bash call with an explicit `timeout` (split work so no single call
   exceeds 10 minutes). Never start something in the background and "wait for it": your run ends the moment you reply
   without calling a tool. **Every message you send must contain a tool call until the whole brief is done — do not
   narrate a plan ("Now I need to…") as a message of its own: that ends the job with nothing done** (measured: E1 fix 2
   ended after 45 s on exactly that sentence). Reply with text only at the very end.
4. **The machine is shared** (other agents build and test here): at most 4 CPU threads, GPU use under 6 GB, and no single
   run longer than 20 minutes without writing progress to a log in your folder.
5. **Data and licences.** Record every dataset's source URL and licence in `DATA.md` before using it. Never use
   `ai4privacy/pii-masking-300k` / `-400k` or anything CC-BY-NC / non-commercial. Data you generate is labelled synthetic,
   with the generator script committed beside it. Downloads from huggingface.co and pypi.org are fine (curl / pip / the
   `datasets` library); there is no web search tool — do not invent URLs or dataset ids: read them from the repo's research
   notes, or list them from the Hugging Face API.
6. **Numbers.** Every number goes into a JSON results file written by a script in your folder. Your `REPORT.md` quotes
   numbers only from those files, names the file, and gives the exact command that reproduces it. Say "not measured"
   rather than estimate. Record the machine load (`uptime`) with every timed number.
7. **Checks that can fail.** Every evaluation script must fail loudly (non-zero exit) if an input file is missing or
   empty, and must print the number of items it scored. After writing a metric, prove it can fail once: feed it a
   deliberately wrong prediction file and confirm the metric drops; note that in the report.
8. **Final reply** (text, at the very end): files created · commands to reproduce each number · the numbers with their
   files · the pass bar and whether it was met · what you did not do and why.
