import React, { useEffect, useState } from "react";
import GoogleMapView from "./GoogleMapView.jsx";
import { Link } from "react-router-dom";
import { getFirestore, collection, onSnapshot, doc, getDoc, setDoc } from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { firebaseConfig } from "../firebase/config";
import { getAuth } from "firebase/auth";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

function Dashboard() {
  const [issues, setIssues] = useState([]);
  const [xp, setXp] = useState(0);
  const [user, setUser] = useState(null);
  const [usersXP, setUsersXP] = useState([]);
  const [rank, setRank] = useState(null);
  const [accountCreatedAt, setAccountCreatedAt] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Ascultă autentificarea
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
      if (u) {
        // Citește XP-ul curent și data creării contului din Firestore
        const userRef = doc(db, "users", u.uid);
        getDoc(userRef).then((docSnap) => {
          if (docSnap.exists()) {
            setXp(docSnap.data().xp || 0);
            setAccountCreatedAt(docSnap.data().createdAt || u.metadata.creationTime);
          } else {
            setXp(0);
            setAccountCreatedAt(u.metadata.creationTime);
            setDoc(userRef, { xp: 0, createdAt: u.metadata.creationTime }); // Inițializează dacă nu există
          }
        });
      }
    });
    return () => unsubscribe();
  }, []);

  // Ascultă problemele
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "issues"), (snap) => {
      setIssues(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  // Actualizează XP-ul utilizatorului curent
  useEffect(() => {
    if (!user) return;
    const userIssues = issues.filter((issue) => issue.uid === user.uid);
    const newXp = userIssues.length * 5;
    setXp(newXp);
    const userRef = doc(db, "users", user.uid);
    setDoc(userRef, { xp: newXp }, { merge: true });
  }, [issues, user]);

  // Ascultă toți userii pentru leaderboard
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const all = snap.docs.map((doc) => ({
        uid: doc.id,
        xp: doc.data().xp || 0,
      }));
      // Sortează descrescător după xp
      all.sort((a, b) => b.xp - a.xp);
      setUsersXP(all);
    });
    return () => unsub();
  }, []);

  // Calculează locul utilizatorului curent
  useEffect(() => {
    if (!user || usersXP.length === 0) {
      setRank(null);
      return;
    }
    const idx = usersXP.findIndex((u) => u.uid === user.uid);
    setRank(idx >= 0 ? idx + 1 : null);
  }, [user, usersXP]);

  // Setează starea de încărcare după ce problemele sunt încărcate
  useEffect(() => {
    setIsLoaded(true);
  }, [issues]);

  // Detectează dacă e admin
  const isAdmin = user && user.email === "admin@admin.com";

  return (
    <div>
      <h1>Dashboard</h1>
      {/* Eliminat secțiunea cu XP, loc în clasament și titluri */}
      {isLoaded && <GoogleMapView key={user?.uid || "nou"} markers={issues} />}
      <Link to="/report">
        <button style={{ margin: "1rem 0" }}>Add Event</button>
      </Link>
    </div>
  );
}

export default Dashboard;