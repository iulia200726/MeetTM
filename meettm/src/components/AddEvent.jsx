import React, { useEffect, useState } from "react";
import { getFirestore, doc, getDoc, addDoc, collection } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useNavigate } from "react-router-dom";
import { initializeApp } from "firebase/app";
import { firebaseConfig } from "../firebase/config";
import { getAuth } from "firebase/auth";
import defaultProfile from "./img/default-profile.svg";
import AppNavigation from "./appnavigation.jsx";
import "./AddEvent.css";

const app = initializeApp(firebaseConfig);
const db = getFirestore();
const storage = getStorage(app);
const auth = getAuth();

const GOOGLE_API_KEY = "AIzaSyDW5XKKX0zKaYfddYpTzaF3alj98xMD0fw";

const TIMISOARA_BOUNDS = {
  north: 45.810,
  south: 45.690,
  east: 21.320,
  west: 21.140,
};

function isInTimisoaraBounds({ lat, lng }) {
  return (
    lat <= TIMISOARA_BOUNDS.north &&
    lat >= TIMISOARA_BOUNDS.south &&
    lng <= TIMISOARA_BOUNDS.east &&
    lng >= TIMISOARA_BOUNDS.west
  );
}

const CATEGORIES = [
  "Music",
  "Art & Culture",
  "Education",
  "Community & Volunteering",
  "Sport",
  "Food & Drink",
  "Party & Fun",
  "Shopping",
  "Nature",
  "Business",
  "Family & Animals",
  "Other",
];

function AddEvent() {
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [desc, setDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState([]);
  const [gallery, setGallery] = useState([]);
  const [addressWarning, setAddressWarning] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [hourStart, setHourStart] = useState("");
  const [hourEnd, setHourEnd] = useState("");
  const [spotifyPlaylistUrl, setSpotifyPlaylistUrl] = useState("");
  const navigate = useNavigate();
  const user = auth.currentUser;

  // Apply the add-event background to the whole page while this view is active
  useEffect(() => {
    document.body.classList.add("add-event-bg");
    return () => document.body.classList.remove("add-event-bg");
  }, []);

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files);
    let newImages = [...images, ...files];
    if (newImages.length > 5) newImages = newImages.slice(0, 5);
    setImages(newImages);

    const readers = newImages.map(
      (file) =>
        new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target.result);
          reader.readAsDataURL(file);
        })
    );
    Promise.all(readers).then((urls) => setGallery(urls));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setAddressWarning("");
    try {
      const resp = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
          address
        )}&key=${GOOGLE_API_KEY}`
      );
      const data = await resp.json();
      if (data.status !== "OK") throw new Error("Address could not be found!");

      let loc = null;
      let foundTimisoara = false;
      for (const result of data.results) {
        const addressComponents = result.address_components.map((c) => c.long_name.toLowerCase());
        const isTimisoara =
          addressComponents.includes("timiEToara") ||
          addressComponents.includes("timisoara");
        const { lat, lng } = result.geometry.location;
        if (isTimisoara && isInTimisoaraBounds({ lat, lng })) {
          loc = { lat, lng };
          foundTimisoara = true;
          break;
        }
      }
      if (!loc) {
        loc = data.results[0].geometry.location;
      }
      if (!isInTimisoaraBounds(loc)) {
        setAddressWarning("Only addresses from Timisoara are accepted!");
        setLoading(false);
        return;
      }
      if (!foundTimisoara) {
        setAddressWarning("The address entered also exists in other cities. The address in Timisoara was automatically selected, if it exists.");
      }

      if (!dateStart || !dateEnd || !hourStart || !hourEnd) {
        setLoading(false);
        alert("Please select the date and hour intervals!");
        return;
      }
      const startDateTime = new Date(`${dateStart}T${hourStart}`);
      const endDateTime = new Date(`${dateEnd}T${hourEnd}`);
      if (startDateTime > endDateTime) {
        setLoading(false);
        alert("End date/time must be after start date/time!");
        return;
      }

      let imageUrls = [];
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const storageRef = ref(
          storage,
          `issues/${Date.now()}_${img.name}`
        );
        await uploadBytes(storageRef, img);
        const url = await getDownloadURL(storageRef);
        imageUrls.push(url);
      }

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      let displayName = user.displayName || user.email;
      let profilePicUrl = user.photoURL || defaultProfile;

      if (userSnap.exists()) {
        const data = userSnap.data();
        if (data.username) displayName = data.username;
        profilePicUrl = data.profilePicUrl ? data.profilePicUrl : defaultProfile;
      }

      await addDoc(collection(db, "issues"), {
        title,
        address,
        lat: loc.lat,
        lng: loc.lng,
        desc,
        category,
        images: imageUrls,
        created: new Date().toISOString(),
        uid: user.uid,
        upvotes: 0,
        upvotedBy: [],
        displayName,
        profilePicUrl,
        dateStart,
        dateEnd,
        hourStart,
        hourEnd,
        endDateTime: endDateTime.toISOString(), // pentru filtrare/stergere automata
        spotifyPlaylistUrl: spotifyPlaylistUrl.trim() || null,
      });
      navigate("/dashboard");
    } catch (err) {
      alert(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="add-event-page">
      <div className="add-event-glow glow-purple" />
      <div className="add-event-glow glow-pink" />
      <form className="add-event-form" onSubmit={handleSubmit}>
        <div className="add-event-header">
          <p className="eyebrow">Live pe MeetTM</p>
          <h2>Adauga un eveniment memorabil</h2>
          <p className="lede">
            Completeaza detaliile si lanseaza-ti evenimentul in vibe-ul electric al Timisoarei.
          </p>
        </div>

        <div className="field">
          <label>Titlu</label>
          <input
            placeholder="Ex: Vernisaj urban, Silent party, Food market"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label>Adresa</label>
          <input
            placeholder="Str. Unirii nr. 1, Timisoara"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label>Descriere</label>
          <textarea
            placeholder="Spune-ne povestea evenimentului: atmosfera, line-up, surprize..."
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Categorie</label>
          <div className="select-wrapper">
            <select value={category} onChange={e => setCategory(e.target.value)}>
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label>Galerie (max 5)</label>
          <div className="upload-row">
            <input
              className="file-input"
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageChange}
            />
            <p className="muted">Sugestie: cover vibrant + detalii de atmosfera.</p>
          </div>
          <div className="gallery-grid">
            {gallery.map((url, idx) => (
              <figure key={idx} className="thumb">
                <img src={url} alt={`preview-${idx}`} />
              </figure>
            ))}
          </div>
        </div>

        <div className="field-grid">
          <div className="field">
            <label>Data start</label>
            <input
              type="date"
              value={dateStart}
              onChange={e => setDateStart(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Data final</label>
            <input
              type="date"
              value={dateEnd}
              onChange={e => setDateEnd(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="field-grid">
          <div className="field">
            <label>Ora start</label>
            <input
              type="time"
              value={hourStart}
              onChange={e => setHourStart(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Ora final</label>
            <input
              type="time"
              value={hourEnd}
              onChange={e => setHourEnd(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="field">
          <label>Spotify Playlist (optional)</label>
          <input
            type="url"
            placeholder="https://open.spotify.com/playlist/..."
            value={spotifyPlaylistUrl}
            onChange={e => setSpotifyPlaylistUrl(e.target.value)}
          />
        </div>

        {addressWarning && (
          <div className="warning">{addressWarning}</div>
        )}

        <button className="primary-btn" type="submit" disabled={loading}>
          {loading ? "Se trimite..." : "Publica evenimentul"}
        </button>
      </form>
      <AppNavigation />
    </div>
  );
}

export default AddEvent;
