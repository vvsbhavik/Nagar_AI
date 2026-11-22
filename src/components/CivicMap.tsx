import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { getMarkerHex } from '../lib/api.ts';
import type { ComplaintSummary, DuplicateGroup, Ward } from '../shared/types.ts';

interface CivicMapProps {
  wards: Ward[];
  complaints?: ComplaintSummary[];
  clusters?: DuplicateGroup[];
  selectedLocation?: { lat: number; lng: number } | null;
  highlightWardId?: string | null;
  interactivePicker?: boolean;
  onPickLocation?: (lat: number, lng: number) => void;
  onSelectComplaint?: (complaintId: string) => void;
  heightClass?: string;
  showWardBoundaries?: boolean;
  showClusters?: boolean;
  showHeatmap?: boolean;
  center?: [number, number];
  zoom?: number;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function CivicMap({
  wards,
  complaints = [],
  clusters = [],
  selectedLocation = null,
  highlightWardId = null,
  interactivePicker = false,
  onPickLocation,
  onSelectComplaint,
  heightClass = 'h-[420px]',
  showWardBoundaries = true,
  showClusters = true,
  showHeatmap = false,
  center = [17.434, 78.426],
  zoom = 12,
}: CivicMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const pickerMarkerRef = useRef<L.CircleMarker | null>(null);
  const onPickRef = useRef(onPickLocation);
  const onSelectRef = useRef(onSelectComplaint);

  onPickRef.current = onPickLocation;
  onSelectRef.current = onSelectComplaint;

  // Initialize Leaflet map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center,
      zoom,
      zoomControl: true,
      scrollWheelZoom: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors · NagarAI Demo GIS',
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    const handleClick = (e: L.LeafletMouseEvent) => {
      if (interactivePicker && onPickRef.current) {
        onPickRef.current(
          Math.round(e.latlng.lat * 100000) / 100000,
          Math.round(e.latlng.lng * 100000) / 100000
        );
      }
    };
    map.on('click', handleClick);

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.off('click', handleClick);
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
      pickerMarkerRef.current = null;
    };
  }, [interactivePicker]);

  // Render ward boundaries, cluster rings, and complaint markers
  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    // 1. Ward Polygon Boundaries (clearly labeled demo GIS polygons)
    if (showWardBoundaries) {
      for (const ward of wards) {
        const ring = ward.boundaryGeojson?.coordinates?.[0];
        if (!ring) continue;
        const latLngs = ring.map(([lng, lat]) => [lat, lng] as [number, number]);
        const isHighlighted = highlightWardId === ward.id;

        const poly = L.polygon(latLngs, {
          color: isHighlighted ? '#0F7B55' : '#113829',
          weight: isHighlighted ? 2.5 : 1.25,
          opacity: isHighlighted ? 0.9 : 0.45,
          fillColor: isHighlighted ? '#0F7B55' : '#113829',
          fillOpacity: isHighlighted ? 0.14 : 0.04,
          dashArray: isHighlighted ? undefined : '4 4',
        });

        poly.bindTooltip(
          `<div style="font-size:11px;font-weight:600;color:#113829">${escapeHtml(ward.code)} · ${escapeHtml(ward.name)}</div><div style="font-size:10px;color:#5A635D">Demo Ward Boundary</div>`,
          { sticky: true, direction: 'top', opacity: 0.94 }
        );
        poly.addTo(group);
      }
    }

    // 2. Duplicate / Hotspot Cluster Rings
    if (showClusters) {
      for (const cl of clusters) {
        const ring = L.circle([cl.centerLat, cl.centerLng], {
          radius: 340,
          color: cl.priority === 'Critical' ? '#DC2626' : '#D97706',
          weight: 1.5,
          dashArray: '5 4',
          fillColor: cl.priority === 'Critical' ? '#DC2626' : '#D97706',
          fillOpacity: 0.1,
        });
        ring.bindTooltip(
          `<div style="font-size:11px;font-weight:600;color:#181C19">${escapeHtml(cl.category)} Cluster (${cl.reportCount} reports)</div><div style="font-size:10px;color:#5A635D">${escapeHtml(cl.addressLabel)}</div>`,
          { direction: 'top' }
        );
        ring.addTo(group);
      }
    }

    // 3. Individual Civic Issue Markers
    for (const c of complaints) {
      const hex = getMarkerHex(c);
      const isCrit = c.severity === 'Critical' && c.status !== 'Citizen Verified' && c.status !== 'Resolved';

      const marker = L.circleMarker([c.latitude, c.longitude], {
        radius: isCrit ? 9 : 7,
        color: '#FFFFFF',
        weight: 2,
        fillColor: hex,
        fillOpacity: 0.95,
      });

      const popupEl = document.createElement('div');
      popupEl.style.minWidth = '210px';
      popupEl.innerHTML = `
        <div style="font-family:JetBrains Mono,monospace;font-size:11px;font-weight:600;color:#113829;margin-bottom:4px;">
          ${escapeHtml(c.trackingCode)} · ${escapeHtml(c.severity)}
        </div>
        <div style="font-size:13px;font-weight:600;color:#181C19;margin-bottom:4px;">
          ${escapeHtml(c.title)}
        </div>
        <div style="font-size:11px;color:#5A635D;margin-bottom:8px;">
          ${escapeHtml(c.category)} · ${escapeHtml(c.wardName || 'Demo Zone')} · ${escapeHtml(c.status)}
        </div>
      `;

      if (onSelectRef.current) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'Inspect Record →';
        btn.style.cssText =
          'width:100%;padding:6px 10px;background:#113829;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;';
        btn.onclick = () => onSelectRef.current?.(c.id);
        popupEl.appendChild(btn);
      }

      marker.bindPopup(popupEl);
      marker.addTo(group);
    }

    // 4. Optional City Issue Heatmap Overlay (density/severity-weighted radial heat zones)
    if (showHeatmap) {
      for (const c of complaints) {
        const isClosed = c.status === 'Citizen Verified' || c.status === 'Resolved';
        if (isClosed) continue;
        const heatColor =
          c.severity === 'Critical'
            ? '#DC2626'
            : c.severity === 'High'
            ? '#EA580C'
            : '#D97706';
        const outer = L.circle([c.latitude, c.longitude], {
          radius: c.severity === 'Critical' ? 680 : 480,
          stroke: false,
          fillColor: heatColor,
          fillOpacity: c.severity === 'Critical' ? 0.16 : 0.1,
          interactive: false,
        });
        const inner = L.circle([c.latitude, c.longitude], {
          radius: c.severity === 'Critical' ? 280 : 210,
          stroke: false,
          fillColor: heatColor,
          fillOpacity: c.severity === 'Critical' ? 0.24 : 0.15,
          interactive: false,
        });
        outer.addTo(group);
        inner.addTo(group);
      }
    }
  }, [wards, complaints, clusters, highlightWardId, showWardBoundaries, showClusters, showHeatmap]);

  // Selected pin marker (for report picker or detail focus)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (pickerMarkerRef.current) {
      pickerMarkerRef.current.remove();
      pickerMarkerRef.current = null;
    }

    if (selectedLocation) {
      const pin = L.circleMarker([selectedLocation.lat, selectedLocation.lng], {
        radius: 10,
        color: '#FFFFFF',
        weight: 3,
        fillColor: '#0F7B55',
        fillOpacity: 1,
      }).addTo(map);
      pin.bindTooltip('Selected Issue Location', { direction: 'top', offset: [0, -8] });
      pickerMarkerRef.current = pin;
      map.panTo([selectedLocation.lat, selectedLocation.lng], { animate: true, duration: 0.35 });
    }
  }, [selectedLocation]);

  // Pan to highlighted ward when ward filter changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !highlightWardId || selectedLocation) return;
    const target = wards.find((w) => w.id === highlightWardId);
    if (target) {
      map.setView([target.centerLat, target.centerLng], 13, { animate: true });
    }
  }, [highlightWardId, wards, selectedLocation]);

  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-[#E4E4DD] bg-[#ECEEE9]">
      <div ref={containerRef} className={`w-full ${heightClass}`} />
      <div className="pointer-events-none absolute bottom-2.5 left-2.5 z-[400] flex flex-wrap items-center gap-3 rounded-md border border-[#E4E4DD] bg-white/95 px-3 py-1.5 text-[11px] font-medium text-[#181C19] shadow-xs backdrop-blur-xs">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#DC2626]" /> Critical
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#EA580C]" /> High
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#D97706]" /> Medium
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#2563EB]" /> Low
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#15803D]" /> Resolved
        </span>
        {showWardBoundaries && (
          <span className="text-[#5A635D]">· Dashed lines: Demo Ward Polygons</span>
        )}
      </div>
    </div>
  );
}
