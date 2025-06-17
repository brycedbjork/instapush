# Instapush

**Stop repeating git commands and writing useless commit messages**

In the terminal of a git repo, run command `push` to:

- Stage all changes
- Summarize changes into a commit message (using GPT-4.1-nano)
- Commit and push changes

## Setup

1. Clone this repo to your computer:
   ```bash
   git clone github.com/brycedbjork/instapush.git
   ```

2. Set up Python environment:
   ```bash
   # Create and activate a virtual environment (recommended)
   python -m venv venv
   source venv/bin/activate  # On Unix/macOS
   # or
   .\venv\Scripts\activate  # On Windows

   # Install dependencies
   pip install -r requirements.txt
   ```

3. Configure OpenAI API key:
   - Add `export OPENAI_API_KEY="your_api_key"` to your `.bashrc`, `.bash_profile`, or `.zshrc` file
   - Or set it temporarily in your current shell: `export OPENAI_API_KEY="your_api_key"`

4. Make the script executable:
   ```bash
   chmod +x /path/to/instapush.sh
   ```

5. Add an alias to your `.bashrc`, `.bash_profile`, or `.zshrc` file:
   ```bash
   alias push="/path/to/instapush.sh"
   ```

6. Restart your terminal or source your profile file:
   ```bash
   source ~/.bashrc  # or ~/.bash_profile or ~/.zshrc
   ```

## Usage

Simply run `push` in any git repository to automatically stage, commit, and push your changes with an AI-generated commit message.
