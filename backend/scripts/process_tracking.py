#!/usr/bin/env python3
import json
import os
import sys
from collections import defaultdict

try:
    import cv2
except ModuleNotFoundError as error:
    raise SystemExit(
        "Missing Python dependency: opencv-python-headless. Install requirements.txt before running tracking."
    ) from error

try:
    from deep_sort_realtime.deepsort_tracker import DeepSort
except ModuleNotFoundError as error:
    raise SystemExit(
        "Missing Python dependency: deep-sort-realtime. Install requirements.txt before running tracking."
    ) from error

try:
    from ultralytics import YOLO
except ModuleNotFoundError as error:
    raise SystemExit(
        "Missing Python dependency: ultralytics. Install requirements.txt before running tracking."
    ) from error


def read_float(name, default):
    value = os.environ.get(name)
    if value in (None, ""):
        return float(default)
    return float(value)


def read_int(name, default):
    value = os.environ.get(name)
    if value in (None, ""):
        return int(default)
    return int(value)


def classify_side(x_position, frame_width):
    if frame_width <= 0:
        return "unknown"

    ratio = x_position / frame_width
    if ratio < 0.33:
        return "left"
    if ratio > 0.66:
        return "right"
    return "center"


def add_moment(moments, seen_keys, frame_index, timestamp_seconds, event_type, track_id, detail):
    key = (event_type, track_id, detail)
    if key in seen_keys:
        return

    seen_keys.add(key)
    moments.append(
        {
            "frame": frame_index,
            "timeSeconds": round(timestamp_seconds, 2),
            "type": event_type,
            "trackId": track_id,
            "detail": detail,
        }
    )


