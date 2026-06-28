#!/usr/bin/env python3
"""Single-frame YOLO person detection.

Usage:
    detect_frame.py <image_path> [confidence_threshold]

Reads a JPEG/PNG image, runs YOLOv8 person detection (class 0),
and prints a JSON object with bounding boxes to stdout.
"""
import json
import os
import sys

try:
    import cv2
except ModuleNotFoundError as error:
    raise SystemExit(
        "Missing Python dependency: opencv-python-headless. Install requirements.txt before running detection."
    ) from error

try:
    from ultralytics import YOLO
except ModuleNotFoundError as error:
    raise SystemExit(
        "Missing Python dependency: ultralytics. Install requirements.txt before running detection."
    ) from error


# Cache the model globally so repeated invocations in the same process
# (if called as a module) skip the load overhead.
_model_cache = {}


def get_model(model_path):
    if model_path not in _model_cache:
        _model_cache[model_path] = YOLO(model_path)
    return _model_cache[model_path]


def detect_persons(image_path, confidence=0.25, model_path=None):
    """Run person detection on a single image.

    Returns a dict with keys: detections (list), width, height.
    """
    if model_path is None:
        model_path = os.environ.get("FLORISIGHT_YOLO_MODEL", "yolov8s.pt")

    model = get_model(model_path)
    frame = cv2.imread(image_path)

    if frame is None:
        return {"error": "Unable to read image.", "detections": [], "width": 0, "height": 0}

    height, width = frame.shape[:2]
    min_box_area_ratio = float(os.environ.get("FLORISIGHT_MIN_PERSON_BOX_RATIO", "0.003"))

    results = model.predict(frame, verbose=False, classes=[0], conf=confidence)
    detections = []

    for result in results:
        for box in result.boxes:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            conf = float(box.conf[0].item())
            if conf < confidence:
                continue

            box_w = max(0.0, float(x2 - x1))
            box_h = max(0.0, float(y2 - y1))
            frame_area = max(1.0, float(width * height))
            area_ratio = (box_w * box_h) / frame_area

            if area_ratio < min_box_area_ratio:
                continue

            detections.append({
                "label": "person",
                "confidence": round(conf, 3),
                "box": {
                    "x1": round(float(x1), 1),
                    "y1": round(float(y1), 1),
                    "x2": round(float(x2), 1),
                    "y2": round(float(y2), 1),
                    "width": round(box_w, 1),
                    "height": round(box_h, 1),
                    "centerX": round(float((x1 + x2) / 2), 1),
                    "centerY": round(float((y1 + y2) / 2), 1),
                },
            })

    return {
        "detections": detections,
        "count": len(detections),
        "width": width,
        "height": height,
    }


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Usage: detect_frame.py <image_path> [confidence]")

    image_path = sys.argv[1]
    confidence = float(sys.argv[2]) if len(sys.argv) > 2 else 0.25

    result = detect_persons(image_path, confidence)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
