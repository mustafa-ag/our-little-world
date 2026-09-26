import { souvenirForCity } from "../data/souvenirs";
import { store } from "./store";

const COUNTRY_BY_CITY: Record<string, string> = {
  abudhabi: "uae",
  dubai: "uae",
  london: "uk",
  edinburgh: "uk",
  leicester: "uk",
  germany: "germany",
  italy: "italy",
  greece: "greece",
};

export function recordCityVisit(cityId: string) {
  const cityKey = `visited_city_${cityId}`;
  if (!store.hasFlag(cityKey)) {
    store.setFlag(cityKey);
    store.incrementStat("cities_visited");
  }
  const country = COUNTRY_BY_CITY[cityId] ?? cityId;
  const countryKey = `visited_country_${country}`;
  if (!store.hasFlag(countryKey)) {
    store.setFlag(countryKey);
    store.incrementStat("countries_visited");
  }
  const souvenir = souvenirForCity(cityId);
  if (souvenir) store.unlockSouvenir(souvenir.id);
}

/** One completed pillar fans out into the scrapbook, texts, outfits and stats. */
export function recordQuestLifeConsequences(questId: string) {
  if (store.hasFlag(`life_consequences_${questId}`)) return;
  store.setFlag(`life_consequences_${questId}`);
  switch (questId) {
    case "q_baba_card":
      store.incrementStat("baba_card_purchases");
      break;
    case "q_baba_spree":
      store.incrementStat("shopping_bags", 8);
      store.unlockMemory("mem_baba_spree");
      break;
    case "q_family_jewel_heist":
      store.incrementStat("sharks_defeated");
      store.unlockMemory("mem_pirate_heist");
      store.unlockMemory("mem_great_white");
      break;
    case "q_adnoc_engineer":
      store.incrementStat("promotions_earned");
      store.unlockMemory("mem_adnoc_first_day");
      break;
    case "q_adnoc_ceo":
      store.incrementStat("promotions_earned");
      store.unlockMemory("mem_adnoc_ceo");
      break;
    case "q_adnoc_paperclip_incident":
      store.incrementStat("paperclips_thrown", 12);
      store.incrementStat("promotions_earned");
      break;
    case "q_adnoc_team_lead":
    case "q_adnoc_control_room":
      store.incrementStat("promotions_earned");
      break;
    case "q_chloe":
      store.incrementStat("thesis_pages_saved", 47);
      store.unlockMemory("mem_chloe_thesis");
      break;
    case "q_hudayriyat":
      store.incrementStat("seagull_fries_stolen");
      store.unlockMemory("mem_seagull_crime");
      break;
    case "q_desert_wedding":
      store.state.stats.wedding_completed = 1;
      store.state.flags.wedding_completed = true;
      break;
    case "q_first_property":
      store.incrementStat("moving_days");
      break;
  }
}
