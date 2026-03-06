// ============================================
// KurirTrack - Route Engine (OSRM Routing)
// ============================================

const RouteEngine = {
    currentRoute: null,
    routeLayer: null,

    // ---- Get Route from OSRM ----
    async getRoute(startLat, startLng, endLat, endLng) {
        try {
            const url = `${APP_CONFIG.OSRM_API}/${startLng},${startLat};${endLng},${endLat}` +
                `?overview=full&geometries=geojson&steps=true&alternatives=true`;

            const response = await fetch(url);
            const data = await response.json();

            if (data.code !== 'Ok' || !data.routes.length) {
                throw new Error('Rute tidak ditemukan');
            }

            const route = data.routes[0];
            const coordinates = route.geometry.coordinates.map(c => [c[1], c[0]]); // [lng,lat] → [lat,lng]

            this.currentRoute = {
                coordinates,
                distance: route.distance, // meters
                duration: route.duration, // seconds
                steps: route.legs[0].steps.map(step => ({
                    instruction: this.translateManeuver(step.maneuver),
                    distance: step.distance,
                    duration: step.duration,
                    name: step.name || '',
                    maneuver: step.maneuver
                })),
                alternatives: data.routes.slice(1).map(alt => ({
                    coordinates: alt.geometry.coordinates.map(c => [c[1], c[0]]),
                    distance: alt.distance,
                    duration: alt.duration
                }))
            };

            return this.currentRoute;
        } catch (error) {
            console.error('Route error:', error);
            throw error;
        }
    },

    // ---- Draw Route on Map ----
    drawOnMap(map, route, options = {}) {
        // Clear previous route
        this.clearRoute(map);

        // Draw main route
        this.routeLayer = L.layerGroup();

        const mainLine = L.polyline(route.coordinates, {
            color: options.color || '#4e7cff',
            weight: options.weight || 6,
            opacity: 0.85,
            smoothFactor: 1,
            lineCap: 'round',
            lineJoin: 'round'
        });

        // Route outline for better visibility
        const outlineLine = L.polyline(route.coordinates, {
            color: '#1a1d27',
            weight: (options.weight || 6) + 4,
            opacity: 0.5,
            smoothFactor: 1,
            lineCap: 'round',
            lineJoin: 'round'
        });

        this.routeLayer.addLayer(outlineLine);
        this.routeLayer.addLayer(mainLine);

        // Draw alternative routes (dimmed)
        if (route.alternatives) {
            route.alternatives.forEach(alt => {
                const altLine = L.polyline(alt.coordinates, {
                    color: '#6b7280',
                    weight: 4,
                    opacity: 0.4,
                    dashArray: '8, 8'
                });
                this.routeLayer.addLayer(altLine);
            });
        }

        this.routeLayer.addTo(map);
        return this.routeLayer;
    },

    // ---- Clear Route from Map ----
    clearRoute(map) {
        if (this.routeLayer) {
            map.removeLayer(this.routeLayer);
            this.routeLayer = null;
        }
    },

    // ---- Check Route Deviation ----
    checkDeviation(currentLat, currentLng) {
        if (!this.currentRoute) return { isDeviated: false, distance: 0 };

        const distance = MapUtils.getPointToRouteDistance(
            [currentLat, currentLng],
            this.currentRoute.coordinates
        );

        return {
            isDeviated: distance > APP_CONFIG.ROUTE_DEVIATION_LIMIT,
            distance: Math.round(distance), // meters
            limit: APP_CONFIG.ROUTE_DEVIATION_LIMIT
        };
    },

    // ---- Save Route to Firestore ----
    async saveDeliveryRoute(deliveryId, pickupData, dropoffData) {
        if (!isFirebaseConfigured()) return;

        try {
            await db.collection('deliveries').doc(deliveryId).set({
                driverId: Auth.currentUser.uid,
                pickup: pickupData,
                dropoff: dropoffData,
                plannedRoute: this.currentRoute ? this.currentRoute.coordinates : [],
                distance: this.currentRoute ? this.currentRoute.distance : 0,
                duration: this.currentRoute ? this.currentRoute.duration : 0,
                status: 'in_progress',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } catch (error) {
            console.error('Save route error:', error);
        }
    },

    // ---- Log Violation ----
    async logViolation(type, details, lat, lng) {
        if (!isFirebaseConfigured() || !Auth.currentUser) return;

        try {
            await db.collection('violations').add({
                driverId: Auth.currentUser.uid,
                type: type, // 'speed' or 'route_deviation'
                details: details,
                lat: lat,
                lng: lng,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.error('Log violation error:', error);
        }
    },

    // ---- Translate OSRM Maneuver to Indonesian ----
    translateManeuver(maneuver) {
        const type = maneuver.type;
        const modifier = maneuver.modifier || '';

        const translations = {
            'depart': 'Mulai perjalanan',
            'arrive': 'Anda telah sampai',
            'turn': {
                'left': 'Belok kiri',
                'right': 'Belok kanan',
                'slight left': 'Belok sedikit ke kiri',
                'slight right': 'Belok sedikit ke kanan',
                'sharp left': 'Belok tajam ke kiri',
                'sharp right': 'Belok tajam ke kanan',
                'uturn': 'Putar balik'
            },
            'new name': 'Lanjut',
            'merge': 'Bergabung ke jalan',
            'fork': {
                'left': 'Ambil jalur kiri',
                'right': 'Ambil jalur kanan'
            },
            'roundabout': 'Masuk bundaran',
            'rotary': 'Masuk bundaran',
            'continue': 'Lanjut lurus',
            'end of road': {
                'left': 'Di ujung jalan, belok kiri',
                'right': 'Di ujung jalan, belok kanan'
            }
        };

        if (typeof translations[type] === 'string') {
            return translations[type];
        } else if (typeof translations[type] === 'object') {
            return translations[type][modifier] || `${type} ${modifier}`;
        }

        return modifier ? `${type} ${modifier}` : type;
    },

    // ---- Format Distance ----
    formatDistance(meters) {
        if (meters >= 1000) {
            return (meters / 1000).toFixed(1) + ' km';
        }
        return Math.round(meters) + ' m';
    },

    // ---- Format Duration ----
    formatDuration(seconds) {
        const mins = Math.round(seconds / 60);
        if (mins >= 60) {
            const h = Math.floor(mins / 60);
            const m = mins % 60;
            return `${h}j ${m}m`;
        }
        return `${mins} menit`;
    },

    // ---- Geocode (reverse) ----
    async reverseGeocode(lat, lng) {
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`;
            const res = await fetch(url, {
                headers: { 'Accept-Language': 'id' }
            });
            const data = await res.json();
            return data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        } catch {
            return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        }
    },

    // ---- Search Location ----
    async searchLocation(query) {
        try {
            const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=id&viewbox=114.4,−3.4,114.8,−3.2&bounded=0`;
            const res = await fetch(url, {
                headers: { 'Accept-Language': 'id' }
            });
            const data = await res.json();
            return data.map(item => ({
                name: item.display_name,
                lat: parseFloat(item.lat),
                lng: parseFloat(item.lon)
            }));
        } catch {
            return [];
        }
    }
};
