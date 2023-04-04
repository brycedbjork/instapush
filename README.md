# Instapush

**Stop repeating git commands and writing useless commit messages**

Press command + enter from the terminal in a git repo

- Stage all changes
- Summarize changes into a commit message (using GPT-3.5-turbo)
- Commit and push changes

## Setup

- Clone this repo to your computer: `git clone github.com/brycedbjork/instapush.git`
- Add `export OPENAI_API_KEY="your_api_key"` to your `.bashrc` `.bash_profile` or `.zshrc` file
- Make the script executable: `chmod +x /path/to/instapush.sh`
- Create an Automator service to run the script:
  - Open Automator (you can find it in Applications).
  - Choose "Quick Action" as the document type.
  - Set "Workflow receives" to "no input" in "any application".
  - Search for "Run Shell Script" in the Actions Library, and drag it to the workflow area.
  - Choose "/bin/bash" as the shell, and paste the following code: `/path/to/instapush.sh`
  - Save the workflow as "Instapush" (or whatever you want).
- Assign a keyboard shortcut to the service:
  - Open System Preferences.
  - Go to "Keyboard" -> "Shortcuts" -> "Services."
  - Scroll down to "General" and find the service you created (e.g., "GitAutoPush").
  - Click "Add Shortcut" and press the desired key combination (e.g., "Cmd + Enter").
  - Close System Preferences.
