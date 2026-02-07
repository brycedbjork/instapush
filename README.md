# Instapush

**Stop repeating git commands and writing useless commit messages**

In the terminal of a git repo, run:
- `push` to stage, commit, and push changes
- `commit` to stage and commit changes (without pushing)

Both commands automatically summarize changes into a commit message using GPT-4.1-nano.

## Setup

1. Clone this repo to your computer:
   ```bash
   git clone github.com/brycedbjork/instapush.git
   ```

2. Set up Python environment:
   ```bash
   # Verify python3 is available
   python3 --version
   ```

3. Configure OpenAI API key:
   - Add `export OPENAI_API_KEY="your_api_key"` to your `.bashrc`, `.bash_profile`, or `.zshrc` file
   - Or set it temporarily in your current shell: `export OPENAI_API_KEY="your_api_key"`

4. Make the script executable:
   ```bash
   chmod +x /path/to/instapush.sh
   ```

5. Add aliases to your `.bashrc`, `.bash_profile`, or `.zshrc` file:
   ```bash
   alias push="/path/to/instapush.sh"
   alias commit="/path/to/instacommit.sh"
   ```

6. Restart your terminal or source your profile file:
   ```bash
   source ~/.bashrc  # or ~/.bash_profile or ~/.zshrc
   ```

## Usage

- Run `push` to automatically stage, commit, and push your changes with an AI-generated commit message
- Run `commit` to automatically stage and commit your changes with an AI-generated commit message (without pushing)
