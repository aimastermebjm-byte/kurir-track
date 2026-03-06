// ============================================
// KurirTrack - Firebase Configuration
// ============================================
// GANTI dengan config dari Firebase Console Anda!
// Cara: Firebase Console → Project Settings → General → Your apps → Config

const firebaseConfig = {
  apiKey: "AIzaSyDS_PwVF2uXlCvv3_0eJIqI9lL5qrIBTC4",
  authDomain: "kurir-azzahra.firebaseapp.com",
  databaseURL: "https://kurir-azzahra-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "kurir-azzahra",
  storageBucket: "kurir-azzahra.firebasestorage.app",
  messagingSenderId: "30359781768",
  appId: "1:30359781768:web:3e35f7c0fc53de6447ba3d",
  measurementId: "G-XTBWE4EJSR"
};

// Initialize Firebase
let app, auth, db, rtdb;

function initFirebase() {
  try {
    app = firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    rtdb = firebase.database();

    // Firestore settings
    db.settings({ cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED });
    db.enablePersistence({ synchronizeTabs: true }).catch(err => {
      if (err.code === 'failed-precondition') {
        console.warn('Firestore persistence: multiple tabs open');
      } else if (err.code === 'unimplemented') {
        console.warn('Firestore persistence: browser not supported');
      }
    });

    console.log('✅ Firebase initialized');
    return true;
  } catch (error) {
    console.error('❌ Firebase init error:', error);
    return false;
  }
}

// ---- App Constants ----
const APP_CONFIG = {
  SPEED_LIMIT: 50,               // km/h
  GPS_INTERVAL: 5000,            // ms (5 detik)
  ROUTE_DEVIATION_LIMIT: 500,    // meter
  MAX_DRIVERS: 5,
  MAP_DEFAULT_CENTER: [-3.3167, 114.5900], // Banjarmasin
  MAP_DEFAULT_ZOOM: 13,
  OSRM_API: 'https://router.project-osrm.org/route/v1/driving'
};

// ---- Helper: Check if Firebase is configured ----
function isFirebaseConfigured() {
  return firebaseConfig.apiKey !== 'YOUR_API_KEY';
}

// ---- Helper: Show demo mode banner ----
function showDemoModeBanner() {
  if (!isFirebaseConfigured()) {
    const banner = document.createElement('div');
    banner.id = 'demo-banner';
    banner.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0;
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: #000; text-align: center;
      padding: 8px 16px; font-size: 0.8125rem; font-weight: 600;
      z-index: 9999; font-family: 'Inter', sans-serif;
    `;
    banner.textContent = '⚠️ DEMO MODE — Firebase belum dikonfigurasi';
    document.body.prepend(banner);
  }
}
