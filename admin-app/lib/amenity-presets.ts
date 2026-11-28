// Standard amenity checklists for the project form (Amenities tab). Ticking one adds it to the
// project's amenities with its category; the website groups amenities by that category.

export type AmenityPreset = { key: 'apartment' | 'villa' | 'plot'; label: string; groups: [string, string[]][] };

const list = (s: string) => s.split(',').map((t) => t.trim()).filter(Boolean);

export const AMENITY_PRESETS: AmenityPreset[] = [
  {
    key: 'apartment', label: 'Apartment',
    groups: [
      ['Clubhouse & Lifestyle', list('Grand Clubhouse, Multipurpose Hall, Banquet Hall, Party Lawn, Mini Theatre, Indoor Games Room, Library, Co-working Space, Guest Rooms, Café, Lounge, Community Hall')],
      ['Health & Wellness', list('Gymnasium, Yoga Deck, Meditation Zone, Aerobics Studio, Spa, Sauna, Steam Room, Zumba Studio')],
      ['Swimming & Recreation', list("Swimming Pool, Kids' Pool, Infinity Pool, Jacuzzi, Poolside Deck")],
      ['Sports', list('Cricket Practice Nets, Basketball Court, Badminton Court, Tennis Court, Squash Court, Volleyball Court, Table Tennis, Billiards, Football Court, Pickleball Court')],
      ['Outdoor & Green Spaces', list("Landscaped Gardens, Walking Track, Jogging Track, Cycling Track, Open-Air Theatre, Butterfly Garden, Central Park, Senior Citizens' Seating, Reflexology Path")],
      ["Children's Amenities", list("Children's Play Area, Indoor Play Area, Sand Pit, Daycare Centre, Kids' Activity Zone, Skating Rink")],
      ['Security', list('Gated Community, 24/7 Security, CCTV Surveillance, Video Door Phone, Biometric Access, Intercom Facility, Fire Safety System')],
      ['Utilities & Infrastructure', list('Power Backup, High-Speed Elevators, Service Lift, 24/7 Water Supply, Water Treatment Plant, Sewage Treatment Plant, Piped Gas, Wi-Fi Provision')],
      ['Parking & Convenience', list('Covered Car Parking, Basement Parking, Visitor Parking, EV Charging Station, Bicycle Parking, Convenience Store, Supermarket, ATM')],
      ['Eco-Friendly Amenities', list('Rainwater Harvesting, Solar Power, Solar Lighting, Waste Management, Organic Garden')],
      ['Premium Amenities', list('Rooftop Lounge, Sky Deck, Sky Garden, Skywalk, Rooftop Swimming Pool, Concierge Services, Pet Park, Barbecue Zone')],
    ],
  },
  {
    key: 'villa', label: 'Villa',
    groups: [
      ['Clubhouse & Lifestyle', list('Luxury Clubhouse, Multipurpose Hall, Banquet Hall, Mini Theatre, Indoor Games, Library, Community Lounge, Co-working Space, Guest Suites')],
      ['Private Villa Features', list('Private Garden, Private Swimming Pool, Private Terrace, Private Lift, Private Backyard, Balcony, Home Theatre, Servant Quarters, Private Car Parking')],
      ['Health & Wellness', list('Gymnasium, Yoga Pavilion, Meditation Centre, Spa, Sauna, Outdoor Fitness Zone')],
      ['Swimming & Recreation', list("Swimming Pool, Kids' Pool, Jacuzzi, Poolside Lounge")],
      ['Sports', list('Tennis Court, Basketball Court, Badminton Court, Cricket Practice Nets, Football Ground, Volleyball Court, Squash Court, Pickleball Court')],
      ['Outdoor & Landscaping', list('Landscaped Gardens, Avenue Plantation, Walking Track, Jogging Track, Cycling Track, Central Park, Open-Air Theatre, Party Lawn')],
      ['Children & Family', list("Children's Play Area, Adventure Play Zone, Daycare Centre, Skating Rink, Senior Citizens' Zone, Pet Park")],
      ['Security', list('Gated Community, 24/7 Security, CCTV Surveillance, Smart Access Control, Solar Fencing, Video Door Phone, Compound Wall')],
      ['Infrastructure', list('Underground Electricity, Underground Drainage, Underground Water Supply, Internal Roads, Street Lighting, Power Backup, Piped Gas')],
      ['Smart Home Features', list('Home Automation, Smart Lighting, Smart Door Lock, Video Surveillance Provision, Smart Temperature Control')],
      ['Eco-Friendly Amenities', list('Rainwater Harvesting, Solar Power, Sewage Treatment Plant, Water Treatment Plant, Organic Farming, Waste Management')],
      ['Premium Amenities', list('Barbecue Pavilion, Water Features, Golf Putting Area, EV Charging Station, Concierge Services, Rooftop Lounge')],
    ],
  },
  {
    key: 'plot', label: 'Plot',
    groups: [
      ['Entrance & Security', list('Grand Entrance Arch, Gated Community, 24/7 Security, CCTV Surveillance, Compound Wall, Security Cabin')],
      ['Road Infrastructure', list('Blacktop Roads, CC Roads, Wide Internal Roads, Footpaths, Roadside Kerbing, Avenue Plantation')],
      ['Electrical Infrastructure', list('Underground Electricity, Electrical Connections, Street Lighting, Solar Street Lighting, Transformer')],
      ['Water Facilities', list('Water Supply Provision, Overhead Water Tank, Underground Water Pipelines, Borewell, Rainwater Harvesting')],
      ['Drainage Facilities', list('Underground Drainage, Stormwater Drainage, Sewage System')],
      ['Landscaping', list('Landscaped Gardens, Central Park, Open Green Spaces, Avenue Plantation, Water Features, Themed Gardens')],
      ['Sports & Recreation', list('Cricket Ground, Basketball Court, Volleyball Court, Badminton Court, Tennis Court, Outdoor Gym, Jogging Track, Cycling Track')],
      ['Clubhouse Facilities', list('Clubhouse, Swimming Pool, Gymnasium, Indoor Games, Multipurpose Hall, Community Centre')],
      ['Family Amenities', list("Children's Play Area, Senior Citizens' Seating, Picnic Area, Meditation Zone, Yoga Deck, Pet Park")],
      ['Plot Development Features', list('Clearly Demarcated Plots, Plot Boundary Stones, Developed Layout, Utility Connections Provision, Entrance Gate')],
      ['Premium Amenities', list('Resort-Style Clubhouse, Organic Farming, Fruit Garden, Camping Zone, Amphitheatre, Party Lawn, Barbecue Area')],
    ],
  },
];

/** Which checklist suits a project's property type (Villa → villa, Plot → plot, everything else → apartment). */
export function presetFor(propertyType: unknown): AmenityPreset['key'] {
  const t = String(propertyType || '').toLowerCase();
  return /villa|house|townhouse/.test(t) ? 'villa' : /plot|land/.test(t) ? 'plot' : 'apartment';
}
