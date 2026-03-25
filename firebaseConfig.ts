// TODO: Substitueix per les credencials del teu projecte Firebase (CatScrabble)
// Firebase Console → Project Settings → Your apps → Web app → Config

import firebase from 'firebase/compat/app';
import 'firebase/compat/database';

const firebaseConfig = {
  apiKey: "AIzaSyD_c0OuSIEn_N637Pk7pYtlBrYyNIS7uDk",
  authDomain: "catscrabble-a6318.firebaseapp.com",
  databaseURL: "https://catscrabble-a6318-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "catscrabble-a6318",
  storageBucket: "catscrabble-a6318.firebasestorage.app",
  messagingSenderId: "328501424619",
  appId: "1:328501424619:web:1951b1c0542a87979829ae"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

export const db = firebase.database();
export default firebase;
