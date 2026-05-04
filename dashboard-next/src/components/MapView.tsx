"use client";

import {
  MapContainer,
  TileLayer,
  Polygon,
  Tooltip,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import type { LatLngExpression } from "leaflet";
import type { Zone, ZoneBoundary, ZoneRing } from "@/types";
import zonesData from "@data/zones.json";
import {
  COMPANY_COLORS,
  DEFAULT_COLOR,
  LIGHT_TILE_URL,
  LIGHT_TILE_ATTR,
  REGIONS,
  type RegionKey,
} from "@/lib/map-constants";

const zones = zonesData as Zone[];

/**
 * Narrow `ZoneBoundary` (single ring | array of rings) to an array of rings
 * we can render. Locked-in by /plan-eng-review 2026-04-17 (zone-polygons-v1
 * Action Item #3 — `boundary` may be MultiPolygon when turf.union returns one
 * for non-adjacent 행정동, e.g. 제주공항 + 중문).
 *
 * Detection: a single ring has shape `[[lat, lng], ...]` so `boundary[0][0]`
 * is a number. A MultiPolygon has `[[[lat, lng], ...], ...]` so `[0][0]` is
 * an array. Stable runtime check — Leaflet's `<Polygon>` accepts either, but
 * mouseover handlers + key uniqueness are easier with one ring per component.
 */
function asRings(boundary: ZoneBoundary): ZoneRing[] {
  if (boundary.length === 0) return [];
  const first = boundary[0] as unknown[];
  if (first.length > 0 && Array.isArray(first[0])) {
    return boundary as ZoneRing[];
  }
  return [boundary as ZoneRing];
}

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
      className="light-map"
    >
      <TileLayer attribution={LIGHT_TILE_ATTR} url={LIGHT_TILE_URL} />
      <FlyToHandler region={activeRegion} />
      {filtered.flatMap((zone) => {
        const color = getZoneColor(zone);
        const isActive = zone.status === "운행 중";
        const rings = asRings(zone.boundary);
        return rings.map((ring, ringIdx) => (
          <Polygon
            key={`${zone.id}-${ringIdx}`}
            positions={ring as LatLngExpression[]}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: isActive ? 0.25 : 0.1,
              weight: 2,
              opacity: 0.8,
            }}
            eventHandlers={{
              click: () => onZoneClick(zone),
              mouseover: (e) => {
                e.target.setStyle({
                  fillOpacity: isActive ? 0.45 : 0.3,
                  weight: 3,
                  opacity: 1,
                });
              },
              mouseout: (e) => {
                e.target.setStyle({
                  fillOpacity: isActive ? 0.25 : 0.1,
                  weight: 2,
                  opacity: 0.8,
                });
              },
            }}
          >
            <Tooltip
              className="light-tooltip"
              direction="center"
              permanent={false}
            >
              <span className="font-medium">{zone.name}</span>
              <br />
              <span className="text-gray-500">
                {zone.area_km2} km² · {zone.companies.length > 0 ? zone.companies.join(", ") : "운행사 미정"}
              </span>
              {zone.dong_names && zone.dong_names.length > 0 && (
                <>
                  <br />
                  <span className="text-gray-400 text-[11px]">
                    행정동 {zone.dong_names.length}개:{" "}
                    {zone.dong_names.length <= 4
                      ? zone.dong_names.join(", ")
                      : `${zone.dong_names.slice(0, 3).join(", ")} 외 ${zone.dong_names.length - 3}`}
                  </span>
                </>
              )}
            </Tooltip>
          </Polygon>
        ));
      })}
    </MapContainer>
  );
}
