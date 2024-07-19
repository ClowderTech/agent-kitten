#!/bin/bash

SCRIPT_PATH="/agent-kitten-v2/helper.sh"
RE_RUN_FLAG="/tmp/agentkittenrun"

# Define the directory where your repository is located
REPO_DIR="/agent-kitten-v2"
ENV_FILE="$REPO_DIR/.env"

# Function to update the repository
update_repo() {
    echo "Updating repository..."

    # Ensure git and unzip are installed
    if ! command -v git &> /dev/null; then
        echo "Git is not installed. Installing..."
        sudo apt-get update
        sudo apt-get install -y git
    fi

    if ! command -v unzip &> /dev/null; then
        echo "Unzip is not installed. Installing..."
        sudo apt-get update
        sudo apt-get install -y unzip
    fi

    # Navigate to the directory
    cd "$REPO_DIR" || { echo "Repository not found!"; exit 1; }

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

    # Ensure the script is executable
    chmod +x "$SCRIPT_PATH"

    # Check if bun is installed, install it if not
    if [ ls -l "$BUN_INSTALL" ]  then
        echo "Bun is not installed. Installing..."
        source "$HOME/.bashrc"
        curl -fsSL https://bun.sh/install | bash
        source "$HOME/.bashrc"
    fi


    echo "Repository update completed."
}

# Function to run the code
run_code() {
    echo "Running src/index.ts..."

    # Navigate to the directory
    cd "$REPO_DIR" || { echo "Repository not found!"; exit 1; }

    # Install dependencies
    bun install

    # Run the specified file using Bun
    bun run src/index.ts

    echo "Code execution completed."
}

case "$1" in
    --run)
        run_code
        ;;
    --update)
        update_repo
        ;;
    --update-and-run)
        if [ ! -f "$RE_RUN_FLAG" ]; then
            touch "$RE_RUN_FLAG"
            echo "Re-running the script with --update-and-run flag..."
            exec "$SCRIPT_PATH" --update-and-run
        else
            rm -f "$RE_RUN_FLAG"
            update_repo
            run_code
        fi
        ;;
    *)
        echo "Usage: $SCRIPT_PATH [--run | --update | --update-and-run]"
        ;;
esac
