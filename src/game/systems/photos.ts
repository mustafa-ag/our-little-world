import { PHOTO_SPOTS, type PhotoSpot } from "../data/photos";
import { store } from "./store";

export function photoSpotReady(spot: PhotoSpot) {
  if (store.state.photos[spot.id]) return false;
  if (spot.requiredTime && spot.requiredTime !== store.state.timeOfDay) return false;
  if (spot.requiredNPC && store.state.activeCompanionId !== spot.requiredNPC) return false;
  if (spot.requiredRelationship && store.getRelationship(spot.requiredRelationship.npc) < spot.requiredRelationship.min) return false;
  return true;
}

export function capturePhoto(spotId: string) {
  const spot = PHOTO_SPOTS.find((candidate) => candidate.id === spotId);
  if (!spot || !photoSpotReady(spot)) return false;
  const photo = store.capturePhoto({
    id: spot.id,
    title: spot.title,
    locationId: spot.locationId,
    day: store.state.currentDay,
    timeOfDay: store.state.timeOfDay,
    companionId: store.state.activeCompanionId,
    caption: spot.description,
  });
  if (photo && spot.memoryId) store.unlockMemory(spot.memoryId);
  return photo;
}
