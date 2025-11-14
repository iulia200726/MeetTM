# Event Aura Implementation TODO

## Backend Changes
- [x] Add new Firestore collections: event_likes, event_checkins, event_ratings, event_noise
- [x] Modify `meettm/server/index.js`:
  - [x] Add endpoint `/api/event/like` to record likes
  - [x] Add endpoint `/api/event/checkin` to record check-ins
  - [x] Add endpoint `/api/event/rate` to record ratings (1-5)
  - [x] Add endpoint `/api/event/noise` to record ambient noise levels
  - [x] Add endpoint `/api/event/aura` to calculate and return aura scores for all events
  - [x] Implement aura calculation: weighted average of likes (20%), check-ins (30%), noise (20%), ratings (30%)

## Frontend Changes
- [x] Update `meettm/src/components/GoogleMapView.jsx`:
  - [x] Import HeatmapLayer from @react-google-maps/api
  - [x] Replace Circle components with HeatmapLayer
  - [x] Fetch aura data from new /api/event/aura endpoint
  - [x] Map aura scores to heatmap colors: red (>80), yellow (50-80), blue (<50), violet for artistic events
  - [x] Add real-time updates via polling or WebSocket

## Followup Steps
- [x] Test all new API endpoints
- [x] Verify heatmap renders correctly with different aura levels
- [x] Ensure real-time updates work
- [ ] Add UI controls for users to submit likes/check-ins/ratings/noise
- [ ] Test on mobile devices for microphone access
