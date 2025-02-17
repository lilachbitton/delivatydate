import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIZaSyCxjWPZkdLGCyCj8RdMAgePrCVC2MKTqPg",
  authDomain: "ordermanagement-5ad17.firebaseapp.com",
  projectId: "ordermanagement-5ad17",
  storageBucket: "ordermanagement-5ad17.firebasestorage.app",
  messagingSenderId: "71637766713",
  appId: "1:71637766713:web:b9698ba79c910a0b7cf3e8",
  measurementId: "G-BH3B8YWM1T"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);