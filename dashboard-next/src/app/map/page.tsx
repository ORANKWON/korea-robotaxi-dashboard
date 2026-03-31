"use client";

import dynamic from "next/dynamic";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

export default function MapPage() {
  return (
    <div>
      <h1 className="text-xl font-bold mb-4">시범운행지구 지도</h1>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden" style={{ height: "70vh" }}>
        <MapView />
      </div>
    </div>
  );
}
