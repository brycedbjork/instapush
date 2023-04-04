#!/bin/bash

script_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
current_dir=$(pwd)
cd "$current_dir"

git add .
git_diff_summary="$(git diff --staged --stat)"
git_diff_changes="$(git diff --staged --unified=0)"
prompt="Describe the impact of these code changes simply and concisely in bullets separated by semicolons:\nSummary:\n$git_diff_summary\nChanges:\n$git_diff_changes"
commit_msg=$(python "$script_dir/generate_commit_message.py" "$prompt")

git commit -am "$commit_msg"
git push