FROM python:3.10-slim

WORKDIR /app

# Install system dependencies required by OpenCV
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the models
COPY yolov8n.pt .

# Copy the script
COPY scripts/detect_server.py .

EXPOSE 5555

CMD ["python", "detect_server.py"]
