import { registerSW } from "virtual:pwa-register";
import "./app3d/main";

// Always activate a newer release immediately so installed copies do not remain
// stranded on an old Netlify Drop deployment.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    void updateSW(true);
  },
  onRegisteredSW(_swUrl, registration) {
    void registration?.update();
  },
});
