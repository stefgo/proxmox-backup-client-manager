#!/bin/bash
set -e

# Lade Umgebungsvariablen aus der .env Datei im Root-Verzeichnis
ENV_FILE="$(dirname "$0")/../.env"
if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
else
    echo "Fehler: Keine .env Datei gefunden unter $ENV_FILE"
    exit 1
fi

echo "========================================"
echo " Building and pushing to $REGISTRY"
echo " Server Platforms: $PLATFORMS_SERVER"
echo " Client Platforms: $PLATFORMS_CLIENT"
echo "========================================"

# Check if a custom buildx builder exists and create one if not
if ! docker buildx ls | grep -q "pbcm-builder"; then
    echo "Creating new docker buildx builder instance 'pbcm-builder'..."
    docker buildx create --name pbcm-builder --use
else
    docker buildx use pbcm-builder
fi

# Ensure the builder is bootstrapped
docker buildx inspect --bootstrap

# Build and push server
echo ">>> Building pbcm-server..."
docker buildx build \
    --platform $PLATFORMS_SERVER \
    --tag $REGISTRY/pbcm-server:$TAG \
    --file docker/Dockerfile.server \
    --push \
    .

# Build and push client
echo ">>> Building pbcm-client..."
docker buildx build \
    --platform $PLATFORMS_CLIENT \
    --tag $REGISTRY/pbcm-client:$TAG \
    --file docker/Dockerfile.client \
    --push \
    .

echo "========================================"
echo " Done! Images have been pushed."
echo "========================================"
