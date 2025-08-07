#!/bin/bash

echo "🛠 Setting up news-for-schmucks backend..."

# Create folder structure
mkdir -p news-for-schmucks-backend/services
mkdir -p news-for-schmucks-backend/utils
mkdir -p news-for-schmucks-backend/public

# Create main files
touch news-for-schmucks-backend/index.js
touch news-for-schmucks-backend/package.json
touch news-for-schmucks-backend/.gitignore

# Create service files
touch news-for-schmucks-backend/services/fetchHeadlines.js
touch news-for-schmucks-backend/services/summarizeNews.js
touch news-for-schmucks-backend/services/uncensorText.js
touch news-for-schmucks-backend/services/generateSpeech.js
touch news-for-schmucks-backend/services/saveFiles.js

# Create utils file
touch news-for-schmucks-backend/utils/env.js

# Init default content
cat <<EOF > news-for-schmucks-backend/.gitignore
node_modules
.env
public/audio.mp3
public/transcript.json
EOF

cat <<EOF > news-for-schmucks-backend/package.json
{
  "name": "news-for-schmucks-backend",
  "type": "module",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "axios": "^1.6.7",
    "express": "^4.18.2",
    "node-cron": "^3.0.2"
  }
}
EOF

echo "✅ Done. Your news-for-schmucks project structure is ready!"
echo "
