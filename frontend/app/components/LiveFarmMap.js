"use client";

import { useCallback, useRef, useState, useMemo } from "react";
import { GoogleMap, InfoWindow } from "@react-google-maps/api";
import { AdvancedMarker } from "./AdvancedMarker";
import { ChevronDown, Locate } from "lucide-react";
import styles from "./LiveFarmMap.module.css";

const BASE_ZONES = [
  {
    id: "zone-greenhouse-a",
    name: "Greenhouse A",
    description: "Temperature-controlled environment for exotic flora propagation and cultivation.",
    lat: 13.0827,
    lng: 77.5797,
  },
  {
    id: "zone-packing-unit",
    name: "Packing Unit",
    description: "Central processing, grading, quality check, and packaging facility.",
    lat: 13.1377,
    lng: 77.4875,
  },
  {
    id: "zone-visitor-gate",
    name: "Visitor Gate",
    description: "Main entrance and security checkpoint for farm visitors and logistics.",
    lat: 12.9507,
    lng: 77.5848,
  },
  {
    id: "zone-nursery-bay",
    name: "Nursery Bay",
    description: "Seedling propagation and early growth stage area for seasonal plants.",
    lat: 12.8008,
    lng: 77.5773,
  }
];

const mapContainerStyle = {
  width: "100%",
  height: "500px",
  borderRadius: "8px",
};

const mapOptions = {
  zoom: 11,
  center: { lat: 12.9716, lng: 77.5946 },
  mapTypeControl: true,
  fullscreenControl: true,
  streetViewControl: false,
  mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID",
  styles: [
    {
      featureType: "all",
      elementType: "labels.text.fill",
      stylers: [{ color: "#8fae97" }],
    },
    {
      featureType: "all",
      elementType: "labels.text.stroke",
      stylers: [{ color: "#0d2818" }],
    },
    {
      featureType: "all",
      elementType: "labels.icon",
      stylers: [{ visibility: "off" }],
    },
    {
      featureType: "administrative",
      elementType: "geometry.fill",
      stylers: [{ color: "#1a3a26" }],
    },
    {
      featureType: "administrative",
      elementType: "geometry.stroke",
      stylers: [{ color: "#0d2818" }],
    },
    {
      featureType: "administrative.country",
      elementType: "geometry.stroke",
      stylers: [{ color: "#2a5a3a" }],
    },
    {
      featureType: "water",
      elementType: "geometry.fill",
      stylers: [{ color: "#1a4d3a" }],
    },
    {
      featureType: "landscape",
      elementType: "geometry.fill",
      stylers: [{ color: "#0d2818" }],
    },
  ],
};

