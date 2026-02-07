#!/bin/bash

# get the directory of the script and the current directory
script_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
current_dir=$(pwd)

# change to the current directory
cd "$current_dir"

if command -v python3 >/dev/null 2>&1; then
  python_cmd="python3"
elif command -v python >/dev/null 2>&1; then
  python_cmd="python"
else
  echo "Error: Python is not installed. Install python3 to use commit." >&2
  exit 1
fi

# add all changes to the staging area
git add .

# Exit early if there is nothing to commit.
if git diff --staged --quiet; then
  echo "No changes to commit."
  exit 0
fi

# get the summary and changes of the staged changes
git_diff_summary="$(git diff --staged --stat)"
git_diff_changes="$(git diff --staged --unified=0)"

# if not, prompt the user to create a commit message
prompt="Create a message for the following:\nSummary:\n$git_diff_summary\nChanges:\n$git_diff_changes"

# generate the commit message using a Python script
if ! commit_msg=$("$python_cmd" "$script_dir/summarize.py" "$prompt"); then
  exit 1
fi

if [ -z "$commit_msg" ]; then
  echo "Error: Generated commit message is empty." >&2
  exit 1
fi

# commit the changes with the generated commit message
git commit -m "$commit_msg"
