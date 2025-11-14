import React, { useState } from "react";
import { getFirestore, doc, getDoc, addDoc, collection } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useNavigate } from "react-router-dom";
import { initializeApp } from "firebase/app";
import { firebaseConfig } from "../firebase/config";
import { getAuth } from "firebase/auth";
import defaultProfile from "./img/default-profile.svg";

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
  const navigate = useNavigate();
  const user = auth.currentUser;

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
      // 2. Geocode address
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
          addressComponents.includes("timișoara") ||
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

      // Validare date și ore
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
        endDateTime: endDateTime.toISOString(), // pentru filtrare/ștergere automată
      });
      navigate("/dashboard");
    } catch (err) {
      alert(err.message);
    }
    setLoading(false);
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{ maxWidth: 400, margin: "2rem auto" }}
    >
      <h2>Add an event</h2>
      <input
        placeholder="Name"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <input
        placeholder="Address"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        required
      />
      <textarea
        placeholder="Description"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
      />
      {/* Dropdown categorie */}
      <div style={{ margin: "1rem 0" }}>
        <label>
          Categoria:
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            style={{ marginLeft: 8, padding: 4, borderRadius: 6, border: "1px solid #ccc" }}
          >
            {CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ margin: "1rem 0" }}>
        <label>
          Pictures (max 5):
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageChange}
            style={{ marginBottom: 8 }}
          />
        </label>

        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          {gallery.map((url, idx) => (
            <img
              key={idx}
              src={url}
              alt={`preview-${idx}`}
              style={{
                width: 60,
                height: 60,
                objectFit: "cover",
                borderRadius: 8,
                border: "1px solid #ccc"
              }}
            />
          ))}
        </div>
      </div>
      {/* Selectare dată și oră */}
      <div style={{ margin: "1rem 0" }}>
        <label>
          Start date:
          <input
            type="date"
            value={dateStart}
            onChange={e => setDateStart(e.target.value)}
            required
            style={{ marginLeft: 8 }}
          />
        </label>
      </div>
      <div style={{ margin: "1rem 0" }}>
        <label>
          End date:
          <input
            type="date"
            value={dateEnd}
            onChange={e => setDateEnd(e.target.value)}
            required
            style={{ marginLeft: 8 }}
          />
        </label>
      </div>
      <div style={{ margin: "1rem 0" }}>
        <label>
          Start hour:
          <input
            type="time"
            value={hourStart}
            onChange={e => setHourStart(e.target.value)}
            required
            style={{ marginLeft: 8 }}
          />
        </label>
      </div>
      <div style={{ margin: "1rem 0" }}>
        <label>
          End hour:
          <input
            type="time"
            value={hourEnd}
            onChange={e => setHourEnd(e.target.value)}
            required
            style={{ marginLeft: 8 }}
          />
        </label>
      </div>
      {addressWarning && (
        <div style={{ color: "red", marginBottom: 8 }}>{addressWarning}</div>
      )}
      <button type="submit" disabled={loading}>
        {loading ? "Sending..." : "Send"}
      </button>
    </form>
  );
}

export default AddEvent;