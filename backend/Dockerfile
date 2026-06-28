FROM python:3.10-slim

WORKDIR /app

# Install system dependencies required by OpenCV
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install CPU-only PyTorch first to prevent OOM errors on Render free tier
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir \
    --index-url https://download.pytorch.org/whl/cpu \
    --extra-index-url https://pypi.org/simple \
    torch torchvision

RUN pip install --no-cache-dir -r requirements.txt

# Copy the models
COPY yolov8n.pt .

# Copy the script
COPY scripts/detect_server.py .

EXPOSE 5555

CMD ["python", "detect_server.py"]
