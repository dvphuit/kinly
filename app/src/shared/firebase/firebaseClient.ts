import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  type Auth,
  type User,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'baby-growth-dvphu.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'baby-growth-dvphu',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let authReadyPromise: Promise<User | null> | null = null;
let anonymousSignInPromise: Promise<User> | null = null;

function getFirebaseApp(): FirebaseApp {
  if (!firebaseConfig.apiKey || !firebaseConfig.appId) {
    throw new Error('Thiếu cấu hình Firebase Web SDK. Hãy đặt VITE_FIREBASE_API_KEY và VITE_FIREBASE_APP_ID.');
  }
  if (firebaseApp) return firebaseApp;
  firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  return firebaseApp;
}

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.appId && firebaseConfig.projectId);
}

function getFirebaseAuth(): Auth {
  if (!firebaseAuth) firebaseAuth = getAuth(getFirebaseApp());
  return firebaseAuth;
}

async function waitForFirebaseAuth(): Promise<User | null> {
  const auth = getFirebaseAuth();
  if (auth.currentUser) return auth.currentUser;
  if (!authReadyPromise) {
    authReadyPromise = new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        resolve(user);
      });
    });
  }
  return authReadyPromise;
}

export async function ensureFirebaseUser(): Promise<User> {
  const auth = getFirebaseAuth();
  const existingUser = await waitForFirebaseAuth();
  if (existingUser) return existingUser;
  if (!anonymousSignInPromise) {
    anonymousSignInPromise = signInAnonymously(auth)
      .then(({ user }) => user)
      .finally(() => {
        anonymousSignInPromise = null;
      });
  }
  return anonymousSignInPromise;
}

export async function getFirebaseIdToken(): Promise<string> {
  const user = await ensureFirebaseUser();
  return user.getIdToken();
}

export async function firebaseApiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getFirebaseIdToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(path, { ...init, headers, credentials: 'same-origin' });
}

export function subscribeFirebaseAuth(listener: (user: User | null) => void): () => void {
  return onAuthStateChanged(getFirebaseAuth(), listener);
}
