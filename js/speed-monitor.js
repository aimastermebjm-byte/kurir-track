// ============================================
// KurirTrack - Speed Monitor Module
// ============================================

const SpeedMonitor = {
    violations: [],
    lastViolationTime: 0,
    violationCooldown: 30000, // 30 detik antar violation

    // ---- Check Speed ----
    check(speed, position) {
        const result = {
            speed: Math.round(speed),
            limit: APP_CONFIG.SPEED_LIMIT,
            status: 'safe', // safe, warning, danger
            isViolation: false
        };

        if (speed > APP_CONFIG.SPEED_LIMIT) {
            result.status = 'danger';
            result.isViolation = true;
        } else if (speed > APP_CONFIG.SPEED_LIMIT * 0.8) {
            result.status = 'warning';
        }

        // Log violation if outside cooldown
        if (result.isViolation && Date.now() - this.lastViolationTime > this.violationCooldown) {
            this.logViolation(speed, position);
            this.lastViolationTime = Date.now();
        }

        return result;
    },

    // ---- Log Violation ----
    async logViolation(speed, position) {
        const violation = {
            speed: Math.round(speed),
            limit: APP_CONFIG.SPEED_LIMIT,
            lat: position.lat,
            lng: position.lng,
            timestamp: Date.now()
        };

        this.violations.push(violation);

        // Save to Firebase
        await RouteEngine.logViolation('speed', {
            recordedSpeed: Math.round(speed),
            speedLimit: APP_CONFIG.SPEED_LIMIT,
            excess: Math.round(speed - APP_CONFIG.SPEED_LIMIT)
        }, position.lat, position.lng);
    },

    // ---- Get Speed CSS Class ----
    getSpeedClass(speed) {
        if (speed > APP_CONFIG.SPEED_LIMIT) return 'speed-danger';
        if (speed > APP_CONFIG.SPEED_LIMIT * 0.8) return 'speed-warn';
        return 'speed-safe';
    },

    // ---- Get Today's Violations ----
    async getTodayViolations(driverId) {
        if (!isFirebaseConfigured()) return this.getDemoViolations();

        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            let query = db.collection('violations')
                .where('type', '==', 'speed')
                .where('timestamp', '>=', today)
                .orderBy('timestamp', 'desc');

            if (driverId) {
                query = query.where('driverId', '==', driverId);
            }

            const snapshot = await query.get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('Get violations error:', error);
            return [];
        }
    },

    // ---- Get Demo Violations ----
    getDemoViolations() {
        return [
            {
                id: 'v1',
                driverId: 'demo-driver-1',
                driverName: 'Ahmad',
                type: 'speed',
                details: { recordedSpeed: 58, speedLimit: 50, excess: 8 },
                lat: -3.3200, lng: 114.5920,
                timestamp: { toDate: () => new Date(Date.now() - 3600000) }
            },
            {
                id: 'v2',
                driverId: 'demo-driver-2',
                driverName: 'Budi',
                type: 'speed',
                details: { recordedSpeed: 63, speedLimit: 50, excess: 13 },
                lat: -3.3150, lng: 114.5880,
                timestamp: { toDate: () => new Date(Date.now() - 7200000) }
            }
        ];
    },

    // ---- Reset ----
    reset() {
        this.violations = [];
        this.lastViolationTime = 0;
    }
};
