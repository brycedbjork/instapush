import openai
import os
import sys

openai.api_key = os.environ["OPENAI_API_KEY"]


def generate_commit_message(prompt):
    response = openai.ChatCompletion.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": "You are a helpful assistant that generates Git commit messages."},
            {"role": "user", "content": prompt},
        ],
        max_tokens=50,
        n=1,
        stop=["\n"],
        temperature=0.5,
    )
    message = response.choices[0].message['content'].strip()
    return message


if __name__ == "__main__":
    prompt = sys.argv[1]
    commit_message = generate_commit_message(prompt)
    print(commit_message)
