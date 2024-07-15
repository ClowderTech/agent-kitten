#!/bin/bash

# Define the directory where your repository is located
REPO_DIR="/path/to/your/repo"
ENV_FILE="$REPO_DIR/.env"

# Navigate to the directory
cd $REPO_DIR || { echo "Repository not found!"; exit 1; }

# Pull the latest changes from the Git repository
git pull origin main

# If .env file exists, back it up
if [ -f "$ENV_FILE" ]; then
    cp .env .env.bak
fi

# Update code
git reset --hard origin/main

# Restore the .env file if it was backed up
if [ -f "$ENV_FILE.bak" ]; then
    mv .env.bak .env
fi

# Check if bun is installed, install it if not
if ! command -v bun &> /dev/null; then
    echo "Bun is not installed. Installing..."
    curl -fsSL https://bun.sh/install | bash
    source $HOME/.bashrc
fi

# Run the specified file using Bun
bun run index.ts
# OR if your entry point is src.ts
# bun run src.ts

echo "Script execution completed successfully."