"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useGoogleMap } from "@react-google-maps/api";

export function AdvancedMarker({ position, title, onClick, children }) {
  const map = useGoogleMap();
  const [contentEl] = useState(() => {
    if (typeof window !== "undefined") {
      const div = document.createElement("div");
      div.style.display = "inline-block";
      return div;
    }
    return null;
  });
  const markerRef = useRef(null);

  useEffect(() => {
    if (!map || !window.google?.maps?.marker?.AdvancedMarkerElement) {
      return;
    }

    const markerOptions = {
      map,
      position,
      title,
    };

    if (children && contentEl) {
      markerOptions.content = contentEl;
    }

    const marker = new window.google.maps.marker.AdvancedMarkerElement(markerOptions);
    markerRef.current = marker;

    let listener = null;
    if (onClick) {
      listener = marker.addListener("click", (e) => {
        if (onClick) onClick(e);
      });
    }

    return () => {
      if (listener) {
        listener.remove();
      }
      marker.map = null;
      markerRef.current = null;
    };
  }, [map, contentEl, position.lat, position.lng, title, onClick, children]);

  if (children && contentEl) {
    return createPortal(children, contentEl);
  }

  return null;
}
