import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getFirestore, collection, onSnapshot, doc, getDoc, setDoc } from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import GoogleMapView from "./GoogleMapView.jsx";
import AppNavigation from "./appnavigation.jsx";
import { firebaseConfig } from "../firebase/config";
import "./Dashboard.css";

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

  useEffect(() => {
    document.body.classList.add("dashboard-bg");
    return () => document.body.classList.remove("dashboard-bg");
  }, []);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
      if (u) {
        const userRef = doc(db, "users", u.uid);
        getDoc(userRef).then((docSnap) => {
          if (docSnap.exists()) {
            setXp(docSnap.data().xp || 0);
            setAccountCreatedAt(docSnap.data().createdAt || u.metadata.creationTime);
          } else {
            setXp(0);
            setAccountCreatedAt(u.metadata.creationTime);
            setDoc(userRef, { xp: 0, createdAt: u.metadata.creationTime });
          }
        });
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "issues"), (snap) => {
      setIssues(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const userIssues = issues.filter((issue) => issue.uid === user.uid);
    const newXp = userIssues.length * 5;
    setXp(newXp);
    const userRef = doc(db, "users", user.uid);
    setDoc(userRef, { xp: newXp }, { merge: true });
  }, [issues, user]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const all = snap.docs.map((doc) => ({
        uid: doc.id,
        xp: doc.data().xp || 0,
      }));
      all.sort((a, b) => b.xp - a.xp);
      setUsersXP(all);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user || usersXP.length === 0) {
      setRank(null);
      return;
    }
    const idx = usersXP.findIndex((u) => u.uid === user.uid);
    setRank(idx >= 0 ? idx + 1 : null);
  }, [user, usersXP]);

  useEffect(() => {
    setIsLoaded(true);
  }, [issues]);

  const userEvents = useMemo(() => (user ? issues.filter((issue) => issue.uid === user.uid) : []), [issues, user]);
  const upcomingEvents = useMemo(
    () =>
      issues.filter((issue) => {
        if (!issue.endDateTime) return true;
        const end = new Date(issue.endDateTime);
        return !Number.isNaN(end.getTime()) && end >= new Date();
      }),
    [issues]
  );

  const getTimeValue = (item) => {
    const createdDate = item?.created ? new Date(item.created) : null;
    if (createdDate && !Number.isNaN(createdDate.getTime())) return createdDate.getTime();
    const endDate = item?.endDateTime ? new Date(item.endDateTime) : null;
    return endDate && !Number.isNaN(endDate.getTime()) ? endDate.getTime() : 0;
  };

  const latestIssues = useMemo(
    () => [...issues].sort((a, b) => getTimeValue(b) - getTimeValue(a)).slice(0, 4),
    [issues]
  );

  const createdOn = accountCreatedAt ? new Date(accountCreatedAt) : null;
  const userName = user?.displayName || user?.email || "Explorer";

  return (
    <div className="dashboard-page">
      <div className="dashboard-glow glow-left" aria-hidden="true" />
      <div className="dashboard-glow glow-right" aria-hidden="true" />

      <header className="dashboard-hero">
        <p className="eyebrow">Live pe MeetTM</p>
        <h1>Planifica, urmareste si lanseaza evenimente memorabile</h1>
        <p className="lede">
          Monitorizeaza harta MeetTM, vezi cele mai noi evenimente si publica rapid unul nou in vibe-ul electric al Timisoarei.
        </p>
        <div className="insights-grid">
          <div className="insight-card">
            <p className="insight-label">Evenimente live</p>
            <div className="insight-value">{upcomingEvents.length}</div>
            <p className="insight-meta">In desfasurare sau programate</p>
          </div>
          <div className="insight-card">
            <p className="insight-label">XP-ul tau</p>
            <div className="insight-value">{xp}</div>
            <p className="insight-meta">{userEvents.length} evenimente trimise</p>
          </div>
          <div className="insight-card">
            <p className="insight-label">Loc in community</p>
            <div className="insight-value">{rank ?? "-"}</div>
            <p className="insight-meta">Actualizat automat din leaderboard</p>
          </div>
          <div className="insight-card">
            <p className="insight-label">Total evenimente</p>
            <div className="insight-value">{issues.length}</div>
            <p className="insight-meta">Contributii MeetTM</p>
          </div>
        </div>
      </header>

      <section className="dashboard-grid">
        <div className="panel map-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Harta interactiva</p>
              <h3>Exploreaza evenimentele din Timisoara</h3>
            </div>
            <Link className="ghost-button" to="/report">
              + Publica un eveniment
            </Link>
          </div>
          {isLoaded ? (
            <GoogleMapView key={user?.uid || "nou"} markers={issues} />
          ) : (
            <div className="skeleton-map" aria-hidden="true" />
          )}
        </div>

        <div className="panel side-panel">
          <div className="side-card">
            <div className="eyebrow subtle">Profil</div>
            <h4>Bine ai revenit, {userName}</h4>
            <p className="muted">
              {createdOn ? `Cu noi din ${createdOn.toLocaleDateString("ro-RO")}` : "Pregatit pentru noi descoperiri"}
            </p>
            <div className="metric-row">
              <div className="metric-card">
                <p className="metric-label">XP</p>
                <p className="metric-value">{xp}</p>
                <span className="metric-meta">cumulative</span>
              </div>
              <div className="metric-card">
                <p className="metric-label">Loc</p>
                <p className="metric-value">{rank ?? "-"}</p>
                <span className="metric-meta">leaderboard</span>
              </div>
            </div>
            <Link className="primary-link" to="/report">
              Lanseaza un eveniment nou
            </Link>
          </div>

          <div className="side-card secondary">
            <div className="eyebrow subtle">Status live</div>
            <ul className="status-list">
              <li>
                <span className="dot green" />
                <span>Evenimente active: {upcomingEvents.length}</span>
              </li>
              <li>
                <span className="dot blue" />
                <span>Evenimente trimise de tine: {userEvents.length}</span>
              </li>
              <li>
                <span className="dot purple" />
                <span>Evenimente totale: {issues.length}</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="panel latest-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Activitate recenta</p>
            <h3>Ultimele evenimente</h3>
          </div>
          <Link className="ghost-button" to="/report">
            Adauga un eveniment
          </Link>
        </div>
        <div className="event-list">
          {latestIssues.length === 0 && <p className="muted">Inca nu exista evenimente. Fii primul care publica!</p>}
          {latestIssues.map((issue) => (
            <div key={issue.id} className="event-item">
              <div className="event-chip">{issue.category || "Categorie necunoscuta"}</div>
              <div className="event-copy">
                <h4>{issue.title || "Eveniment fara titlu"}</h4>
                <p className="event-meta">{issue.address || "Adresa indisponibila"}</p>
                <p className="event-meta">
                  {issue.dateStart ? issue.dateStart : "Data in curand"} {issue.hourStart ? `• ${issue.hourStart}` : ""}
                </p>
              </div>
              <Link className="pill-btn" to={`/issue/${issue.id}`}>
                Detalii
              </Link>
            </div>
          ))}
        </div>
      </section>

      <AppNavigation />
    </div>
  );
}

export default Dashboard;
