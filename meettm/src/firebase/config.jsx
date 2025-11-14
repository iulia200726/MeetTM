import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAWhWYEk4lWigmenBhQxe6NSHB22lgBI3Q",
  authDomain: "urbanmobility-fa873.firebaseapp.com",
  projectId: "urbanmobility-fa873",
  storageBucket: "urbanmobility-fa873.firebasestorage.app",
  messagingSenderId: "52072572088",
  appId: "1:52072572088:web:aaa7ee4df80c414cae004d",
  measurementId: "G-GSXZYK2G0E"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export { auth, firebaseConfig };