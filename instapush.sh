#!/bin/bash

# get the directory of the script and the current directory
script_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
current_dir=$(pwd)

# change to the current directory
cd "$current_dir"

# add all changes to the staging area
git add .

# get the summary and changes of the staged changes
git_diff_summary="$(git diff --staged --stat)"
git_diff_changes="$(git diff --staged --unified=0)"

# if not, prompt the user to create a commit message
prompt="Create a message for the following:\nSummary:\n$git_diff_summary\nChanges:\n$git_diff_changes"

# generate the commit message using a Python script
commit_msg=$(python "$script_dir/summarize.py" "$prompt")

# commit the changes with the generated commit message
git commit -am "$commit_msg"

# push the changes to the remote repository
git push

