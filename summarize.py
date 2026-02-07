import json
import os
import sys
import urllib.error
import urllib.request


SYSTEM_PROMPT = (
    "You are a helpful assistant that generates concise, clear, and useful git "
    "commit messages. Your output will be used directly as the commit message, so "
    "it must be in its final form. Your message should be concise and to the point "
    "(<30 chars). If the changes are not all related to the same feature/bug/etc, "
    "then your commit message should describe the multiple purposes comma separated. "
    "Avoid using vague, blanket words like 'refactor'.\n\nExamples:\n"
    "Adjust search input behavior, fix mobile layout\n"
    "Update card styles\n"
    "Fix mobile layout\n"
    "Change pricing\n"
    "Track important user actions\n"
    "Integrate posthog\n"
    "Integrate stripe\n"
    "Updated create lesson test\n"
    "More resilient test cases\n"
    "etc..."
)


def truncate_prompt(prompt):
    # Limit prompt size to reduce token usage and request size.
    max_chars = 2000 * 4
    if len(prompt) <= max_chars:
        return prompt
    return prompt[:max_chars].strip()


def generate_commit_message(prompt):
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")

    payload = {
        "model": "gpt-4.1-nano",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": truncate_prompt(prompt)},
        ],
        "max_tokens": 50,
        "n": 1,
        "stop": ["\n"],
        "temperature": 0.9,
    }

    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            body = response.read().decode("utf-8")
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI API request failed ({err.code}): {detail}") from err
    except urllib.error.URLError as err:
        raise RuntimeError(f"OpenAI API request failed: {err}") from err

    parsed = json.loads(body)
    choices = parsed.get("choices", [])
    if not choices:
        raise RuntimeError("OpenAI API response did not include choices")

    content = choices[0].get("message", {}).get("content", "")
    message = content.strip()
    if not message:
        raise RuntimeError("OpenAI API returned an empty commit message")
    return message


def main():
    if len(sys.argv) < 2:
        print("Usage: summarize.py '<prompt>'", file=sys.stderr)
        sys.exit(2)

    prompt = sys.argv[1]
    try:
        commit_message = generate_commit_message(prompt)
    except Exception as err:
        print(f"Error: {err}", file=sys.stderr)
        sys.exit(1)

    print(commit_message)


if __name__ == "__main__":
    main()
