import React, { useState, useEffect } from "react";
import { GoogleMap, Circle, InfoWindow, HeatmapLayer, Marker } from "@react-google-maps/api";
import "./cssComponents/GoogleMapView.css";

const containerStyle = {
  width: "100%",
  height: "clamp(280px, 45vh, 420px)",
  borderRadius: "26px",
  overflow: "hidden",
  border: "1px solid rgba(255, 255, 255, 0.15)",
  boxShadow: "0 35px 70px rgba(15, 23, 42, 0.25)"
};

const CATEGORY_COLORS = {
  Music: "#c21e56",
  "Art & Culture": "#8a2be2",
  Education: "#1e3a8a",
  "Community & Volunteering": "#40e0d0",
  Sport: "#ff9322",
  "Food & Drink": "#ffd707",
  "Party & Fun": "#ff1493",
  Shopping: "#9c27b0",
  Nature: "#228b22",
  Business: "#a1887f",
  "Family & Animals": "#4f9d9d",
  Other: "#ffdab9",
};

function getMarkerColor(issue) {
  return CATEGORY_COLORS[issue.category] || "#ffdab9";
}

function getCircleOptions(issue) {
  return {
    fillOpacity: 1,
    strokeOpacity: 0,
    radius: 10,
    strokeWeight: 0,
    zIndex: 2,
    fillColor: getMarkerColor(issue),
    strokeColor: "#fff",
  };
}

