import React, { useState, useEffect } from 'react';
import './cssComponents/LandingPage.css';
import GoogleMapView from "./GoogleMapView";
import { getFirestore, collection, onSnapshot } from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { firebaseConfig } from "../firebase/config";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Textele afișate în hero, fiecare pe câte un <p>
const HERO_TEXTS = [
  "Cultural Events",
  "Concerts",
  "Parties",
  "On MeetTM, you’ll find what suits you",
  "Come and party"
];

// pentru a aproxima ~3 secunde la ștergere
const TOTAL_CHARS = HERO_TEXTS.reduce((sum, t) => sum + t.length, 0);
const DELETE_DURATION_MS = 3000;
const DELETE_INTERVAL =
  TOTAL_CHARS > 0 ? DELETE_DURATION_MS / TOTAL_CHARS : 60; // ms per literă

const TYPE_INTERVAL = 120; // ms per literă la scriere
const LINE_PAUSE = 900;    // pauză între linii la scriere

function LandingPage() {
  const [complaint, setComplaint] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [issues, setIssues] = useState([]);

  // fazele animației: "typing" | "hold" | "deleting" | "pause"
  const [phase, setPhase] = useState("typing");
  const [currentIndex, setCurrentIndex] = useState(0); // linia curentă
  const [charIndex, setCharIndex] = useState(0);       // câte caractere sunt afișate din linia curentă

  // 📝 TYPEWRITER – scrie textele linie cu linie
  useEffect(() => {
    if (phase !== "typing") return;
    if (HERO_TEXTS.length === 0) return;

    const currentText = HERO_TEXTS[currentIndex] || "";
    const isLastLine = currentIndex === HERO_TEXTS.length - 1;

    // dacă suntem pe ultima linie și e complet scrisă → trecem în HOLD
    if (isLastLine && charIndex === currentText.length) {
      setPhase("hold");
      return;
    }

    let timeout;

    if (charIndex < currentText.length) {
      // scriem linia curentă literă cu literă
      timeout = setTimeout(() => {
        setCharIndex((prev) => prev + 1);
      }, TYPE_INTERVAL);
    } else {
      // linia curentă e completă, mergem la următoarea după o pauză scurtă
      timeout = setTimeout(() => {
        setCurrentIndex((prev) => prev + 1);
        setCharIndex(0);
      }, LINE_PAUSE);
    }

    return () => clearTimeout(timeout);
  }, [phase, currentIndex, charIndex]);

  // 🔁 FAZE: hold (5s) → deleting (~3s) → pause (0.5s) → typing
  useEffect(() => {
    let timeout;

    if (phase === "hold") {
      // 5 secunde cu textul complet pe ecran
      timeout = setTimeout(() => {
        setPhase("deleting");
      }, 5000);
    } else if (phase === "pause") {
      // 0.5 secunde text gol, apoi restart
      timeout = setTimeout(() => {
        setCurrentIndex(0);
        setCharIndex(0);
        setPhase("typing");
      }, 500);
    }

    return () => clearTimeout(timeout);
  }, [phase]);

  // 🔙 DELETING – șterge literele una câte una, de jos în sus
  useEffect(() => {
    if (phase !== "deleting") return;
    if (HERO_TEXTS.length === 0) return;

    const currentText = HERO_TEXTS[currentIndex] || "";
    let timeout;

    if (charIndex > 0) {
      // ștergem din linia curentă, literă cu literă
      timeout = setTimeout(() => {
        setCharIndex((prev) => prev - 1);
      }, DELETE_INTERVAL);
    } else {
      // linia curentă a ajuns la 0 caractere
      if (currentIndex > 0) {
        // trecem la linia de deasupra (precedentă), full, apoi o ștergem
        const prevLineIndex = currentIndex - 1;
        const prevLen = HERO_TEXTS[prevLineIndex].length;

        timeout = setTimeout(() => {
          setCurrentIndex(prevLineIndex);
          setCharIndex(prevLen);
        }, DELETE_INTERVAL);
      } else {
        // am șters și prima linie (tot textul e gol)
        setPhase("pause");
      }
    }

    return () => clearTimeout(timeout);
  }, [phase, currentIndex, charIndex]);

  // Ce text afișăm pe linia `index` în funcție de fază
  const getDisplayedText = (index) => {
    if (phase === "pause") {
      return "";
    }

    if (phase === "hold") {
      // în hold totul e complet vizibil
      return HERO_TEXTS[index];
    }

    if (phase === "typing") {
      if (index < currentIndex) {
        return HERO_TEXTS[index]; // liniile deja terminate
      } else if (index === currentIndex) {
        return HERO_TEXTS[index].slice(0, charIndex); // linia care se scrie
      } else {
        return ""; // liniile după cea curentă
      }
    }

    if (phase === "deleting") {
      if (index < currentIndex) {
        return HERO_TEXTS[index]; // încă pline, urmează să fie șterse
      } else if (index === currentIndex) {
        return HERO_TEXTS[index].slice(0, charIndex); // se șterge litera cu litera
      } else {
        return ""; // liniile de dedesubt au fost deja șterse
      }
    }

    return "";
  };

  // --- Firestore: citire issues pentru hartă ---
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "issues"),
      (snap) => {
        setIssues(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      },
      (err) => {
        console.error("Error listening to issues:", err);
      }
    );
    return () => unsub();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!complaint.trim()) return;

    setLoading(true);
    setError('');
    setCategory('');

    try {
      const response = await fetch('http://localhost:5000/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: complaint }),
      });

      if (!response.ok) {
        throw new Error('Server error');
      }

      const data = await response.json();
      setCategory(data.categorie || 'Unknown');
    } catch (err) {
      console.error(err);
      setError('A apărut o eroare la trimiterea cererii.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="LandingPage">
      <div className="hero">
        {/* 🔹 Text stânga */}
        <div className="text_content">
          <div className="hero-lines">
            {HERO_TEXTS.map((text, index) => (
              <p key={index} className="hero-line">
                <span className="typewriter-text">
                  {getDisplayedText(index)}
                </span>
                {/* cursorul clipește mereu pe linia curentă */}
                {index === currentIndex && (
                  <span className="typewriter-cursor">|</span>
                )}
              </p>
            ))}
          </div>

        </div>

        {/* 🔹 Hartă dreapta */}
        <div className="map-view">
          
          <GoogleMapView markers={issues} />
        </div>
      </div>

      {/* Formularul tău rămâne opțional / comentat */}
      {/*
      <div className="complaint-form">
        <h2>Submit a Complaint</h2>
        <form onSubmit={handleSubmit}>
          <textarea
            placeholder="Describe your complaint..."
            required
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
          ></textarea>
          <button type="submit" disabled={loading}>
            {loading ? 'Submitting...' : 'Submit'}
          </button>
        </form>
        {category && (
          <div className="ai-category">
            <b>Category detected by AI:</b> {category}
          </div>
        )}
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
      </div>
      */}
    </div>
  );
}

export default LandingPage;
