// Saudia & Maailma Lehti – shared Firebase loader for comments and view counts.
// The project settings come from comments-config.js.

const SDK = "https://www.gstatic.com/firebasejs/10.12.2";

let corePromise = null;
let authPromise = null;

export function firebaseEnabled() {
  return Boolean(window.SML_FIREBASE && window.SML_FIREBASE.projectId);
}

// Loads the app and Firestore once: { fs, db, app }.
export function firebase() {
  if (!corePromise) {
    corePromise = (async () => {
      const [appSdk, fs] = await Promise.all([
        import(`${SDK}/firebase-app.js`),
        import(`${SDK}/firebase-firestore.js`),
      ]);
      const app = appSdk.initializeApp(window.SML_FIREBASE);
      return { app, fs, db: fs.getFirestore(app) };
    })();
  }
  return corePromise;
}

// Sign-in is only needed on the admin page: { auth, authInstance }.
export function firebaseAuth() {
  if (!authPromise) {
    authPromise = (async () => {
      const [{ app }, auth] = await Promise.all([firebase(), import(`${SDK}/firebase-auth.js`)]);
      return { auth, authInstance: auth.getAuth(app) };
    })();
  }
  return authPromise;
}
