import { registerSW } from "virtual:pwa-register";
import "./app3d/main";

// register the service worker so the game works offline / installs to home screen
registerSW({ immediate: true });
