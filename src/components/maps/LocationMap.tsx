'use client';

import { useEffect, useRef, useState } from 'react';

interface LocationMapProps {
  className?: string;
  lat?: number | null;
  lng?: number | null;
  zoom?: number;
  title?: string;
  address?: string;
}

export default function LocationMap({ 
  className = "h-80", 
  lat,
  lng,
  zoom = 15,
  title = "Location",
  address
}: LocationMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [isClient, setIsClient] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  const createPopupContent = (title: string, address?: string, lat?: number, lng?: number) => {
    let content = `<div style="text-align: center; padding: 8px;">
      <strong style="font-size: 14px; color: #1e293b;">📍 ${title}</strong>`;
    
    if (address) {
      content += `<p style="font-size: 12px; color: #64748b; margin: 4px 0;">${address}</p>`;
    }
    
    if (lat && lng) {
      content += `<p style="font-size: 10px; color: #94a3b8; margin: 4px 0;">
        Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}
      </p>`;
    }
    
    content += `<div style="margin-top: 8px; display: flex; flex-direction: column; gap: 4px;">
      <a href="https://maps.google.com/maps?q=${lat},${lng}" target="_blank" rel="noopener noreferrer" 
         style="font-size: 11px; color: #0ea5e9; text-decoration: none;">
        Open in Google Maps
      </a>
      <a href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}&zoom=18" target="_blank" rel="noopener noreferrer"
         style="font-size: 11px; color: #0ea5e9; text-decoration: none;">
        Open in OpenStreetMap
      </a>
    </div>
  </div>`;
    
    return content;
  };

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || !mapRef.current || mapLoaded) return;
    if (!lat || !lng) return;

    let mapInstance: any = null;
    let cssLink: HTMLLinkElement | null = null;
    let jsScript: HTMLScriptElement | null = null;

    // Check if Leaflet is already loaded
    // @ts-ignore
    if (window.L && mapRef.current) {
      // @ts-ignore
      const L = window.L;
      mapInstance = L.map(mapRef.current).setView([lat, lng], zoom);
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(mapInstance);

      const marker = L.marker([lat, lng]).addTo(mapInstance);
      const popupContent = createPopupContent(title, address, lat, lng);
      marker.bindPopup(popupContent).openPopup();
      
      setMapLoaded(true);
      return;
    }

    // Load Leaflet CSS
    cssLink = document.createElement('link');
    cssLink.rel = 'stylesheet';
    cssLink.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    cssLink.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    cssLink.crossOrigin = '';
    document.head.appendChild(cssLink);

    // Load Leaflet JS
    jsScript = document.createElement('script');
    jsScript.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    jsScript.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
    jsScript.crossOrigin = '';
    jsScript.onload = () => {
      // @ts-ignore - Leaflet is loaded dynamically
      const L = window.L;
      
      if (!L || !mapRef.current) return;

      mapInstance = L.map(mapRef.current).setView([lat, lng], zoom);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(mapInstance);

      const marker = L.marker([lat, lng]).addTo(mapInstance);
      const popupContent = createPopupContent(title, address, lat, lng);
      marker.bindPopup(popupContent).openPopup();

      setMapLoaded(true);
    };
    document.body.appendChild(jsScript);

    return () => {
      // Cleanup map instance
      if (mapInstance) {
        mapInstance.remove();
      }
      // Cleanup scripts
      if (cssLink && cssLink.parentNode) {
        cssLink.parentNode.removeChild(cssLink);
      }
      if (jsScript && jsScript.parentNode) {
        jsScript.parentNode.removeChild(jsScript);
      }
    };
  }, [isClient, lat, lng, zoom, title, address, mapLoaded]);

  // Loading state
  if (!isClient) {
    return (
      <div className={`${className} bg-slate-100 rounded-lg flex items-center justify-center`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600 mx-auto mb-2"></div>
          <p className="text-slate-600">Loading map...</p>
        </div>
      </div>
    );
  }

  // If no coordinates are provided, show a message
  if (!lat || !lng) {
    return (
      <div className={`${className} bg-slate-100 rounded-lg flex items-center justify-center border border-slate-200`}>
        <div className="text-center p-4">
          <div className="text-slate-400 mb-2 text-4xl">📍</div>
          <p className="text-slate-600 mb-2 font-medium">Location Map</p>
          <p className="text-sm text-slate-500">
            Map coordinates need to be configured in the admin settings
          </p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={mapRef} 
      className={`${className} rounded-lg overflow-hidden border border-slate-200`}
      style={{ minHeight: '200px' }}
    />
  );
}

