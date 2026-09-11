# Model Configuration Guide

## Overview
The application now supports configurable models through environment variables. This allows you to easily switch between different AI models that support function calling.

## Current Configuration

### Environment Variable
- **Variable Name**: `OPENROUTER_MODEL`
- **Default**: `mistralai/mistral-7b-instruct:free`
- **Location**: Set in `.env.local` file

### Supported Models

#### 1. Mistral 7B Instruct (Default)
- **Model ID**: `mistralai/mistral-7b-instruct:free`
- **Provider**: Mistral AI
- **Cost**: Free
- **Function Calling**: ✅ Supported
- **Notes**: Open-source model that supports function calling and tool use

#### 2. Qwen 2.5 Coder
- **Model ID**: `qwen/qwen-2.5-coder:free`
- **Provider**: Qwen
- **Cost**: Free
- **Function Calling**: ✅ Supported
- **Notes**: Good for function calling, optimized for code and tools

#### 3. Other Free Models
You can explore other free models with function calling support on [OpenRouter](https://openrouter.ai/models)

## How to Use

### Setting Up Environment Variable

1. Create or edit your `.env.local` file in the root directory:

```bash
# Use Mistral (default)
OPENROUTER_MODEL=mistralai/mistral-7b-instruct:free

# Or use Qwen
OPENROUTER_MODEL=qwen/qwen-2.5-coder:free
```

2. The model name will be used throughout the application automatically.

## Function Calling Support

The current model (`mistralai/mistral-7b-instruct:free`) **does support function calling**. The implementation includes:

- ✅ **find_content**: Search for content by type and query
- ✅ **create_content**: Create new content (subjects, problems, ideas)
- ✅ **edit_content**: Edit existing content

> **Important:** Both `create_content` and `edit_content` now require an explicit confirmation step.  
> 1. First call the tool without the `confirm` flag to receive a preview payload.  
> 2. The preview includes the original description, the HTML body that will be sent, and a plain-text rendition with all rich formatting stripped out.  
> 3. Once the user approves, call the same tool again with `confirm: true` to execute the action.

## Translation Model

The `/api/translate` endpoint **only ever uses free models** — never paid. By default it auto-discovers a free model at runtime:

1. Fetches the OpenRouter model list (cached ~10 min).
2. Filters to **free-only** models (`pricing.prompt == 0` and `pricing.completion == 0`).
3. Skips reasoning/content-safety/audio/video/image models (text-to-text only).
4. Sorts by context length ascending — lightest first (translation is light work).
5. Probes each candidate with a tiny call until one succeeds on your account's allowed-provider list.
6. Falls back to `openrouter/free` if no free model works.

You can pin a specific model (must still be free) via env if you prefer:

```bash
OPENROUTER_TRANSLATE_MODEL=cohere/north-mini-code:free
```

Note: your OpenRouter account's allowed-providers setting must include the provider serving the chosen free model. The translation endpoint has a 45s total budget (`TOTAL_BUDGET_MS`) so it waits for all concurrent chunk translations to complete instead of truncating early. The Rails side retries missing texts on subsequent calls.

## Transform Page Model

The `transform_page` tool (Lotte's page modification) uses a separate, faster model:

- **Variable Name**: `OPENROUTER_TRANSFORM_MODEL`
- **Default**: `mistral/mistral-small-latest`
- **Cost**: ~$0.10/1M input tokens, ~$0.30/1M output tokens
- **Speed**: ~2-5 seconds per transform

This is intentionally a paid model for speed and quality. Translations, simplifications, and freeform transforms all use this model.

```bash
OPENROUTER_TRANSFORM_MODEL=mistral/mistral-small-latest
```

## Notes About MiniMax M2

MiniMax M2 is not available through OpenRouter at this time. If MiniMax models become available on OpenRouter in the future, you can add them using the same environment variable approach.

## Switching Models

To switch models, simply update the `OPENROUTER_MODEL` environment variable in your `.env.local` file and restart your development server:

```bash
npm run dev
```

The application will automatically use the new model for all chat requests.

## Finding Compatible Models

To find other models that support function calling:
1. Visit [OpenRouter Models](https://openrouter.ai/models)
2. Look for models with "Tools" or "Function Calling" support
3. Check if they're free or paid
4. Update your `OPENROUTER_MODEL` environment variable with the model ID

