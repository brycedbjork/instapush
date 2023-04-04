# Instapush

**Stop repeating git commands and writing useless commit messages**

In the terminal of a git repo, run command `push` to:

- Stage all changes
- Summarize changes into a commit message (using GPT-3.5-turbo)
- Commit and push changes

## Setup

- Clone this repo to your computer: `git clone github.com/brycedbjork/instapush.git`
- Add `export OPENAI_API_KEY="your_api_key"` to your `.bashrc` `.bash_profile` or `.zshrc` file
- Make the script executable: `chmod +x /path/to/instapush.sh`
- Add an alias to your `.bashrc` `.bash_profile` or `.zshrc` file: `alias push="/path/to/instapush.sh"`
- Restart terminal
