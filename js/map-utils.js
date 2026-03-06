// ============================================
// KurirTrack - Map Utilities (Leaflet)
// ============================================

const MapUtils = {
    maps: {},

    // ---- Create Map ----
    createMap(containerId, options = {}) {
        const defaults = {
            center: APP_CONFIG.MAP_DEFAULT_CENTER,
            zoom: APP_CONFIG.MAP_DEFAULT_ZOOM,
            zoomControl: false,
            attributionControl: false
        };

        const map = L.map(containerId, { ...defaults, ...options });

        // Dark tile layer
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
            subdomains: 'abcd'
        }).addTo(map);

        // Attribution (collapsed)
        L.control.attribution({ prefix: false, position: 'bottomright' })
            .addAttribution('© <a href="https://www.openstreetmap.org/copyright">OSM</a>')
            .addTo(map);

        // Zoom control (custom position)
        L.control.zoom({ position: 'topright' }).addTo(map);

        this.maps[containerId] = map;
        return map;
    },

    // ---- Driver Marker (blue pulsing dot) ----
    createDriverMarker(lat, lng, name, speed) {
        const speedClass = speed > APP_CONFIG.SPEED_LIMIT ? 'speed-danger' :
            speed > APP_CONFIG.SPEED_LIMIT * 0.8 ? 'speed-warn' : 'speed-safe';

        const icon = L.divIcon({
            className: 'driver-marker',
            html: `
        <div class="driver-marker-dot ${speedClass}">
          <div class="driver-marker-pulse"></div>
        </div>
        <div class="driver-marker-label">
          <span class="driver-name">${name}</span>
          <span class="driver-speed">${Math.round(speed)} km/h</span>
        </div>
      `,
            iconSize: [120, 50],
            iconAnchor: [60, 25]
        });

        return L.marker([lat, lng], { icon });
    },

    // ---- Pickup/Dropoff Markers ----
    createPickupMarker(lat, lng, label) {
        const icon = L.divIcon({
            className: 'point-marker',
            html: `
        <div class="point-marker-icon pickup">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>
          </svg>
        </div>
        <div class="point-marker-label">${label || 'Jemput'}</div>
      `,
            iconSize: [100, 40],
            iconAnchor: [50, 20]
        });
        return L.marker([lat, lng], { icon });
    },

    createDropoffMarker(lat, lng, label) {
        const icon = L.divIcon({
            className: 'point-marker',
            html: `
        <div class="point-marker-icon dropoff">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
        </div>
        <div class="point-marker-label">${label || 'Antar'}</div>
      `,
            iconSize: [100, 40],
            iconAnchor: [50, 20]
        });
        return L.marker([lat, lng], { icon });
    },

    // ---- Draw Route Line ----
    drawRoute(map, coordinates, options = {}) {
        const defaults = {
            color: '#4e7cff',
            weight: 5,
            opacity: 0.8,
            smoothFactor: 1,
            lineCap: 'round',
            lineJoin: 'round'
        };

        const polyline = L.polyline(coordinates, { ...defaults, ...options }).addTo(map);
        return polyline;
    },

    // ---- Draw Deviation Line (red dashed) ----
    drawDeviation(map, coordinates) {
        return L.polyline(coordinates, {
            color: '#ef4444',
            weight: 3,
            opacity: 0.7,
            dashArray: '8, 8'
        }).addTo(map);
    },

    // ---- Fit Map to Bounds ----
    fitBounds(map, markers) {
        if (markers.length === 0) return;
        const group = L.featureGroup(markers);
        map.fitBounds(group.getBounds().pad(0.15));
    },

    // ---- Calculate Distance (Haversine) ----
    getDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000; // meters
        const dLat = this.toRad(lat2 - lat1);
        const dLng = this.toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
            Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    },

    toRad(deg) {
        return deg * (Math.PI / 180);
    },

    // ---- Get Point-to-Line Distance (for deviation check) ----
    getPointToRouteDistance(point, routeCoords) {
        let minDist = Infinity;
        for (let i = 0; i < routeCoords.length - 1; i++) {
            const dist = this.pointToSegmentDistance(
                point, routeCoords[i], routeCoords[i + 1]
            );
            if (dist < minDist) minDist = dist;
        }
        return minDist;
    },

    pointToSegmentDistance(point, segStart, segEnd) {
        const [px, py] = point;
        const [ax, ay] = segStart;
        const [bx, by] = segEnd;

        const dx = bx - ax;
        const dy = by - ay;
        const lenSq = dx * dx + dy * dy;

        if (lenSq === 0) return this.getDistance(px, py, ax, ay);

        let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));

        const nearX = ax + t * dx;
        const nearY = ay + t * dy;
        return this.getDistance(px, py, nearX, nearY);
    },

    // ---- Inject Map Marker Styles ----
    injectStyles() {
        if (document.getElementById('map-marker-styles')) return;

        const style = document.createElement('style');
        style.id = 'map-marker-styles';
        style.textContent = `
      .driver-marker { position: relative; }
      .driver-marker-dot {
        width: 14px; height: 14px;
        border-radius: 50%;
        position: absolute;
        left: 50%; top: 50%;
        transform: translate(-50%, -50%);
        z-index: 2;
      }
      .driver-marker-dot.speed-safe { background: #22c55e; }
      .driver-marker-dot.speed-warn { background: #f59e0b; }
      .driver-marker-dot.speed-danger { background: #ef4444; }
      .driver-marker-pulse {
        position: absolute; inset: -6px;
        border-radius: 50%;
        animation: marker-pulse 2s infinite;
      }
      .speed-safe .driver-marker-pulse { background: rgba(34, 197, 94, 0.3); }
      .speed-warn .driver-marker-pulse { background: rgba(245, 158, 11, 0.3); }
      .speed-danger .driver-marker-pulse { background: rgba(239, 68, 68, 0.3); }
      @keyframes marker-pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(2); opacity: 0; }
      }
      .driver-marker-label {
        position: absolute;
        top: -28px; left: 50%;
        transform: translateX(-50%);
        background: rgba(30, 33, 48, 0.9);
        padding: 2px 8px;
        border-radius: 6px;
        white-space: nowrap;
        font-size: 11px;
        display: flex; gap: 6px;
        border: 1px solid rgba(255,255,255,0.1);
      }
      .driver-marker-label .driver-name { font-weight: 600; color: #f1f3f9; }
      .driver-marker-label .driver-speed { color: #9ca3b4; }
      .point-marker-icon {
        width: 32px; height: 32px;
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        position: absolute; left: 50%; top: 50%;
        transform: translate(-50%, -50%);
      }
      .point-marker-icon.pickup { background: #4e7cff; }
      .point-marker-icon.dropoff { background: #ef4444; }
      .point-marker-label {
        position: absolute; top: -24px; left: 50%;
        transform: translateX(-50%);
        background: rgba(30, 33, 48, 0.9);
        padding: 2px 8px; border-radius: 4px;
        font-size: 11px; font-weight: 600; color: #f1f3f9;
        white-space: nowrap;
        border: 1px solid rgba(255,255,255,0.1);
      }
    `;
        document.head.appendChild(style);
    }
};

// Auto-inject styles
document.addEventListener('DOMContentLoaded', () => MapUtils.injectStyles());
