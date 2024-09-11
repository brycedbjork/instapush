import openai
import os
import sys

openai.api_key = os.environ["OPENAI_API_KEY"]


# If necessary, truncate the prompt to fit within the token limit
def truncate_prompt(prompt):
    max_chars = (2000) * 4
    if len(prompt) <= max_chars:
        return prompt
    return prompt[:max_chars].strip()


def generate_commit_message(prompt):
    truncated_prompt = truncate_prompt(prompt)
    response = openai.ChatCompletion.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system",
                "content": "You are a helpful assistant that generates concise, clear, and useful git commit messages. Your output will be used directly as the commit message, so it must be in its final form. Your message should be concise and to the point (<30 chars).\n\nExamples:\nAdjust search input behavior\nUpdate card styles\nFix mobile layout\nChange pricing\nTrack important user actions\nIntegrate posthog\nIntegrate stripe\n..."},
            {"role": "user", "content": truncated_prompt},
        ],
        max_tokens=50,
        n=1,
        stop=["\n"],
        temperature=0.9,
    )
    message = response.choices[0].message['content'].strip()
    return message


if __name__ == "__main__":
    prompt = sys.argv[1]
    commit_message = generate_commit_message(prompt)
    print(commit_message)
