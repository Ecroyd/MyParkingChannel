'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css'; // ensure Leaflet CSS is loaded
import markerPin from '/public/marker-pin.png'; // <-- robust import (works in dev/prod)

// Dynamic imports to avoid SSR issues
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });

interface SimpleMapProps {
  className?: string;
  lat?: number;
  lng?: number;
  zoom?: number;
  title?: string;
}

export default function SimpleMap({ 
  className = "h-64", 
  lat = 51.5074, 
  lng = -0.1278, 
  zoom = 13,
  title = "Location"
}: SimpleMapProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

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

  return (
    <div className={`${className} rounded-lg overflow-hidden border border-slate-200`}>
      <MapContainer
        center={[lat, lng]}
        zoom={zoom}
        style={{ height: '100%', width: '100%', minHeight: '200px' }}
        scrollWheelZoom={true}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker 
          position={[lat, lng]}
          icon={typeof window !== 'undefined' ? (() => {
            // Create custom icon on client side only
            const L = require('leaflet');
            return L.icon({
              iconUrl: (markerPin as unknown as { src: string }).src, // <-- use imported URL
              iconSize: [32, 32],
              iconAnchor: [16, 32],
              popupAnchor: [0, -28],
            });
          })() : undefined}
        >
          <Popup>
            <div className="text-center p-2">
              <p className="font-semibold text-slate-800">📍 {title}</p>
              <p className="text-sm text-slate-600 mt-1">
                Lat: {lat.toFixed(6)}, Lng: {lng.toFixed(6)}
              </p>
              <div className="mt-2 space-y-1">
                <a
                  href={`https://maps.google.com/maps?q=${lat},${lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-sky-600 hover:text-sky-700"
                >
                  Open in Google Maps
                </a>
                <a
                  href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}&zoom=18`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-sky-600 hover:text-sky-700"
                >
                  Open in OpenStreetMap
                </a>
              </div>
            </div>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
