"use client";

import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Zone } from "@/types";
import zonesData from "@/data/zones.json";

const zones = zonesData as Zone[];

const statusColor: Record<string, string> = {
  "운행 중": "#22c55e",
  "준비 중": "#eab308",
};

export default function MapView() {
  return (
    <MapContainer
      center={[37.5, 127.0]}
      zoom={11}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {zones.map((zone) => (
        <CircleMarker
          key={zone.id}
          center={[zone.lat, zone.lng]}
          radius={Math.sqrt(zone.area_km2) * 8}
          pathOptions={{
            color: statusColor[zone.status] || "#9ca3af",
            fillColor: statusColor[zone.status] || "#9ca3af",
            fillOpacity: 0.3,
            weight: 2,
          }}
        >
          <Popup>
            <div className="text-sm">
              <p className="font-bold">{zone.name}</p>
              <p className="text-gray-600">{zone.region}</p>
              <p>면적: {zone.area_km2}km²</p>
              <p>상태: {zone.status}</p>
              {zone.companies.length > 0 && (
                <p>운행사: {zone.companies.join(", ")}</p>
              )}
              <p className="text-gray-500 mt-1">{zone.description}</p>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
