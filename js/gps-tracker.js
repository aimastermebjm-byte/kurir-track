// ============================================
// KurirTrack - GPS Tracker Module
// ============================================

const GPSTracker = {
    watchId: null,
    intervalId: null,
    isTracking: false,
    lastPosition: null,
    totalDistance: 0,
    startTime: null,
    positions: [],
    onUpdate: null,        // callback(position)
    onError: null,         // callback(error)
    onSpeedViolation: null, // callback(speed)

    // ---- Start Tracking ----
    start(callbacks = {}) {
        if (this.isTracking) return;

        this.onUpdate = callbacks.onUpdate || null;
        this.onError = callbacks.onError || null;
        this.onSpeedViolation = callbacks.onSpeedViolation || null;
        this.totalDistance = 0;
        this.startTime = Date.now();
        this.positions = [];

        if (!navigator.geolocation) {
            this.handleError({ code: 0, message: 'GPS tidak didukung di browser ini' });
            return;
        }

        // High accuracy GPS watch
        this.watchId = navigator.geolocation.watchPosition(
            (pos) => this.handlePosition(pos),
            (err) => this.handleError(err),
            {
                enableHighAccuracy: true,
                maximumAge: 3000,
                timeout: 10000
            }
        );

        // Also send position to Firebase at fixed interval
        this.intervalId = setInterval(() => {
            if (this.lastPosition) {
                this.sendToFirebase(this.lastPosition);
            }
        }, APP_CONFIG.GPS_INTERVAL);

        this.isTracking = true;
        console.log('📍 GPS Tracking started');
    },

    // ---- Stop Tracking ----
    stop() {
        if (this.watchId !== null) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isTracking = false;

        // Set offline in Firebase
        if (isFirebaseConfigured() && Auth.currentUser) {
            rtdb.ref(`tracking/${Auth.currentUser.uid}`).update({
                isOnline: false,
                lastSeen: firebase.database.ServerValue.TIMESTAMP
            });
        }

        console.log('⏹️ GPS Tracking stopped');
    },

    // ---- Handle GPS Position ----
    handlePosition(position) {
        const pos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            speed: position.coords.speed !== null
                ? position.coords.speed * 3.6 // m/s to km/h
                : 0,
            accuracy: position.coords.accuracy,
            heading: position.coords.heading,
            timestamp: Date.now()
        };

        // Calculate distance from last position
        if (this.lastPosition) {
            const dist = MapUtils.getDistance(
                this.lastPosition.lat, this.lastPosition.lng,
                pos.lat, pos.lng
            );
            // Only count if moved > 5m (filter GPS jitter)
            if (dist > 5) {
                this.totalDistance += dist;
            }

            // Calculate speed from distance/time if GPS speed is 0
            if (pos.speed === 0 && dist > 5) {
                const timeDiff = (pos.timestamp - this.lastPosition.timestamp) / 1000; // seconds
                if (timeDiff > 0) {
                    pos.speed = (dist / timeDiff) * 3.6; // m/s to km/h
                }
            }
        }

        this.lastPosition = pos;
        this.positions.push(pos);

        // Check speed violation
        if (pos.speed > APP_CONFIG.SPEED_LIMIT) {
            if (this.onSpeedViolation) {
                this.onSpeedViolation(pos.speed, pos);
            }
        }

        // Callback
        if (this.onUpdate) {
            this.onUpdate(pos);
        }
    },

    // ---- Handle GPS Error ----
    handleError(error) {
        const messages = {
            1: 'Izin GPS ditolak. Aktifkan izin lokasi di pengaturan browser.',
            2: 'Lokasi tidak tersedia. Pastikan GPS aktif.',
            3: 'Waktu permintaan GPS habis. Coba lagi.',
            0: 'GPS tidak didukung di browser ini.'
        };

        const msg = messages[error.code] || error.message;
        console.error('📍 GPS Error:', msg);

        if (this.onError) {
            this.onError(msg);
        }
    },

    // ---- Send Position to Firebase ----
    async sendToFirebase(pos) {
        if (!isFirebaseConfigured() || !Auth.currentUser) return;

        const uid = Auth.currentUser.uid;

        try {
            // Update Realtime DB (live tracking)
            await rtdb.ref(`tracking/${uid}`).set({
                lat: pos.lat,
                lng: pos.lng,
                speed: Math.round(pos.speed * 10) / 10,
                heading: pos.heading || 0,
                accuracy: pos.accuracy || 0,
                isOnline: true,
                timestamp: firebase.database.ServerValue.TIMESTAMP,
                totalDistance: Math.round(this.totalDistance)
            });

            // Log to Firestore (history)
            await db.collection('locationHistory').doc(uid)
                .collection('logs').add({
                    lat: pos.lat,
                    lng: pos.lng,
                    speed: Math.round(pos.speed * 10) / 10,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });

        } catch (error) {
            console.error('Firebase send error:', error);
        }
    },

    // ---- Get Stats ----
    getStats() {
        const elapsed = this.startTime ? (Date.now() - this.startTime) / 1000 : 0;
        const avgSpeed = elapsed > 0
            ? (this.totalDistance / elapsed) * 3.6
            : 0;

        return {
            totalDistance: this.totalDistance, // meters
            totalDistanceKm: (this.totalDistance / 1000).toFixed(1),
            elapsedTime: elapsed, // seconds
            elapsedTimeFormatted: this.formatDuration(elapsed),
            avgSpeed: Math.round(avgSpeed), // km/h
            currentSpeed: this.lastPosition ? Math.round(this.lastPosition.speed) : 0,
            positionCount: this.positions.length
        };
    },

    // ---- Format Duration ----
    formatDuration(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) return `${h}j ${m}m`;
        return `${m} menit`;
    },

    // ---- Request GPS Permission ----
    async requestPermission() {
        try {
            const result = await navigator.permissions.query({ name: 'geolocation' });
            return result.state; // 'granted', 'denied', 'prompt'
        } catch {
            return 'unknown';
        }
    },

    // ---- Keep Screen On (Wakelock API) ----
    wakeLock: null,
    async keepScreenOn() {
        try {
            if ('wakeLock' in navigator) {
                this.wakeLock = await navigator.wakeLock.request('screen');
                console.log('🔆 Screen wake lock active');

                this.wakeLock.addEventListener('release', () => {
                    console.log('🔅 Screen wake lock released');
                });
            }
        } catch (err) {
            console.warn('Wake lock not supported:', err);
        }
    },

    releaseScreenLock() {
        if (this.wakeLock) {
            this.wakeLock.release();
            this.wakeLock = null;
        }
    }
};
