"use client";

import { useCallback, useState } from "react";
import { useJsApiLoader } from "@react-google-maps/api";
import { LiveFarmMap } from "./LiveFarmMap";
import styles from "./LiveFarmMap.module.css";

// Note: Replace with your actual Google Maps API key
// Get it from: https://console.cloud.google.com/apis/credentials
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "YOUR_API_KEY_HERE";

const libraries = ["places", "visualization", "marker"];

export function LiveFarmMapContainer({ supervisors = [], workers = [] }) {
  const [selectedZoneId, setSelectedZoneId] = useState("zone-a");

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries,
  });

  const handleZoneSelect = useCallback((zoneId) => {
    setSelectedZoneId(zoneId);
  }, []);

  if (GOOGLE_MAPS_API_KEY === "YOUR_API_KEY_HERE" || loadError) {
    return (
      <div className={styles.mapStateCard} role="status" aria-live="polite">
        <p className={styles.mapStateTitle}>
          {loadError ? "Google Maps setup needs attention" : "Google Maps API key not configured"}
        </p>
        <p className={styles.mapStateText}>
          {loadError
            ? "The configured key is invalid, restricted, or missing Maps JavaScript API access. Check the Google Cloud Console settings."
            : "Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to frontend/.env.local to enable the live farm map."}
        </p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className={styles.mapStateCard} role="status" aria-live="polite">
        <p className={styles.mapStateTitle}>Loading map</p>
        <p className={styles.mapStateText}>Preparing the live zone view and location controls.</p>
      </div>
    );
  }

  return (
    <LiveFarmMap
      onZoneSelect={handleZoneSelect}
      selectedZoneId={selectedZoneId}
      isLoaded={isLoaded}
      supervisors={supervisors}
      workers={workers}
    />
  );
}