def main():
    if len(sys.argv) != 4:
        raise SystemExit("Usage: process_tracking.py <video_path> <zone> <analysis_id>")

    video_path = sys.argv[1]
    zone_name = sys.argv[2]
    analysis_id = sys.argv[3]

    model_path = os.environ.get("FLORISIGHT_YOLO_MODEL", "yolov8s.pt")
    confidence_threshold = read_float("FLORISIGHT_TRACK_CONFIDENCE", 0.25)
    frame_stride = max(1, read_int("FLORISIGHT_TRACK_FRAME_STRIDE", 1))
    path_point_stride = max(1, read_int("FLORISIGHT_PATH_POINT_STRIDE", max(1, frame_stride)))
    min_dwell_seconds = read_float("FLORISIGHT_MIN_DWELL_SECONDS", 3.0)
    max_moments = max(1, read_int("FLORISIGHT_MAX_MOMENTS", 30))
    tracker_max_age = max(1, read_int("FLORISIGHT_DEEPSORT_MAX_AGE", 25))
    tracker_n_init = max(1, read_int("FLORISIGHT_DEEPSORT_N_INIT", 2))
    min_box_area_ratio = read_float("FLORISIGHT_MIN_PERSON_BOX_RATIO", 0.005)
    is_image_input = os.path.splitext(video_path)[1].lower() in {".jpg", ".jpeg", ".png", ".webp"}

    model = YOLO(model_path)
    tracker = DeepSort(max_age=tracker_max_age, n_init=tracker_n_init)
    cap = None

    if is_image_input:
        image_frame = cv2.imread(video_path)
        if image_frame is None:
            raise RuntimeError("Unable to open captured image.")
        fps = 1.0
        frame_width = int(image_frame.shape[1] or 0)
        frame_height = int(image_frame.shape[0] or 0)
    else:
        image_frame = None
        cap = cv2.VideoCapture(video_path)

        if not cap.isOpened():
            raise RuntimeError("Unable to open video file.")

        fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
        if fps <= 0:
            fps = 25.0

        frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

    frame_index = 0
    processed_frames = 0
    unique_track_ids = set()
    movements = defaultdict(list)
    track_stats = {}
    notable_moments = []
    seen_moment_keys = set()
    occupancy_samples = []
    latest_raw_detections = []

    while True:
        if is_image_input:
            if frame_index > 0:
                break
            ok = image_frame is not None
            frame = image_frame.copy() if image_frame is not None else None
        else:
            ok, frame = cap.read()

        if not ok:
            break

        if frame_index % frame_stride != 0:
            frame_index += 1
            continue

        processed_frames += 1
        timestamp_seconds = frame_index / fps
        results = model.predict(frame, verbose=False, classes=[0], conf=confidence_threshold)
        detections = []
        frame_raw_detections = []

        for result in results:
            for box in result.boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                confidence = float(box.conf[0].item())
                if confidence < confidence_threshold:
                    continue
                box_width = max(0.0, float(x2 - x1))
                box_height = max(0.0, float(y2 - y1))
                frame_area = max(1.0, float(frame_width * frame_height))
                area_ratio = (box_width * box_height) / frame_area
                if area_ratio < min_box_area_ratio:
                    continue
                frame_raw_detections.append(
                    {
                        "label": "person",
                        "confidence": round(confidence, 3),
                        "areaRatio": round(area_ratio, 4),
                        "box": {
                            "x1": round(float(x1), 2),
                            "y1": round(float(y1), 2),
                            "x2": round(float(x2), 2),
                            "y2": round(float(y2), 2),
                            "width": round(box_width, 2),
                            "height": round(box_height, 2),
                            "centerX": round(float((x1 + x2) / 2), 2),
                            "centerY": round(float((y1 + y2) / 2), 2),
                        },
                    }
                )
                detections.append(([x1, y1, box_width, box_height], confidence, "person"))

        latest_raw_detections = frame_raw_detections

        tracks = tracker.update_tracks(detections, frame=frame)
        active_tracks = 0

        for track in tracks:
            if not track.is_confirmed():
                continue

            track_id = int(track.track_id)
            ltrb = track.to_ltrb()
            center_x = round((ltrb[0] + ltrb[2]) / 2, 2)
            center_y = round((ltrb[1] + ltrb[3]) / 2, 2)
            side = classify_side(center_x, frame_width)
            unique_track_ids.add(track_id)
            active_tracks += 1
            if not movements[str(track_id)] or frame_index % path_point_stride == 0:
                movements[str(track_id)].append(
                    {
                        "frame": frame_index,
                        "timeSeconds": round(timestamp_seconds, 2),
                        "x": center_x,
                        "y": center_y,
                    }
                )

            stats = track_stats.setdefault(
                track_id,
                {
                    "firstFrame": frame_index,
                    "lastFrame": frame_index,
                    "firstSeenSeconds": timestamp_seconds,
                    "lastSeenSeconds": timestamp_seconds,
                    "firstSide": side,
                    "lastSide": side,
                    "dwellLogged": False,
                },
            )
            stats["lastFrame"] = frame_index
            stats["lastSeenSeconds"] = timestamp_seconds
            stats["lastBox"] = {
                "x1": round(float(ltrb[0]), 2),
                "y1": round(float(ltrb[1]), 2),
                "x2": round(float(ltrb[2]), 2),
                "y2": round(float(ltrb[3]), 2),
                "width": round(float(ltrb[2] - ltrb[0]), 2),
                "height": round(float(ltrb[3] - ltrb[1]), 2),
                "centerX": center_x,
                "centerY": center_y,
            }

            if len(movements[str(track_id)]) == 1:
                add_moment(
                    notable_moments,
                    seen_moment_keys,
                    frame_index,
                    timestamp_seconds,
                    "entry",
                    track_id,
                    f"Person entered from the {side} side of {zone_name}.",
                )

            if stats["lastSide"] != side:
                add_moment(
                    notable_moments,
                    seen_moment_keys,
                    frame_index,
                    timestamp_seconds,
                    "transition",
                    track_id,
                    f"Person moved from {stats['lastSide']} to {side}.",
                )
                stats["lastSide"] = side

            dwell_seconds = stats["lastSeenSeconds"] - stats["firstSeenSeconds"]
            if dwell_seconds >= min_dwell_seconds and not stats["dwellLogged"]:
                add_moment(
                    notable_moments,
                    seen_moment_keys,
                    frame_index,
                    timestamp_seconds,
                    "dwell",
                    track_id,
                    f"Person remained visible for {round(dwell_seconds, 1)} seconds.",
                )
                stats["dwellLogged"] = True

        occupancy_samples.append(active_tracks)

        if occupancy_samples and active_tracks == max(occupancy_samples) and active_tracks > 1:
            add_moment(
                notable_moments,
                seen_moment_keys,
                frame_index,
                timestamp_seconds,
                "crowding",
                None,
                f"Peak occupancy reached {active_tracks} people in {zone_name}.",
            )

        frame_index += 1

    if cap is not None:
        cap.release()

    track_summaries = []
    latest_detections = []
    for track_id, path in movements.items():
        numeric_track_id = int(track_id)
        stats = track_stats.get(numeric_track_id, {})
        dwell_seconds = max(0.0, stats.get("lastSeenSeconds", 0.0) - stats.get("firstSeenSeconds", 0.0))
        latest_box = stats.get("lastBox") or {}
        track_summaries.append(
            {
                "trackId": numeric_track_id,
                "firstSide": stats.get("firstSide", "unknown"),
                "lastSide": stats.get("lastSide", "unknown"),
                "dwellSeconds": round(dwell_seconds, 2),
                "lastBox": latest_box,
                "path": path,
            }
        )

        if latest_box:
            latest_detections.append(
                {
                    "trackId": numeric_track_id,
                    "side": stats.get("lastSide", "unknown"),
                    "dwellSeconds": round(dwell_seconds, 2),
                    "box": latest_box,
                }
            )

    track_summaries.sort(key=lambda item: item["trackId"])
    latest_detections.sort(key=lambda item: item["trackId"])
    peak_occupancy = max(occupancy_samples) if occupancy_samples else 0
    average_occupancy = (
        round(sum(occupancy_samples) / len(occupancy_samples), 2) if occupancy_samples else 0.0
    )
    effective_visitor_count = len(unique_track_ids) if len(unique_track_ids) > 0 else len(latest_raw_detections)

    summary = {
        "analysisId": analysis_id,
        "zone": zone_name,
        "sourceMode": "image" if is_image_input else "video",
        "framesProcessed": frame_index,
        "processedFrames": processed_frames,
        "frameStride": frame_stride,
        "trackCount": len(unique_track_ids),
        "visitorCount": effective_visitor_count,
        "peakOccupancy": peak_occupancy,
        "averageOccupancy": average_occupancy,
        "videoMeta": {
            "fps": round(fps, 2),
            "width": frame_width,
            "height": frame_height,
            "durationSeconds": round(frame_index / fps, 2) if fps > 0 else None,
        },
        "config": {
            "modelPath": model_path,
            "confidenceThreshold": confidence_threshold,
            "frameStride": frame_stride,
            "pathPointStride": path_point_stride,
            "minDwellSeconds": min_dwell_seconds,
            "minPersonBoxRatio": min_box_area_ratio,
        },
        "rawDetectionCount": len(latest_raw_detections),
        "latestRawDetections": latest_raw_detections,
        "latestDetections": latest_detections,
        "tracks": track_summaries,
        "notableMoments": notable_moments[:max_moments],
    }

    print(json.dumps(summary))


if __name__ == "__main__":
    main()
