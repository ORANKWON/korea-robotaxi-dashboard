"use client";

import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Tooltip,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import type { Zone } from "@/types";
import zonesData from "@data/zones.json";
import {
  COMPANY_COLORS,
  DEFAULT_COLOR,
  DARK_TILE_URL,
  DARK_TILE_ATTR,
  REGIONS,
  type RegionKey,
} from "@/lib/map-constants";

const zones = zonesData as Zone[];

function getZoneColor(zone: Zone): string {
  if (zone.companies.length === 0) return DEFAULT_COLOR;
  for (const company of zone.companies) {
    if (COMPANY_COLORS[company]) return COMPANY_COLORS[company];
  }
  return DEFAULT_COLOR;
}

function FlyToHandler({ region }: { region: RegionKey }) {
  const map = useMap();
  useEffect(() => {
    const r = REGIONS[region];
    map.flyTo(r.center, r.zoom, { duration: 1 });
  }, [region, map]);
  return null;
}

interface MapViewProps {
  activeCompany: string | null;
  activeRegion: RegionKey;
  onZoneClick: (zone: Zone) => void;
}

export default function MapView({
  activeCompany,
  activeRegion,
  onZoneClick,
}: MapViewProps) {
  const filtered = activeCompany
    ? zones.filter((z) => z.companies.includes(activeCompany))
    : zones;

  return (
    <MapContainer
      center={REGIONS.capital.center}
      zoom={REGIONS.capital.zoom}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom
      zoomControl={false}
      className="dark-map"
    >
      <TileLayer attribution={DARK_TILE_ATTR} url={DARK_TILE_URL} />
      <FlyToHandler region={activeRegion} />
      {filtered.map((zone) => {
        const color = getZoneColor(zone);
        const isActive = zone.status === "운행 중";
        return (
          <CircleMarker
            key={zone.id}
            center={[zone.lat, zone.lng]}
            radius={Math.sqrt(zone.area_km2) * 8}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: isActive ? 0.35 : 0.15,
              weight: 2,
            }}
            eventHandlers={{
              click: () => onZoneClick(zone),
              mouseover: (e) => {
                const marker = e.target;
                marker.setStyle({
                  fillOpacity: isActive ? 0.55 : 0.35,
                  weight: 3,
                });
              },
              mouseout: (e) => {
                const marker = e.target;
                marker.setStyle({
                  fillOpacity: isActive ? 0.35 : 0.15,
                  weight: 2,
                });
              },
            }}
          >
            <Tooltip className="dark-tooltip" direction="top" offset={[0, -10]}>
              <span className="font-medium">{zone.name}</span>
              <br />
              <span className="text-zinc-400">{zone.region}</span>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
