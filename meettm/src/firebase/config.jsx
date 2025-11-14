import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDNy-6bE_eGG9KnlSIfbL6XnDTpaoQfCvA",
  authDomain: "mettm-4f8e3.firebaseapp.com",
  projectId: "mettm-4f8e3",
  storageBucket: "mettm-4f8e3.firebasestorage.app",
  messagingSenderId: "443249714816",
  appId: "1:443249714816:web:80c26d9827e285ed882865",
  measurementId: "G-Z9S9RR7BY6"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export { auth, firebaseConfig };