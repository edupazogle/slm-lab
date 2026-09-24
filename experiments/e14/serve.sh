#!/bin/bash
# serve.sh: Start the llama.cpp server for the SmolLM2 model
# Binds to 127.0.0.1:8190
# Writes PID to serve.pid

MODEL_PATH="/home/edu/Public/bizloop/slm/experiments/e14/models/smollm2-360m-instruct-q8_0.gguf"
HOST="127.0.0.1"
PORT="8190"
PID_FILE="/home/edu/Public/bizloop/slm/experiments/e14/serve.pid"
LOG_FILE="/home/edu/Public/bizloop/slm/experiments/e14/server.log"

# Check if model exists
if [ ! -f "$MODEL_PATH" ]; then
    echo "Model not found at $MODEL_PATH"
    exit 1
fi

# Use the slm venv python
PYTHON="/home/edu/.venvs/slm/bin/python"

# Start the server
echo "Starting server on $HOST:$PORT with model $MODEL_PATH"
"$PYTHON" -m llama_cpp.server --model "$MODEL_PATH" --host "$HOST" --port "$PORT" --n_ctx 2048 > "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
echo "Server started with PID $(cat $PID_FILE)"