function GoogleMapView({ markers = [] }) {
  const [selectedCoords, setSelectedCoords] = useState(null);
  const [auraData, setAuraData] = useState([]);
  const now = new Date();

  useEffect(() => {
    const fetchAuraData = async () => {
      try {
        const response = await fetch("http://localhost:5000/api/event/aura");
        if (response.ok) {
          const data = await response.json();
          setAuraData(data.auraData || []);
        }
      } catch (error) {
        console.error("Failed to fetch aura data:", error);
      }
    };

    fetchAuraData();
    const interval = setInterval(fetchAuraData, 30000);
    return () => clearInterval(interval);
  }, []);

  const activeMarkers = markers.filter((m) => {
    if (!m.endDateTime) return true;
    return new Date(m.endDateTime) > now;
  });

  const center = { lat: 45.75372, lng: 21.22571 };

  const mapOptions = {
    restriction: {
      latLngBounds: {
        north: 45.81,
        south: 45.69,
        east: 21.32,
        west: 21.14,
      },
      strictBounds: true,
    },
    styles: [
      {
        featureType: "poi.business",
        stylers: [{ visibility: "off" }],
      },
      {
        featureType: "poi.park",
        elementType: "labels.text",
        stylers: [{ visibility: "off" }],
      },
      {
        featureType: "road",
        elementType: "labels.icon",
        stylers: [{ visibility: "off" }],
      },
      {
        featureType: "transit",
        stylers: [{ visibility: "off" }],
      },
      {
        featureType: "water",
        stylers: [{ color: "#aadaff" }],
      },
      {
        featureType: "landscape",
        stylers: [{ color: "#f2f2f2" }],
      },
      {
        elementType: "labels.text.fill",
        stylers: [{ color: "#444444" }],
      },
      {
        featureType: "administrative",
        elementType: "labels.text.fill",
        stylers: [{ color: "#888888" }],
      },
    ],
  };

  const selectedIssues = selectedCoords
    ? markers.filter(
        (m) =>
          Math.abs(m.lat - selectedCoords.lat) < 0.0001 &&
          Math.abs(m.lng - selectedCoords.lng) < 0.0001
      )
    : [];

  const canUseGoogle =
    typeof window !== "undefined" && window.google && window.google.maps;
  const heatmapData =
    canUseGoogle && Array.isArray(auraData)
      ? auraData.map((aura) => ({
          location: new window.google.maps.LatLng(aura.lat, aura.lng),
          weight: aura.weight,
        }))
      : [];

  const legendItems = [];
  activeMarkers.forEach((issue) => {
    const label = issue.category || "Other";
    if (!legendItems.find((item) => item.label === label)) {
      legendItems.push({ label, color: getMarkerColor(issue) });
    }
  });

  if (legendItems.length === 0) {
    Object.entries(CATEGORY_COLORS)
      .slice(0, 4)
      .forEach(([label, color]) => legendItems.push({ label, color }));
  }

  const activeCountLabel =
    activeMarkers.length === 1 ? "eveniment activ" : "evenimente active";

  return (
    <div className="map-card">
      <div className="map-card__header">
        <div>
          <p className="map-card__eyebrow">Live pe MeetTM</p>
          <h3 className="map-card__title">Exploreaza evenimentele din Timisoara</h3>
        </div>
        <div className="map-card__badge">
          <span className="map-card__badge-dot" />
          {activeMarkers.length} {activeCountLabel}
        </div>
      </div>

      <div className="map-card__body">
        <div className="map-card__glow" aria-hidden="true" />
        <GoogleMap mapContainerStyle={containerStyle} center={center} zoom={13} options={mapOptions}>
          {heatmapData.length > 0 && (
            <HeatmapLayer
              data={heatmapData}
              options={{
                radius: 10,
                opacity: 0.6,
                gradient: [
                  "rgba(0, 0, 255, 0)",
                  "rgba(0, 0, 255, 0.3)",
                  "rgba(255, 255, 0, 0.5)",
                  "rgba(255, 0, 0, 0.7)",
                  "rgba(138, 43, 226, 0.9)",
                ],
              }}
            />
          )}
          {activeMarkers.map((issue) => {
            if (issue.lat == null || issue.lng == null) return null;
            const position = { lat: Number(issue.lat), lng: Number(issue.lng) };
            const onClick = () => setSelectedCoords(position);

            if (canUseGoogle) {
              return (
                <Marker
                  key={issue.id || `${issue.lat}-${issue.lng}`}
                  position={position}
                  onClick={onClick}
                  icon={{
                    path: window.google.maps.SymbolPath.CIRCLE,
                    scale: 8,
                    fillColor: getMarkerColor(issue),
                    fillOpacity: 1,
                    strokeOpacity: 0,
                  }}
                />
              );
            }

            return (
              <Circle
                key={issue.id || `${issue.lat}-${issue.lng}`}
                center={position}
                options={{ ...getCircleOptions(issue), clickable: true }}
                onClick={onClick}
              />
            );
          })}
          {selectedCoords && (
            <InfoWindow
              position={selectedCoords}
              onCloseClick={() => setSelectedCoords(null)}
              disableAutoPan={true}
            >
              <div className="map-infowindow">
                <h3 className="map-infowindow__title">
                  Evenimente la:{" "}
                  {selectedIssues[0] && selectedIssues[0].address
                    ? selectedIssues[0].address.charAt(0).toUpperCase() +
                      selectedIssues[0].address.slice(1)
                    : ""}
                </h3>
                <ul className="map-infowindow__list">
                  {selectedIssues.map((issue, i) => (
                    <li key={i} className="map-infowindow__item">
                      <span className="map-infowindow__item-title">
                        {issue.title}
                      </span>
                      <span className="map-infowindow__item-desc">
                        {issue.desc}
                      </span>
                      <span className="map-infowindow__pill">
                        <span
                          className="map-infowindow__pill-dot"
                          style={{ backgroundColor: getMarkerColor(issue) }}
                        />
                        {issue.category || "Other"}
                      </span>
                    </li>
                  ))}
                </ul>
                {selectedIssues.length === 0 && (
                  <p className="map-infowindow__empty">Niciun eveniment aici</p>
                )}
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </div>

      <div className="map-card__legend">
        {legendItems.map(({ label, color }) => (
          <span key={label} className="map-card__legend-item">
            <span
              className="map-card__legend-dot"
              style={{ backgroundColor: color }}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default GoogleMapView;
