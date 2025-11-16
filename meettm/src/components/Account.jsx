// Account page with modern gradient/glass UI
import React, { useEffect, useMemo, useState } from "react";
import { Bar } from "react-chartjs-2";
import { Chart, BarElement, CategoryScale, LinearScale } from "chart.js";
import {
  getFirestore,
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import {
  getAuth,
  updatePassword,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import { initializeApp } from "firebase/app";
import { firebaseConfig } from "../firebase/config";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useNavigate } from "react-router-dom";
import defaultProfile from "./img/default-profile.svg";
import "./Account.css";

Chart.register(BarElement, CategoryScale, LinearScale);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const days = ["Duminică", "Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă"];

export default function Account() {
  const [profile, setProfile] = useState({
    username: "",
    email: "",
    phone: "",
    currentPassword: "",
    password: "",
    profilePic: null,
  });
  const [profilePicUrl, setProfilePicUrl] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [stats, setStats] = useState(Array(7).fill(0));
  const [issuesList, setIssuesList] = useState([]);
  const [xp, setXp] = useState(0);
  const [accountCreatedAt, setAccountCreatedAt] = useState(null);
  const [usersXP, setUsersXP] = useState([]);
  const [rank, setRank] = useState(null);

  const navigate = useNavigate();
  const user = auth.currentUser;
  const isAdmin = user && user.email === "admin@admin.com";

  useEffect(() => {
    document.body.classList.add("account-bg");
    return () => document.body.classList.remove("account-bg");
  }, []);

  useEffect(() => {
    if (!user) return;
    const userRef = doc(db, "users", user.uid);
    getDoc(userRef).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setProfile((p) => ({
          ...p,
          username: data.username || "",
          email: data.email || user.email,
          phone: data.phone || "",
        }));
        setProfilePicUrl(data.profilePicUrl || user.photoURL || "");
        setAccountCreatedAt(data.createdAt || user.metadata.creationTime);
        setXp(data.xp || 0);
      } else {
        setProfile((p) => ({ ...p, email: user.email || "" }));
        setAccountCreatedAt(user.metadata.creationTime);
        setXp(0);
        setDoc(userRef, { xp: 0, createdAt: user.metadata.creationTime }, { merge: true });
      }
    });
    const statsQ = query(collection(db, "issues"), where("uid", "==", user.uid));
    const unsubStats = onSnapshot(statsQ, (snap) => {
      const counts = Array(7).fill(0);
      snap.docs.forEach((d) => counts[new Date(d.data().created).getDay()]++);
      setStats(counts);
    });
    return () => unsubStats();
  }, [user]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "issues"), (snap) => {
      setIssuesList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const count = issuesList.filter((i) => i.uid === user.uid).length;
    const newXp = count * 5;
    setXp(newXp);
    setDoc(doc(db, "users", user.uid), { xp: newXp }, { merge: true });
  }, [issuesList, user]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const all = snap.docs.map((d) => ({ uid: d.id, xp: d.data().xp || 0 }));
      all.sort((a, b) => b.xp - a.xp);
      setUsersXP(all);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user || usersXP.length === 0) return setRank(null);
    const idx = usersXP.findIndex((u) => u.uid === user.uid);
    setRank(idx >= 0 ? idx + 1 : null);
  }, [usersXP, user]);

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    if (files && files[0]) {
      const file = files[0];
      setProfile((p) => ({ ...p, [name]: file }));
      setProfilePicUrl(URL.createObjectURL(file));
    } else {
      setProfile((p) => ({ ...p, [name]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setPasswordMessage("");
    if (!user) return;

    try {
      if (profile.password) {
        if (!profile.currentPassword) {
          setPasswordMessage("Introdu parola veche pentru a o schimba.");
          return;
        }
        const cred = EmailAuthProvider.credential(user.email, profile.currentPassword);
        await reauthenticateWithCredential(user, cred);
        await updatePassword(user, profile.password);
        setPasswordMessage("Parola a fost schimbată cu succes!");
      } else {
        setPasswordMessage("Datele au fost actualizate!");
      }

      const userRef = doc(db, "users", user.uid);
      let uploadedPicUrl = null;
      if (profile.profilePic) {
        const storage = getStorage();
        const storageRef = ref(storage, `profilePics/${user.uid}`);
        await uploadBytes(storageRef, profile.profilePic);
        uploadedPicUrl = await getDownloadURL(storageRef);
        setProfilePicUrl(uploadedPicUrl);
        await setDoc(userRef, { profilePicUrl: uploadedPicUrl }, { merge: true });
      }

      await setDoc(
        userRef,
        {
          username: profile.username,
          email: profile.email,
          phone: profile.phone,
        },
        { merge: true }
      );

      let finalProfilePicUrl = uploadedPicUrl;
      if (!finalProfilePicUrl) {
        const snap = await getDoc(userRef);
        finalProfilePicUrl = snap.exists() && snap.data().profilePicUrl ? snap.data().profilePicUrl : "";
      }

      const issuesSnap = await getDocs(collection(db, "issues"));
      for (const issueDoc of issuesSnap.docs) {
        const commentsCol = collection(db, "issues", issueDoc.id, "comments");
        const commentsSnap = await getDocs(commentsCol);
        for (const commentDoc of commentsSnap.docs) {
          const comment = commentDoc.data();
          if (comment.uid === user.uid) {
            await setDoc(
              doc(db, "issues", issueDoc.id, "comments", commentDoc.id),
              {
                displayName: profile.username,
                profilePicUrl: finalProfilePicUrl || "",
              },
              { merge: true }
            );
          }
        }
      }

      const userIssuesSnap = await getDocs(query(collection(db, "issues"), where("uid", "==", user.uid)));
      for (const issueDoc of userIssuesSnap.docs) {
        await setDoc(
          doc(db, "issues", issueDoc.id),
          {
            displayName: profile.username,
            profilePicUrl: finalProfilePicUrl || "",
          },
          { merge: true }
        );
      }
    } catch (err) {
      setPasswordMessage("Eroare: " + err.message);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    if (!window.confirm("Sigur vrei să ștergi contul? Această acțiune e ireversibilă!")) return;
    try {
      await deleteDoc(doc(db, "users", user.uid));
      const snap = await getDocs(query(collection(db, "issues"), where("uid", "==", user.uid)));
      const batch = writeBatch(db);
      snap.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      await deleteUser(user);
      navigate("/");
    } catch (err) {
      alert("Eroare la ștergerea contului: " + err.message);
    }
  };

  const chartData = {
    labels: days,
    datasets: [
      {
        label: "Evenimente / raportări",
        data: stats,
        backgroundColor: "rgba(143, 72, 255, 0.65)",
        borderColor: "rgba(143, 72, 255, 0.9)",
        borderWidth: 2,
        borderRadius: 10,
      },
    ],
  };
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: 12 },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
          precision: 0,
          color: "#cfd4ff",
          font: { size: 12, family: "Inter, sans-serif" },
        },
        grid: { color: "rgba(255,255,255,0.08)" },
      },
      x: {
        ticks: {
          color: "#cfd4ff",
          font: { size: 12, family: "Inter, sans-serif" },
          maxRotation: 15,
          minRotation: 0,
        },
        grid: { color: "rgba(255,255,255,0.02)" },
      },
    },
    plugins: {
      legend: { labels: { color: "#e9eaf8", font: { family: "Inter, sans-serif" } } },
      tooltip: {
        backgroundColor: "rgba(16,11,41,0.95)",
        borderColor: "rgba(143,72,255,0.4)",
        borderWidth: 1,
        titleColor: "#fff",
        bodyColor: "#cfd4ff",
        padding: 10,
        displayColors: false,
      },
    },
  };

  const createdOn = accountCreatedAt ? new Date(accountCreatedAt) : null;
  const issuesCount = useMemo(() => issuesList.filter((i) => i.uid === user?.uid).length, [issuesList, user]);
  const avatarSrc = profilePicUrl || user?.photoURL || defaultProfile;
  const hasStats = useMemo(() => stats.some((v) => v > 0), [stats]);

  return (
    <div className="account-page">
      <div className="account-glow glow-left" aria-hidden="true" />
      <div className="account-glow glow-right" aria-hidden="true" />

      <header className="account-hero">
        <div className="hero-left">
          <p className="eyebrow">Contul meu</p>
          <h1>Profil, securitate și activitate</h1>
          <p className="lede">
            Actualizează-ți identitatea, vezi xp-ul acumulat și urmărește-ți ritmul de publicare pe MeetTM.
          </p>
          <div className="hero-badges">
            {createdOn && <span className="pill">Member din {createdOn.toLocaleDateString("ro-RO")}</span>}
            <span className="pill">XP: {xp}</span>
            <span className="pill">Loc: {rank ?? "-"}</span>
          </div>
        </div>
        <div className="hero-avatar">
          <img src={avatarSrc} alt="Avatar" />
          <p className="muted">Imagine de profil</p>
        </div>
      </header>

      <section className="account-grid">
        <div className="card profile-card">
          <div className="card-head">
            <div>
              <p className="eyebrow">Date personale</p>
              <h3>Profilul meu</h3>
            </div>
          </div>
          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="field">
              <span>Username</span>
              <input name="username" value={profile.username} onChange={handleChange} required />
            </label>
            <label className="field">
              <span>Email</span>
              <input name="email" type="email" value={profile.email} onChange={handleChange} required />
            </label>
            <label className="field">
              <span>Telefon</span>
              <input name="phone" value={profile.phone} onChange={handleChange} />
            </label>
            <label className="field">
              <span>Parolă veche</span>
              <input name="currentPassword" type="password" value={profile.currentPassword} onChange={handleChange} />
            </label>
            <label className="field">
              <span>Parolă nouă</span>
              <input name="password" type="password" value={profile.password} onChange={handleChange} />
            </label>
            <label className="field upload-field">
              <span>Poza de profil</span>
              <div className="upload-row">
                <input name="profilePic" type="file" accept="image/*" onChange={handleChange} />
                {avatarSrc && <img className="avatar-preview" src={avatarSrc} alt="Preview" />}
              </div>
            </label>
            <div className="form-actions">
              <button type="submit" className="primary-btn">
                Salvează modificările
              </button>
              {passwordMessage && (
                <span className={`status-msg ${passwordMessage.includes("succes") ? "success" : "error"}`}>
                  {passwordMessage}
                </span>
              )}
            </div>
          </form>
        </div>

        <div className="card info-card">
          <div className="card-head">
            <p className="eyebrow">Status cont</p>
            <h3>Insight-uri rapide</h3>
          </div>
          <div className="metrics">
            <div className="metric">
              <p className="metric-label">XP curent</p>
              <p className="metric-value">{xp}</p>
              <span className="metric-meta">crescut automat după evenimente</span>
            </div>
            <div className="metric">
              <p className="metric-label">Loc în clasament</p>
              <p className="metric-value">{rank ?? "-"}</p>
              <span className="metric-meta">actualizat live</span>
            </div>
            <div className="metric">
              <p className="metric-label">Evenimente publicate</p>
              <p className="metric-value">{issuesCount}</p>
              <span className="metric-meta">în total</span>
            </div>
          </div>
        </div>

        {!isAdmin && (
          <div className="card chart-card">
            <div className="card-head">
              <p className="eyebrow">Activitate săptămânală</p>
              <h3>Raportări / zile</h3>
            </div>
            <div className="chart-wrapper">
              {hasStats ? (
                <Bar data={chartData} options={chartOptions} />
              ) : (
                <p className="chart-empty">Publică un eveniment pentru a vedea activitatea săptămânală.</p>
              )}
            </div>
          </div>
        )}

        <div className="card danger-card">
          <div className="card-head">
            <p className="eyebrow">Securitate</p>
            <h3>Șterge contul</h3>
          </div>
          <p className="muted">
            Această acțiune este ireversibilă și va elimina toate evenimentele publicate de tine.
          </p>
          <div className="danger-actions">
            <button type="button" className="danger-btn" onClick={handleDeleteAccount}>
              Șterge contul
            </button>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => {
                auth.signOut();
                navigate("/");
              }}
            >
              Log out
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
