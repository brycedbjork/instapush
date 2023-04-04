#!/bin/bash

script_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
current_dir=$(pwd)
cd "$current_dir"

git add .
git_diff_summary="$(git diff --staged --stat)"
prompt="Summarize these code changes: $git_diff_summary"
commit_msg=$(python "$script_dir/generate_commit_message.py" "$prompt")

git commit -am "$commit_msg"
git push