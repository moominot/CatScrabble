// TODO: Substitueix per les credencials del teu projecte Firebase (CatScrabble)
// Firebase Console → Project Settings → Your apps → Web app → Config

import firebase from 'firebase/compat/app';
import 'firebase/compat/database';

const firebaseConfig = {
  apiKey: "CANVIA_AQUI",
  authDomain: "CANVIA_AQUI.firebaseapp.com",
  databaseURL: "https://CANVIA_AQUI-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "CANVIA_AQUI",
  storageBucket: "CANVIA_AQUI.appspot.com",
  messagingSenderId: "CANVIA_AQUI",
  appId: "CANVIA_AQUI"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

export const db = firebase.database();
export default firebase;
