import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './cssComponents/LandingPage.css';
import GoogleMapView from "./GoogleMapView";
import { getFirestore, collection, onSnapshot } from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { firebaseConfig } from "../firebase/config";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function LandingPage() {
  const [complaint, setComplaint] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [issues, setIssues] = useState([]);

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

    if (!complaint.trim()) return; // nu trimite text gol / doar spații

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
        <div className="text_content">
          <h1>UrbanTm - your intelligent city</h1>
        <p>Report any problem or suggestion to help us improve our city together.</p>
        </div>
        
        <div className="map-view">
        <h2>View Complaints on Map</h2>
        <GoogleMapView markers={issues} />
      </div>
      </div>

      {/* <div className="complaint-form">
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
