# core/ai.py — one place WaziPOS calls Claude (Anthropic API) for structured answers.
#
#   result = structured(system, content, schema, effort="medium")
#
# Returns the JSON object matching `schema` (structured outputs), or raises AIError
# with a message fit to show a user. The API key stays on the server
# (ANTHROPIC_API_KEY); refusals are re-run on another model server-side
# (fallbacks="default") and reported as AIError if the whole chain declines.

import json
import logging
import os

from django.conf import settings

log = logging.getLogger(__name__)

MODEL = "claude-opus-5-5"


class AIError(Exception):
    def __init__(self, message, errors=None):
        super().__init__(message)
        self.message = message
        self.errors = errors or [message]


def _client():
    try:
        import anthropic
    except ImportError:
        raise AIError("Assistant not set up", ["The AI assistant isn't installed on the server yet"])
    key = getattr(settings, "ANTHROPIC_API_KEY", None) or os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise AIError("Assistant not set up", ["The AI assistant isn't configured yet"])
    return anthropic, anthropic.Anthropic(api_key=key, timeout=120.0, max_retries=2)


def structured(system, content, schema, effort="medium", max_tokens=12000):
    anthropic, client = _client()
    try:
        response = client.beta.messages.create(
            model=MODEL,
            max_tokens=max_tokens,
            system=system,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}},
            messages=[{"role": "user", "content": content}],
        )
    except anthropic.RateLimitError:
        raise AIError("Assistant busy", ["The AI assistant is busy right now — try again in a minute"])
    except anthropic.APIConnectionError:
        raise AIError("Assistant unreachable", ["Couldn't reach the AI assistant — try again shortly"])
    except anthropic.AuthenticationError:
        log.error("Anthropic credentials rejected")
        raise AIError("Assistant not set up", ["The AI assistant isn't configured correctly"])
    except anthropic.APIStatusError as e:
        log.warning("Anthropic API error %s: %s", getattr(e, "status_code", None), e)
        raise AIError("Assistant error", ["The AI assistant couldn't help just now — try again"])
    if response.stop_reason == "refusal":
        raise AIError("Can't help with that", ["The AI assistant couldn't help with this request"])
    if response.stop_reason == "max_tokens":
        raise AIError("Too much to analyse", ["That was too much for one analysis — narrow it down and try again"])
    text = "".join(b.text for b in response.content if getattr(b, "type", "") == "text")
    try:
        return json.loads(text)
    except ValueError:
        log.warning("Anthropic returned non-JSON structured output")
        raise AIError("Assistant error", ["The AI assistant's reply couldn't be read — try again"])
