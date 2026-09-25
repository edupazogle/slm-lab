#!/bin/bash
# serve.sh: Start the llama.cpp server for the SmolLM2 model
# Binds to 127.0.0.1:8190 (the base_url of the llamacpp-local binding in models.json)
# Writes PID to serve.pid next to this script
#
# External inputs (defaults are the owner's machine, so nothing changes there):
#   E14_MODEL_PATH  the GGUF      (default: models/smollm2-360m-instruct-q8_0.gguf next to this script if it is
#                                  there, else $BIZLOOP_ROOT/slm/experiments/e14/models/smollm2-360m-instruct-q8_0.gguf)
#   E14_PYTHON      a python with llama_cpp[server] installed (default: /home/edu/.venvs/slm/bin/python)
#   BIZLOOP_ROOT    the BizLoop checkout (default: /home/edu/Public/bizloop)

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIZLOOP_ROOT="${BIZLOOP_ROOT:-/home/edu/Public/bizloop}"
MODEL_FILE="smollm2-360m-instruct-q8_0.gguf"
if [ -z "$E14_MODEL_PATH" ] && [ -f "$HERE/models/$MODEL_FILE" ]; then
    MODEL_PATH="$HERE/models/$MODEL_FILE"
else
    MODEL_PATH="${E14_MODEL_PATH:-$BIZLOOP_ROOT/slm/experiments/e14/models/$MODEL_FILE}"
fi
HOST="127.0.0.1"
PORT="8190"
PID_FILE="$HERE/serve.pid"
LOG_FILE="$HERE/server.log"

# Check if model exists
if [ ! -f "$MODEL_PATH" ]; then
    echo "Model not found at $MODEL_PATH" >&2
    echo "  Set E14_MODEL_PATH to the GGUF (ngxson/SmolLM2-360M-Instruct-Q8_0-GGUF), or BIZLOOP_ROOT to the checkout holding it." >&2
    exit 1
fi

# Use the slm venv python
PYTHON="${E14_PYTHON:-/home/edu/.venvs/slm/bin/python}"
if ! "$PYTHON" -c "import llama_cpp.server" 2>/dev/null; then
    echo "No usable llama_cpp.server in $PYTHON" >&2
    echo "  Set E14_PYTHON to a python with llama-cpp-python[server] installed." >&2
    exit 1
fi

# Start the server
echo "Starting server on $HOST:$PORT with model $MODEL_PATH"
"$PYTHON" -m llama_cpp.server --model "$MODEL_PATH" --host "$HOST" --port "$PORT" --n_ctx 2048 > "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
echo "Server started with PID $(cat "$PID_FILE")"
