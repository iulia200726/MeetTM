import React, { useState, useEffect } from 'react';
import './cssComponents/LandingPage.css';
import GoogleMapView from "./GoogleMapView";
import { getFirestore, collection, onSnapshot } from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { firebaseConfig } from "../firebase/config";
import { Link } from 'react-router-dom';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);


const HERO_TEXTS = [
  "Cultural Events",
  "Concerts",
  "Parties",
  "On MeetTM, you'll find what suits you!",
  "Come and... party!"
];


const TOTAL_CHARS = HERO_TEXTS.reduce((sum, t) => sum + t.length, 0);
const DELETE_DURATION_MS = 3000;
const DELETE_INTERVAL =
  TOTAL_CHARS > 0 ? DELETE_DURATION_MS / TOTAL_CHARS : 60; 

const TYPE_INTERVAL = 120; 
const LINE_PAUSE = 900;   

function LandingPage() {
  const [complaint, setComplaint] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [issues, setIssues] = useState([]);


  const [phase, setPhase] = useState("typing");
  const [currentIndex, setCurrentIndex] = useState(0); 
  const [charIndex, setCharIndex] = useState(0);      


  useEffect(() => {
    if (phase !== "typing") return;
    if (HERO_TEXTS.length === 0) return;

    const currentText = HERO_TEXTS[currentIndex] || "";
    const isLastLine = currentIndex === HERO_TEXTS.length - 1;


    if (isLastLine && charIndex === currentText.length) {
      setPhase("hold");
      return;
    }

    let timeout;

    if (charIndex < currentText.length) {

      timeout = setTimeout(() => {
        setCharIndex((prev) => prev + 1);
      }, TYPE_INTERVAL);
    } else {
    
      timeout = setTimeout(() => {
        setCurrentIndex((prev) => prev + 1);
        setCharIndex(0);
      }, LINE_PAUSE);
    }

    return () => clearTimeout(timeout);
  }, [phase, currentIndex, charIndex]);


  useEffect(() => {
    let timeout;

    if (phase === "hold") {

      timeout = setTimeout(() => {
        setPhase("deleting");
      }, 5000);
    } else if (phase === "pause") {

      timeout = setTimeout(() => {
        setCurrentIndex(0);
        setCharIndex(0);
        setPhase("typing");
      }, 500);
    }

    return () => clearTimeout(timeout);
  }, [phase]);


  useEffect(() => {
    if (phase !== "deleting") return;
    if (HERO_TEXTS.length === 0) return;

    const currentText = HERO_TEXTS[currentIndex] || "";
    let timeout;

    if (charIndex > 0) {

      timeout = setTimeout(() => {
        setCharIndex((prev) => prev - 1);
      }, DELETE_INTERVAL);
    } else {
   
      if (currentIndex > 0) {
     
        const prevLineIndex = currentIndex - 1;
        const prevLen = HERO_TEXTS[prevLineIndex].length;

        timeout = setTimeout(() => {
          setCurrentIndex(prevLineIndex);
          setCharIndex(prevLen);
        }, DELETE_INTERVAL);
      } else {
     
        setPhase("pause");
      }
    }

    return () => clearTimeout(timeout);
  }, [phase, currentIndex, charIndex]);


  const getDisplayedText = (index) => {
    if (phase === "pause") {
      return "";
    }

    if (phase === "hold") {

      return HERO_TEXTS[index];
    }

    if (phase === "typing") {
      if (index < currentIndex) {
        return HERO_TEXTS[index]; // liniile deja terminate
      } else if (index === currentIndex) {
        return HERO_TEXTS[index].slice(0, charIndex); // linia care se scrie
      } else {
        return ""; 
      }
    }

    if (phase === "deleting") {
      if (index < currentIndex) {
        return HERO_TEXTS[index];
      } else if (index === currentIndex) {
        return HERO_TEXTS[index].slice(0, charIndex); 
      } else {
        return ""; 
      }
    }

    return "";
  };


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
      setError('An error occurred while sending the request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="LandingPage">
      <div className="hero">
      
        <div className="text_content">
          <div className="hero-lines">
            {HERO_TEXTS.map((text, index) => (
              <p key={index} className="hero-line">
                <span className="typewriter-text">
                  {getDisplayedText(index)}
                </span>
              
                {index === currentIndex && (
                  <span className="typewriter-cursor">|</span>
                )}
              </p>
            ))}
          </div>

          <div className="hero-subtext">
           Test the new AI Concierge: fill in your preferences and Gemini delivers your itinerary for the evening.
          </div>
          <div className="concierge-cta">
            <Link to="/concierge" className="concierge-btn">Plan my night</Link>
          </div>

        </div>

   
        <div className="map-view">

          <GoogleMapView markers={issues} />
        </div>
      </div>

      {/* Formularul tÄƒu rÄƒmÃ¢ne opÈ›ional / comentat */}
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