export function LiveFarmMap({ onZoneSelect, selectedZoneId, isLoaded, supervisors = [], workers = [] }) {
  const [activeMarkerId, setActiveMarkerId] = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState("");
  const mapRef = useRef(null);

  const FARM_ZONES = useMemo(() => {
    return BASE_ZONES.map((bz) => {
      // Find supervisor who manages this zone (their zone string contains this zone name)
      const supervisor = supervisors.find(s => s.zone?.includes(bz.name)) || {};
      // Find workers in this specific zone
      const zoneWorkers = workers.filter(w => w.zone === bz.name);
      
      const supName = supervisor.name || "Unassigned";
      
      return {
        ...bz,
        supervisor: supName,
        activeWorkers: zoneWorkers.length,
        // Mock task data for the zone based on overall supervisor data, roughly divided
        tasks: supervisor.activeTasks ? Math.ceil(supervisor.activeTasks / 2) : 0, 
        completed: supervisor.completedToday ? Math.ceil(supervisor.completedToday / 2) : 0,
      };
    });
  }, [supervisors, workers]);

  if (!isLoaded) {
    return (
      <div className={styles.loadingContainer}>
        <p>Loading map...</p>
      </div>
    );
  }

  const selectedZone = FARM_ZONES.find((zone) => zone.id === selectedZoneId) || FARM_ZONES[0];
  const handleMarkerClick = useCallback(
    (zoneId) => {
      setActiveMarkerId(zoneId);
      if (onZoneSelect) {
        onZoneSelect(zoneId);
      }
    },
    [onZoneSelect]
  );

  const handleMapCenter = () => {
    setActiveMarkerId(null);
  };

  const handleNavigateToSelectedZone = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!navigator.geolocation) {
      setLocationStatus("Live location is not supported in this browser.");
      return;
    }

    setLocationStatus("Finding your current location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const origin = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setCurrentLocation(origin);
        setLocationStatus(`Directions ready for ${selectedZone.name}.`);

        if (mapRef.current) {
          mapRef.current.panTo(origin);
          mapRef.current.setZoom(12);
        }

        const directionsUrl =
          `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}` +
          `&destination=${selectedZone.lat},${selectedZone.lng}&travelmode=driving`;

        window.open(directionsUrl, "_blank", "noopener,noreferrer");
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? "Location access was blocked. Allow location permission to start navigation."
            : "Unable to read your current location right now.";
        setLocationStatus(message);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  }, [selectedZone]);

  return (
    <div className={styles.container}>
      <div className={styles.mapWrapper}>
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          options={mapOptions}
          zoom={17}
          center={{ lat: selectedZone.lat, lng: selectedZone.lng }}
          onLoad={(map) => (mapRef.current = map)}
        >
          {FARM_ZONES.map((zone) => (
            <AdvancedMarker
              key={zone.id}
              position={{ lat: zone.lat, lng: zone.lng }}
              title={zone.name}
              onClick={() => handleMarkerClick(zone.id)}
            >
              <svg viewBox="0 0 24 24" width="36" height="36" style={{ cursor: "pointer" }}>
                <path
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"
                  fill={zone.id === selectedZoneId ? "#4ade80" : "#8fae97"}
                  stroke="#0d2818"
                  strokeWidth="1.5"
                />
              </svg>
            </AdvancedMarker>
          ))}
          {activeMarkerId && (() => {
            const activeZone = FARM_ZONES.find(z => z.id === activeMarkerId);
            if (!activeZone) return null;
            return (
              <InfoWindow
                position={{ lat: activeZone.lat, lng: activeZone.lng }}
                onCloseClick={() => setActiveMarkerId(null)}
              >
                <div className={styles.infoWindow}>
                  <h3>{activeZone.name}</h3>
                  <p>{activeZone.description}</p>
                  <div className={styles.infoStats}>
                    <div>
                      <span>Workers</span>
                      <strong>{activeZone.activeWorkers}</strong>
                    </div>
                    <div>
                      <span>Tasks</span>
                      <strong>{activeZone.tasks}</strong>
                    </div>
                    <div>
                      <span>Supervisor</span>
                      <strong>{activeZone.supervisor}</strong>
                    </div>
                  </div>
                </div>
              </InfoWindow>
            );
          })()}
          {currentLocation ? (
            <AdvancedMarker
              position={currentLocation}
              title="Your current location"
            >
              <svg viewBox="0 0 24 24" width="16" height="16">
                <circle
                  cx="12"
                  cy="12"
                  r="8"
                  fill="#fef08a"
                  stroke="#0d2818"
                  strokeWidth="2"
                />
              </svg>
            </AdvancedMarker>
          ) : null}
        </GoogleMap>

        <button
          className={styles.centerButton}
          onClick={handleNavigateToSelectedZone}
          title={`Navigate to ${selectedZone.name}`}
          type="button"
        >
          <Locate size={18} />
        </button>
      </div>

      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h3>Bengaluru Farms</h3>
          <p>{selectedZone.name}</p>
          {locationStatus ? <span className={styles.locationStatus}>{locationStatus}</span> : null}
        </div>

        <div className={styles.zoneList}>
          {FARM_ZONES.map((zone) => (
            <button
              key={zone.id}
              className={`${styles.zoneCard} ${selectedZoneId === zone.id ? styles.active : ""}`}
              onClick={() => handleMarkerClick(zone.id)}
            >
              <div className={styles.zoneCardHeader}>
                <h4>{zone.name}</h4>
                <ChevronDown size={16} />
              </div>
              <p className={styles.zoneDescription}>{zone.description}</p>
              <div className={styles.zoneStats}>
                <div>
                  <span>Workers</span>
                  <strong>{zone.activeWorkers}</strong>
                </div>
                <div>
                  <span>Tasks</span>
                  <strong>{zone.completed}/{zone.tasks}</strong>
                </div>
                <div>
                  <span>Supervisor</span>
                  <em>{zone.supervisor}</em>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
