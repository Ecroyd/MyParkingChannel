'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamic imports to avoid SSR issues
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });

interface LocationMapProps {
  className?: string;
  lat?: number;
  lng?: number;
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
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Default coordinates (London) if none provided
  const defaultLat = 51.5074;
  const defaultLng = -0.1278;
  
  const mapLat = lat || defaultLat;
  const mapLng = lng || defaultLng;

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
      <div className={`${className} bg-slate-100 rounded-lg flex items-center justify-center`}>
        <div className="text-center">
          <div className="text-slate-400 mb-2">📍</div>
          <p className="text-slate-600 mb-2">Location Map</p>
          <p className="text-sm text-slate-500">
            Map coordinates need to be configured in the admin settings
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className} rounded-lg overflow-hidden border border-slate-200`}>
      <MapContainer
        center={[mapLat, mapLng]}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[mapLat, mapLng]}>
          <Popup>
            <div className="text-center p-2">
              <p className="font-semibold text-slate-800">📍 {title}</p>
              {address && (
                <p className="text-sm text-slate-600 mt-1">{address}</p>
              )}
              <p className="text-xs text-slate-500 mt-1">
                Lat: {mapLat.toFixed(6)}, Lng: {mapLng.toFixed(6)}
              </p>
              <div className="mt-2 space-y-1">
                <a
                  href={`https://maps.google.com/maps?q=${mapLat},${mapLng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-sky-600 hover:text-sky-700"
                >
                  Open in Google Maps
                </a>
                <a
                  href={`https://www.openstreetmap.org/?mlat=${mapLat}&mlon=${mapLng}&zoom=18`}
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
