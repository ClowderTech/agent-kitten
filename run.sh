#!/bin/bash

# Clone the Git repository
# git clone https://github.com/ClowderTech/agent-kitten.git agent-kitten

# Navigate to the cloned directory
# cd agent-kitten

# Pull the latest changes from the Git repository
git pull

# Install the required Python packages
pip install -r requirements.txt

# Run main.py
python main.py
