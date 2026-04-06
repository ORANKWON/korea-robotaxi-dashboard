"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import type { Zone } from "@/types";
import type { RegionKey } from "@/lib/map-constants";
import MapHeader from "@/components/map/MapHeader";
import CompanyFilter from "@/components/map/CompanyFilter";
import RegionTabs from "@/components/map/RegionTabs";
import ZoneDetailPanel from "@/components/map/ZoneDetailPanel";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

export default function MapPage() {
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
  const [activeCompany, setActiveCompany] = useState<string | null>(null);
  const [activeRegion, setActiveRegion] = useState<RegionKey>("capital");

  const handleZoneClick = useCallback((zone: Zone) => {
    setSelectedZone(zone);
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedZone(null);
  }, []);

  return (
    <div className="fixed inset-0 z-40 bg-black" style={{ top: "3.5rem" }}>
      {/* Full-viewport map */}
      <MapView
        activeCompany={activeCompany}
        activeRegion={activeRegion}
        onZoneClick={handleZoneClick}
      />

      {/* Floating controls - above Leaflet layers (z-400) */}
      <div className="absolute inset-0 pointer-events-none z-[1000]">
        <div className="pointer-events-auto">
          <MapHeader />
        </div>
        <div className="pointer-events-auto">
          <CompanyFilter activeCompany={activeCompany} onToggle={setActiveCompany} />
        </div>
        <div className="pointer-events-auto">
          <RegionTabs activeRegion={activeRegion} onSelect={setActiveRegion} />
        </div>
        <div className="pointer-events-auto">
          <ZoneDetailPanel zone={selectedZone} onClose={handleClosePanel} />
        </div>
      </div>
    </div>
  );
}
