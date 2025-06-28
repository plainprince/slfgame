#!/bin/bash

# Docker build and run script for SLF Game

echo "🐳 Building SLF Game Docker image..."
docker build -t slfgame:latest .

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    echo ""
    echo "To run the container:"
    echo "  docker run -p 3000:3000 slfgame:latest"
    echo ""
    echo "Or use docker-compose:"
    echo "  docker-compose up"
    echo ""
    echo "The application will be available at:"
    echo "  - Game: http://localhost:3000"
    echo ""
    echo "Note: Ollama server runs inside the container (no external dependencies needed)"
    echo ""
else
    echo "❌ Build failed!"
    exit 1
fi 