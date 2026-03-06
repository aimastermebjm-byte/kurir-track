// ============================================
// KurirTrack - Authentication Module
// ============================================

const Auth = {
    currentUser: null,
    userProfile: null,

    // ---- Initialize Auth State Listener ----
    init() {
        // Check demo session first
        const demoSession = sessionStorage.getItem('kurirtrack_demo');
        if (demoSession) {
            const data = JSON.parse(demoSession);
            this.userProfile = data;
            this.currentUser = { uid: data.id };
            console.log('✅ Demo session restored:', data.role);
            return; // Skip Firebase auth
        }

        if (!isFirebaseConfigured()) {
            console.log('⚠️ Firebase not configured');
            this.onAuthRequired();
            return;
        }

        auth.onAuthStateChanged(async (user) => {
            if (user) {
                this.currentUser = user;
                await this.loadProfile(user.uid);
                this.onAuthSuccess();
            } else {
                this.currentUser = null;
                this.userProfile = null;
                this.onAuthRequired();
            }
        });
    },

    // ---- Login ----
    async login(email, password) {
        try {
            this.showLoading(true);
            const result = await auth.signInWithEmailAndPassword(email, password);
            return { success: true, user: result.user };
        } catch (error) {
            return { success: false, error: this.getErrorMessage(error.code) };
        } finally {
            this.showLoading(false);
        }
    },

    // ---- Register ----
    async register(email, password, name, role, phone) {
        try {
            this.showLoading(true);
            const result = await auth.createUserWithEmailAndPassword(email, password);

            // Create profile in Firestore
            await db.collection('users').doc(result.user.uid).set({
                name: name,
                email: email,
                role: role,
                phone: phone || '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            await this.loadProfile(result.user.uid);
            return { success: true, user: result.user };
        } catch (error) {
            return { success: false, error: this.getErrorMessage(error.code) };
        } finally {
            this.showLoading(false);
        }
    },

    // ---- Logout ----
    async logout() {
        try {
            // Clear demo session
            sessionStorage.removeItem('kurirtrack_demo');

            // Set driver offline if applicable
            if (this.userProfile?.role === 'driver' && this.currentUser && isFirebaseConfigured()) {
                await rtdb.ref(`tracking/${this.currentUser.uid}`).update({
                    isOnline: false,
                    lastSeen: firebase.database.ServerValue.TIMESTAMP
                });
            }
            if (isFirebaseConfigured()) {
                await auth.signOut();
            }
            window.location.href = '/index.html';
        } catch (error) {
            console.error('Logout error:', error);
            window.location.href = '/index.html';
        }
    },

    // ---- Load User Profile ----
    async loadProfile(uid) {
        try {
            const doc = await db.collection('users').doc(uid).get();
            if (doc.exists) {
                this.userProfile = { id: uid, ...doc.data() };
            }
        } catch (error) {
            console.error('Load profile error:', error);
        }
    },

    // ---- Auth Success Handler ----
    onAuthSuccess() {
        const currentPage = window.location.pathname;

        if (currentPage.includes('index.html') || currentPage === '/') {
            // Redirect based on role
            if (this.userProfile?.role === 'owner') {
                window.location.href = '/owner/dashboard.html';
            } else if (this.userProfile?.role === 'driver') {
                window.location.href = '/driver/main.html';
            }
        }
    },

    // ---- Auth Required Handler ----
    onAuthRequired() {
        // Skip if demo session exists
        if (sessionStorage.getItem('kurirtrack_demo')) return;

        const currentPage = window.location.pathname;
        if (!currentPage.includes('index.html') && currentPage !== '/') {
            window.location.href = '/index.html';
        }
    },

    // ---- Check Role Access ----
    requireRole(role) {
        if (!this.userProfile || this.userProfile.role !== role) {
            window.location.href = '/index.html';
            return false;
        }
        return true;
    },

    // ---- Error Messages (Indonesian) ----
    getErrorMessage(code) {
        const messages = {
            'auth/user-not-found': 'Email tidak terdaftar',
            'auth/wrong-password': 'Password salah',
            'auth/email-already-in-use': 'Email sudah digunakan',
            'auth/weak-password': 'Password minimal 6 karakter',
            'auth/invalid-email': 'Format email tidak valid',
            'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi nanti.',
            'auth/network-request-failed': 'Tidak ada koneksi internet',
        };
        return messages[code] || 'Terjadi kesalahan. Coba lagi.';
    },

    // ---- UI Helpers ----
    showLoading(show) {
        const btn = document.querySelector('#auth-submit-btn');
        if (btn) {
            btn.disabled = show;
            btn.innerHTML = show
                ? '<div class="spinner" style="width:20px;height:20px;border-width:2px;"></div> Memproses...'
                : btn.dataset.originalText || 'Masuk';
        }
    },

    // ---- Demo Login (tanpa Firebase) ----
    demoLogin(role) {
        this.userProfile = {
            id: 'demo-' + role,
            name: role === 'owner' ? 'Boss Demo' : 'Driver Demo',
            role: role,
            email: `demo@${role}.com`,
            phone: '08123456789'
        };
        this.currentUser = { uid: this.userProfile.id };

        // Save to sessionStorage so it persists across page navigation
        sessionStorage.setItem('kurirtrack_demo', JSON.stringify(this.userProfile));

        if (role === 'owner') {
            window.location.href = 'owner/dashboard.html';
        } else {
            window.location.href = 'driver/main.html';
        }
    },

    // ---- Check if Demo Mode ----
    isDemoMode() {
        return !!sessionStorage.getItem('kurirtrack_demo');
    }
};
