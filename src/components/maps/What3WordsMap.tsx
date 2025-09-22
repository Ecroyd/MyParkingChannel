'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

/**
 * What3WordsMap Component
 * 
 * Displays an interactive map using OpenStreetMap and Leaflet.
 * 
 * Usage:
 * 1. With What3Words: <What3WordsMap what3words="///heartless.baquette.splinters" />
 * 2. With address: <What3WordsMap fallbackAddress="123 Main St, City" />
 * 3. With coordinates: <What3WordsMap coordinates={{lat: 51.5074, lng: -0.1278}} />
 * 
 * Note: What3Words API requires a valid API key for coordinate conversion.
 * Without a key, the component will show navigation links instead of a map.
 */

// Dynamically import Leaflet components to avoid SSR issues
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });

interface What3WordsMapProps {
  what3words: string;
  fallbackAddress?: string;
  className?: string;
  coordinates?: { lat: number; lng: number };
}

interface Coordinates {
  lat: number;
  lng: number;
}

export default function What3WordsMap({ what3words, fallbackAddress, className = "h-64", coordinates: propCoordinates }: What3WordsMapProps) {
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  console.log('What3WordsMap component rendered with:', { what3words, fallbackAddress, propCoordinates });

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;

    const getCoordinates = async () => {
      try {
        setLoading(true);
        setError(null);

        // Strategy 1: Use provided coordinates if available
        if (propCoordinates) {
          setCoordinates(propCoordinates);
          setLoading(false);
          return;
        }

        // Strategy 2: Try to geocode the fallback address (most reliable)
        if (fallbackAddress) {
          try {
            console.log('Attempting to geocode address:', fallbackAddress);
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fallbackAddress)}&limit=1`);
            const data = await response.json();
            
            console.log('Geocoding response:', data);
            
            if (data && data.length > 0) {
              const coords = {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon)
              };
              console.log('Setting coordinates:', coords);
              setCoordinates(coords);
              setLoading(false);
              return;
            } else {
              console.log('No geocoding results found');
            }
          } catch (fallbackErr) {
            console.error('Fallback geocoding failed:', fallbackErr);
          }
        }

        // Strategy 3: What3Words API (requires valid API key)
        if (what3words) {
          console.log('What3Words location available:', what3words);
          setError('What3Words location available - click the link below to view');
        } else {
          setError('Unable to load map location. Please use the navigation links below.');
        }
      } finally {
        setLoading(false);
      }
    };

    getCoordinates();
  }, [what3words, fallbackAddress, isClient, propCoordinates]);

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

  if (loading) {
    return (
      <div className={`${className} bg-slate-100 rounded-lg flex items-center justify-center`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600 mx-auto mb-2"></div>
          <p className="text-slate-600">Converting location...</p>
        </div>
      </div>
    );
  }

  if (error || !coordinates) {
    return (
      <div className={`${className} bg-slate-100 rounded-lg flex items-center justify-center`}>
        <div className="text-center">
          <div className="text-slate-400 mb-2">📍</div>
          <p className="text-slate-600 mb-2">Interactive Map</p>
          <p className="text-sm text-slate-500 mb-4">
            {what3words 
              ? 'What3Words location available - use the links below for navigation'
              : error || 'Unable to load location'
            }
          </p>
          <div className="space-y-2">
            {what3words && (
              <a
                href={`https://what3words.com/${what3words.replace('///', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700 transition-colors text-sm font-medium"
              >
                View on What3Words
              </a>
            )}
            {fallbackAddress && (
              <a
                href={`https://maps.google.com/maps?q=${encodeURIComponent(fallbackAddress)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sky-600 hover:text-sky-700 font-medium text-sm"
              >
                Open in Google Maps
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className} rounded-lg overflow-hidden`}>
      <MapContainer
        center={[coordinates.lat, coordinates.lng]}
        zoom={18}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[coordinates.lat, coordinates.lng]}>
          <Popup>
            <div className="text-center">
              <p className="font-semibold">📍 {what3words}</p>
              {fallbackAddress && (
                <p className="text-sm text-slate-600 mt-1">{fallbackAddress}</p>
              )}
              <div className="mt-2 space-y-1">
                <a
                  href={`https://what3words.com/${what3words.replace('///', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-sky-600 hover:text-sky-700"
                >
                  View on What3Words
                </a>
                <a
                  href={`https://maps.google.com/maps?q=${coordinates.lat},${coordinates.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-sky-600 hover:text-sky-700"
                >
                  Open in Google Maps
                </a>
              </div>
            </div>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
