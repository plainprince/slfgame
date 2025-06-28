# Use Node.js Debian image for better compatibility
FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Ollama
RUN curl -fsSL https://ollama.com/install.sh | sh

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY bun.lock ./

# Install Node.js dependencies
RUN npm install

# Copy application code
COPY . .

# Create startup script
RUN echo '#!/bin/bash\n\
# Start Ollama server in background\n\
echo "Starting Ollama server..."\n\
ollama serve &\n\
OLLAMA_PID=$!\n\
\n\
# Wait for Ollama to be ready\n\
echo "Waiting for Ollama to start..."\n\
while ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; do\n\
    sleep 1\n\
done\n\
\n\
echo "Ollama server is ready!"\n\
\n\
# Pull a small model for validation\n\
echo "Pulling Ollama model..."\n\
ollama pull llama3.2:1b\n\
\n\
echo "Model ready!"\n\
\n\
# Start the Node.js application\n\
echo "Starting Node.js application..."\n\
npm start\n\
' > /app/start.sh && chmod +x /app/start.sh

# Expose ports
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000 || exit 1

# Start both services
CMD ["/app/start.sh"] 