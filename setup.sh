#!/bin/bash

echo "🛠 Setting up news-for-schmucks dist..."

# Create folder structure
mkdir -p news-for-schmucks-dist/services
mkdir -p news-for-schmucks-dist/utils
mkdir -p news-for-schmucks-dist/public

# Create main files
touch news-for-schmucks-dist/index.js
touch news-for-schmucks-dist/package.json
touch news-for-schmucks-dist/.gitignore

# Create service files
touch news-for-schmucks-dist/services/fetchHeadlines.js
touch news-for-schmucks-dist/services/summarizeNews.js
touch news-for-schmucks-dist/services/uncensorText.js
touch news-for-schmucks-dist/services/generateSpeech.js
touch news-for-schmucks-dist/services/saveFiles.js

# Create utils file
touch news-for-schmucks-dist/utils/env.js

# Init default content
cat <<EOF > news-for-schmucks-dist/.gitignore
node_modules
.env
public/audio.mp3
public/transcript.json
EOF

cat <<EOF > news-for-schmucks-dist/package.json
{
  "name": "news-for-schmucks-dist",
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
