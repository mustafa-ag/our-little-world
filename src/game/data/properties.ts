export type PropertyTheme = "yas" | "dubailand" | "damac" | "downtown" | "villa" | "positano" | "santorini";

export interface PropertyDefinition {
  id: string;
  name: string;
  location: string;
  locationId: string;
  type: string;
  bedrooms: number;
  description: string;
  price: number;
  width: number;
  height: number;
  theme: PropertyTheme;
  wallColor: number;
  floorTint: number;
  requiresMarriage?: boolean;
  /** Lines shown when touring it from the phone (Homes › For sale › Tour). */
  tourLines?: string[];
}

export const PROPERTIES: PropertyDefinition[] = [
  { id: "starter_yas", name: "Juju's Yas Home", location: "Yas Island", locationId: "abudhabi_yas", type: "Cozy home", bedrooms: 1, description: "The original little home. Full of memories and absolutely not for sale.", price: 0, width: 18, height: 13, theme: "yas", wallColor: 0xede0d0, floorTint: 0xffffff },
  { id: "dubailand_2br", name: "Dubailand Two-Bed", location: "Dubailand", locationId: "dubai_hills", type: "Apartment", bedrooms: 2, description: "Warm, practical rooms with enough space for six mugs and a furniture argument.", price: 900, width: 22, height: 15, theme: "dubailand", wallColor: 0xeadcc8, floorTint: 0xfff1dc, tourLines: ["Two bedrooms, a sunny kitchen, and a corner that is clearly for the coffee machine.", "Practical. Warm. Very us."] },
  { id: "damac_hills_2br", name: "DAMAC Hills Two-Bed", location: "DAMAC Hills", locationId: "dubai_damac", type: "Apartment", bedrooms: 2, description: "Contemporary, green and suspiciously perfect for Sunday coffee.", price: 1700, width: 24, height: 15, theme: "damac", wallColor: 0xe4e6df, floorTint: 0xeef3e8, tourLines: ["Green outside every window. Sunday coffee would taste better here.", "Suspiciously perfect."] },
  { id: "downtown_apartment", name: "Downtown Skyline Home", location: "Downtown Dubai", locationId: "dubai_downtown", type: "Apartment", bedrooms: 2, description: "City lights, a long balcony, and a sofa location already under debate.", price: 2900, width: 24, height: 16, theme: "downtown", wallColor: 0xd9dde7, floorTint: 0xe5eaf2, tourLines: ["The skyline fills the whole balcony. At night it glitters.", "We could argue about the sofa for years here."] },
  { id: "damac_hills_villa", name: "DAMAC Hills Garden Villa", location: "DAMAC Hills", locationId: "dubai_damac", type: "Villa", bedrooms: 4, description: "A large buildable family home with garden light and room to change its mind.", price: 4500, width: 30, height: 19, theme: "villa", wallColor: 0xebe3d5, floorTint: 0xf2e7d1, requiresMarriage: true, tourLines: ["A garden, four bedrooms, and room to grow into.", "One day. Together."] },
  { id: "positano_home", name: "Positano Lemon House", location: "Positano, Southern Italy", locationId: "italy_positano", type: "Coastal home", bedrooms: 2, description: "Sunlit Mediterranean rooms above the water. The balcony has already won.", price: 5500, width: 24, height: 16, theme: "positano", wallColor: 0xffe9b5, floorTint: 0xffefd2, requiresMarriage: true, tourLines: ["Lemon trees on the terrace, the sea right below.", "The balcony has already won."] },
  { id: "santorini_villa", name: "Santorini Blue-Door Villa", location: "Oia, Santorini", locationId: "greece_santorini", type: "Cliff villa", bedrooms: 3, description: "Whitewashed rooms, blue shadows and the kind of sunset that cancels other plans.", price: 7500, width: 27, height: 17, theme: "santorini", wallColor: 0xf5f4ec, floorTint: 0xe4f0f2, requiresMarriage: true, tourLines: ["White walls, a blue door, and a sunset that cancels every other plan.", "Imagine waking up here."] },
];

export const propertyById = (id: string) => PROPERTIES.find((property) => property.id === id) ?? PROPERTIES[0];

