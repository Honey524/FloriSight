#!/usr/bin/env python3
"""Persistent YOLO person detection server.

Runs as a long-lived HTTP server so the model is loaded once and reused.
Accepts JPEG frames via POST and returns plain YOLO person detections.

Usage:
    detect_server.py [port]
"""
import json
import os
import sys
import base64
import tempfile
import subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler

try:
    import cv2
    import numpy as np
except ModuleNotFoundError as error:
    raise SystemExit(
        "Missing Python dependency: opencv-python-headless. Install requirements.txt."
    ) from error

try:
    from ultralytics import YOLO
except ModuleNotFoundError as error:
    raise SystemExit(
        "Missing Python dependency: ultralytics. Install requirements.txt."
    ) from error

def classify_position(center_x, center_y, frame_w, frame_h):
    """Classify the position of a person in the frame."""
    x_ratio = center_x / frame_w if frame_w > 0 else 0.5
    y_ratio = center_y / frame_h if frame_h > 0 else 0.5

    if x_ratio < 0.33:
        horiz = "left"
    elif x_ratio > 0.66:
        horiz = "right"
    else:
        horiz = "center"

    if y_ratio < 0.4:
        vert = "upper"
    elif y_ratio > 0.7:
        vert = "lower"
    else:
        vert = "middle"

    return horiz, vert


def classify_size(area_ratio):
    """Classify how close the person appears based on bounding box area."""
    if area_ratio > 0.25:
        return "very close"
    if area_ratio > 0.10:
        return "close"
    if area_ratio > 0.03:
        return "at medium distance"
    return "far away"


def build_description(idx, det, horiz, proximity):
    """Build a concise YOLO-style description of a detected person."""
    return (
        f"Person {idx + 1} detected {proximity} on the {horiz} side "
        f"with {det['confidence']}% confidence."
    )


class DetectionHandler(BaseHTTPRequestHandler):
    model = None

    def log_message(self, format, *args):
        # Suppress default logging to keep stdout clean
        pass

    def do_GET(self):
        """Health check."""
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps({"status": "ok", "model": "yolov8n"}).encode())

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        """Process a frame for detection or a video for tracking."""
        if self.path == '/track':
            return self.handle_track()
        return self.handle_frame()

    def handle_track(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            data = json.loads(body)

            video_b64 = data.get("videoDataUrl", "")
            zone = data.get("zone", "")
            analysis_id = data.get("analysisId", "")

            if "," in video_b64:
                video_b64 = video_b64.split(",", 1)[1]

            video_bytes = base64.b64decode(video_b64)
            fd, temp_path = tempfile.mkstemp(suffix=".mp4")
            with os.fdopen(fd, 'wb') as f:
                f.write(video_bytes)

            script_path = os.path.join(os.path.dirname(__file__), "process_tracking.py")
            
            # Use current python executable to spawn process_tracking.py
            result = subprocess.run(
                [sys.executable, script_path, temp_path, zone, analysis_id],
                capture_output=True,
                text=True
            )
            
            # Clean up temp file
            try:
                os.remove(temp_path)
            except OSError:
                pass

            if result.returncode != 0:
                self._send_json(500, {"error": f"Tracking process failed: {result.stderr}"})
                return

            stdout = result.stdout
            json_start = stdout.find("{")
            if json_start == -1:
                self._send_json(500, {"error": "No JSON object found in stdout", "stdout": stdout})
                return

            json_str = stdout[json_start:]
            summary = json.loads(json_str)
            self._send_json(200, summary)

        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def handle_frame(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            data = json.loads(body)

            frame_data = data.get("frame", "")
            confidence = float(data.get("confidence", 0.25))

            # Decode base64 JPEG
            if "," in frame_data:
                frame_data = frame_data.split(",", 1)[1]

            img_bytes = base64.b64decode(frame_data)
            np_arr = np.frombuffer(img_bytes, dtype=np.uint8)
            frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

            if frame is None:
                self._send_json(400, {"error": "Invalid image", "detections": [], "count": 0})
                return

            height, width = frame.shape[:2]
            frame_area = max(1.0, float(width * height))
            min_box_ratio = float(os.environ.get("FLORISIGHT_MIN_PERSON_BOX_RATIO", "0.003"))

            # Run YOLO with reduced image size to prevent OOM and speed up inference
            results = DetectionHandler.model.predict(
                frame, verbose=False, classes=[0], conf=confidence, imgsz=320
            )

            detections = []

            for result in results:
                for box_obj in result.boxes:
                    x1, y1, x2, y2 = box_obj.xyxy[0].tolist()
                    conf = float(box_obj.conf[0].item())
                    if conf < confidence:
                        continue

                    bw = max(0.0, float(x2 - x1))
                    bh = max(0.0, float(y2 - y1))
                    area_ratio = (bw * bh) / frame_area

                    if area_ratio < min_box_ratio:
                        continue

                    center_x = float((x1 + x2) / 2)
                    center_y = float((y1 + y2) / 2)

                    # Classify position and proximity
                    horiz, _vert = classify_position(center_x, center_y, width, height)
                    proximity = classify_size(area_ratio)

                    det = {
                        "label": "person",
                        "confidence": round(conf * 100, 1),
                        "position": horiz,
                        "proximity": proximity,
                        "box": {
                            "x1": round(float(x1), 1),
                            "y1": round(float(y1), 1),
                            "x2": round(float(x2), 1),
                            "y2": round(float(y2), 1),
                            "width": round(bw, 1),
                            "height": round(bh, 1),
                            "centerX": round(center_x, 1),
                            "centerY": round(center_y, 1),
                        },
                    }
                    detections.append(det)

            detections.sort(
                key=lambda item: (
                    float(item["box"]["x1"]),
                    float(item["box"]["y1"]),
                )
            )

            for idx, det in enumerate(detections):
                det["description"] = build_description(
                    idx, det, det.get("position", "center"), det.get("proximity", "at medium distance")
                )

            self._send_json(200, {
                "detections": detections,
                "count": len(detections),
                "width": width,
                "height": height,
            })

        except Exception as e:
            self._send_json(500, {
                "error": str(e),
                "detections": [],
                "count": 0,
            })

    def _send_json(self, status, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())


def main():
    port = int(os.environ.get("PORT", sys.argv[1] if len(sys.argv) > 1 else 5555))
    model_path = os.environ.get("FLORISIGHT_YOLO_MODEL", "yolov8n.pt")

    print(f"Loading YOLO model: {model_path}", file=sys.stderr)
    DetectionHandler.model = YOLO(model_path)

    # Warm up the model with a dummy frame
    dummy = np.zeros((240, 320, 3), dtype=np.uint8)
    DetectionHandler.model.predict(dummy, verbose=False, classes=[0], conf=0.25, imgsz=320)
    print(f"Model loaded and warmed up.", file=sys.stderr)

    server = HTTPServer(("0.0.0.0", port), DetectionHandler)
    print(f"Detection server listening on http://0.0.0.0:{port}", file=sys.stderr)
    sys.stderr.flush()

    # Signal to the parent process that we are ready
    print(json.dumps({"ready": True, "port": port}))
    sys.stdout.flush()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
