# Model Card: SmolLM2-360M-Instruct-Q8_0

## Model Details
- **Model**: ngxson/SmolLM2-360M-Instruct-Q8_0-GGUF
- **License**: Apache-2.0
- **Size**: 360M parameters (quantized to Q8_0)
- **Where it runs**: This machine (localhost), bound to 127.0.0.1:8190
- **Intended use**: Bounded classification and extraction in the Lab lane; not the AXA lane

## Performance
- **Measured latency**: 98.98 ms (median of 5 calls)
- **Prompt tokens**: 36
- **Completion tokens**: 9
- **Total tokens per call**: 45

## Usage Notes
This model is served via llama.cpp's OpenAI-compatible server and accessed through BizLoop's model binding system as a Lab-lane binding. It is intended for lightweight synthetic data processing tasks in the Lab environment only.

## Cost Information
No cost line is available as this model is not present in cockpit/pricing.json. According to the brief: "do not invent a price."