// src/components/AccountWhite.jsx
import React, { useState, useEffect } from "react";
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

// Register Chart.js components
Chart.register(BarElement, CategoryScale, LinearScale);

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Romanian days
const days = ["Duminică","Luni","Marți","Miercuri","Joi","Vineri","Sâmbătă"];

export default function AccountWhite() {
  // Profile form state
  const [profile, setProfile] = useState({ username: "", email: "", phone: "", currentPassword: "", password: "", profilePic: null });
  const [passwordMessage, setPasswordMessage] = useState("");

  // Weekly stats
  const [stats, setStats] = useState(Array(7).fill(0));

  // XP & ranking
  const [issuesList, setIssuesList] = useState([]);
  const [xp, setXp] = useState(0);
  const [accountCreatedAt, setAccountCreatedAt] = useState(null);
  const [usersXP, setUsersXP] = useState([]);
  const [rank, setRank] = useState(null);

  const navigate = useNavigate();
  const user = auth.currentUser;
  const isAdmin = user && user.email === "admin@admin.com";

  // Load user profile, XP and stats
  useEffect(() => {
    if (!user) return;
    const userRef = doc(db, "users", user.uid);
    getDoc(userRef).then(snap => {
      if (snap.exists()) {
        const data = snap.data();
        setProfile(p => ({ ...p, username: data.username||"", email: data.email||user.email, phone: data.phone||"" }));
        setAccountCreatedAt(data.createdAt || user.metadata.creationTime);
        setXp(data.xp || 0);
      } else {
        setProfile(p => ({ ...p, email: user.email||"" }));
        setAccountCreatedAt(user.metadata.creationTime);
        setXp(0);
        setDoc(userRef, { xp: 0, createdAt: user.metadata.creationTime }, { merge: true });
      }
    });
    // Weekly stats
    const statsQ = query(collection(db, "issues"), where("uid","==",user.uid));
    const unsubStats = onSnapshot(statsQ, snap => {
      const counts = Array(7).fill(0);
      snap.docs.forEach(d => counts[new Date(d.data().created).getDay()]++);
      setStats(counts);
    });
    return () => unsubStats();
  }, [user]);

  // Listen all issues for XP and badges calculation
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "issues"), snap => {
      setIssuesList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // Update XP
  useEffect(() => {
    if (!user) return;
    const count = issuesList.filter(i => i.uid===user.uid).length;
    const newXp = count * 5;
    setXp(newXp);
    setDoc(doc(db,"users",user.uid), { xp: newXp }, { merge: true });
  }, [issuesList, user]);

  // Leaderboard
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), snap => {
      const all = snap.docs.map(d => ({ uid:d.id, xp:d.data().xp||0 }));
      all.sort((a,b) => b.xp - a.xp);
      setUsersXP(all);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user || usersXP.length===0) return setRank(null);
    const idx = usersXP.findIndex(u=>u.uid===user.uid);
    setRank(idx>=0?idx+1:null);
  }, [usersXP, user]);

  // Form handlers
  const handleChange = e => {
    const { name,value,files } = e.target;
    setProfile(p => ({ ...p, [name]: files?files[0]:value }));
  };
  const handleSubmit = async e => {
    e.preventDefault(); setPasswordMessage("");
    try {
      // Password
      if (profile.password) {
        if (!profile.currentPassword) return setPasswordMessage("Te rog introdu parola veche mai întâi.");
        const cred = EmailAuthProvider.credential(user.email, profile.currentPassword);
        await reauthenticateWithCredential(user,cred);
        await updatePassword(user,profile.password);
        setPasswordMessage("Parola a fost schimbată cu succes!");
      } else {
        setPasswordMessage("Datele au fost actualizate!");
      }
      // Profile pic
      const userRef = doc(db,"users",user.uid);
      let profilePicUrl = null;
      if (profile.profilePic) {
        const storage = getStorage();
        const storageRef = ref(storage,`profilePics/${user.uid}`);
        await uploadBytes(storageRef,profile.profilePic);
        profilePicUrl = await getDownloadURL(storageRef);
        await setDoc(userRef,{profilePicUrl},{merge:true});
      }
      // Other fields
      await setDoc(userRef,{
        username:profile.username,
        email:profile.email,
        phone:profile.phone,
      },{merge:true});

      // --- ACTUALIZEAZĂ TOATE COMENTARIILE USERULUI ---
      // Obține poza actualizată (nouă sau veche)
      let finalProfilePicUrl = profilePicUrl;
      if (!finalProfilePicUrl) {
        const snap = await getDoc(userRef);
        finalProfilePicUrl = snap.exists() && snap.data().profilePicUrl ? snap.data().profilePicUrl : "";
      }
      // Găsește toate issues
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

      // --- ACTUALIZEAZĂ TOATE POSTĂRILE USERULUI ---
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
    } catch(err) {
      setPasswordMessage("Eroare: " + err.message);
    }
  };
  const handleDeleteAccount = async () => {
    if(!window.confirm("Sigur vrei să ștergi contul? Această acțiune e ireversibilă!")) return;
    try {
      await deleteDoc(doc(db,"users",user.uid));
      const snap = await getDocs(query(collection(db,"issues"),where("uid","==",user.uid)));
      const batch = writeBatch(db);
      snap.forEach(d=>batch.delete(d.ref));
      await batch.commit();
      await deleteUser(user);
      navigate("/");
    } catch(err) {
      alert("Eroare la ștergerea contului: " + err.message);
    }
  };

  // Chart
  const chartData = { labels:days,datasets:[{label:"Probleme raportate",data:stats,backgroundColor:"#36a2eb"}] };
  const chartOptions = { scales:{y:{beginAtZero:true,ticks:{stepSize:1,precision:0}}}};

  // Styles
  const styles = {
    wrapper:{maxWidth:600,margin:"40px auto",padding:"0 16px",fontFamily:"sans-serif",color:"#222"},
    box:{background:"#fff",padding:32,borderRadius:8,boxShadow:"0 2px 12px rgba(0,0,0,0.1)",marginBottom:24},
    title:{marginBottom:24,fontSize:24,fontWeight:600},
    field:{marginBottom:16,display:"flex",flexDirection:"column"},
    input:{padding:"8px 12px",border:"1px solid #ccc",borderRadius:4},
    btnSave:{padding:"10px 20px",border:"none",borderRadius:4,background:"#36a2eb",color:"#fff",cursor:"pointer"},
    btnDelete:{padding:"10px 20px",border:"none",borderRadius:4,background:"#e53935",color:"#fff",cursor:"pointer"},
    msgSuccess:{color:"green",marginTop:8},
    msgError:{color:"red",marginTop:8},
  };

  return (
    <div style={styles.wrapper}>
      {/* Profil */}
      <div style={styles.box}>
        <h2 style={styles.title}>Profilul meu</h2>
        <form onSubmit={handleSubmit}>
          <div style={styles.field}><label>Username:</label><input name="username" style={styles.input} value={profile.username} onChange={handleChange}/></div>
          <div style={styles.field}><label>Email:</label><input name="email" type="email" style={styles.input} value={profile.email} onChange={handleChange}/></div>
          <div style={styles.field}><label>Telefon:</label><input name="phone" style={styles.input} value={profile.phone} onChange={handleChange}/></div>
          <div style={styles.field}><label>Parolă veche:</label><input name="currentPassword" type="password" style={styles.input} value={profile.currentPassword} onChange={handleChange}/></div>
          <div style={styles.field}><label>Parolă nouă:</label><input name="password" type="password" style={styles.input} value={profile.password} onChange={handleChange}/></div>
          <div style={styles.field}><label>Poza de profil:</label><input name="profilePic" type="file" accept="image/*" onChange={handleChange}/></div>
          <button type="submit" style={styles.btnSave}>Salvează modificările</button>
        </form>
        {passwordMessage && <div style={passwordMessage.includes("succes")?styles.msgSuccess:styles.msgError}>{passwordMessage}</div>}
        <button onClick={handleDeleteAccount} style={styles.btnDelete}>Șterge contul</button>
      </div>

      {/* Grafic săptămânal */}
      {!isAdmin && (
        <div style={styles.box}>
          <h3>Status săptămânal</h3>
          <Bar data={chartData} options={chartOptions}/>
        </div>
      )}
    </div>
  );
}
