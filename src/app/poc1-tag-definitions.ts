export interface FixedTagDef {
  name: string;
  options: string[];
}

export interface FreeTextTagDef {
  name: string;
}

export const FIXED_TAG_DEFS: FixedTagDef[] = [
  {
    name: 'Setting',
    options: ['Indoor', 'Outdoor'],
  },
  {
    name: 'Country',
    options: [
      'AFGHANISTAN', 'ALBANIA', 'ALGERIA', 'ANDORRA', 'ANGOLA',
      'ANTIGUA_AND_BARBUDA', 'ARGENTINA', 'ARMENIA', 'AUSTRALIA', 'AUSTRIA',
      'AZERBAIJAN', 'BAHAMAS', 'BAHRAIN', 'BANGLADESH', 'BARBADOS',
      'BELARUS', 'BELGIUM', 'BELIZE', 'BENIN', 'BHUTAN',
      'BOLIVIA', 'BOSNIA_AND_HERZEGOVINA', 'BOTSWANA', 'BRAZIL', 'BRUNEI',
      'BULGARIA', 'BURKINA_FASO', 'BURUNDI', 'CABO_VERDE', 'CAMBODIA',
      'CAMEROON', 'CANADA', 'CENTRAL_AFRICAN_REPUBLIC', 'CHAD', 'CHILE',
      'CHINA', 'COLOMBIA', 'COMOROS', 'CONGO', 'COSTA_RICA',
      'CROATIA', 'CUBA', 'CYPRUS', 'CZECHIA', 'DEMOCRATIC_REPUBLIC_OF_CONGO',
      'DENMARK', 'DJIBOUTI', 'DOMINICA', 'DOMINICAN_REPUBLIC', 'ECUADOR',
      'EGYPT', 'EL_SALVADOR', 'EQUATORIAL_GUINEA', 'ERITREA', 'ESTONIA',
      'ESWATINI', 'ETHIOPIA', 'FIJI', 'FINLAND', 'FRANCE',
      'GABON', 'GAMBIA', 'GEORGIA', 'GERMANY', 'GHANA',
      'GREECE', 'GRENADA', 'GUATEMALA', 'GUINEA', 'GUINEA_BISSAU',
      'GUYANA', 'HAITI', 'HOLY_SEE', 'HONDURAS', 'HUNGARY',
      'ICELAND', 'INDIA', 'INDONESIA', 'IRAN', 'IRAQ',
      'IRELAND', 'ISRAEL', 'ITALY', 'JAMAICA', 'JAPAN',
      'JORDAN', 'KAZAKHSTAN', 'KENYA', 'KIRIBATI', 'KUWAIT',
      'KYRGYZSTAN', 'LAOS', 'LATVIA', 'LEBANON', 'LESOTHO',
      'LIBERIA', 'LIBYA', 'LIECHTENSTEIN', 'LITHUANIA', 'LUXEMBOURG',
      'MADAGASCAR', 'MALAWI', 'MALAYSIA', 'MALDIVES', 'MALI',
      'MALTA', 'MARSHALL_ISLANDS', 'MAURITANIA', 'MAURITIUS', 'MEXICO',
      'MICRONESIA', 'MOLDOVA', 'MONACO', 'MONGOLIA', 'MONTENEGRO',
      'MOROCCO', 'MOZAMBIQUE', 'MYANMAR', 'NAMIBIA', 'NAURU',
      'NEPAL', 'NETHERLANDS', 'NEW_ZEALAND', 'NICARAGUA', 'NIGER',
      'NIGERIA', 'NORTH_KOREA', 'NORTH_MACEDONIA', 'NORWAY', 'OMAN',
      'PAKISTAN', 'PALAU', 'PALESTINE', 'PANAMA', 'PAPUA_NEW_GUINEA',
      'PARAGUAY', 'PERU', 'PHILIPPINES', 'POLAND', 'PORTUGAL',
      'QATAR', 'ROMANIA', 'RUSSIA', 'RWANDA', 'SAINT_KITTS_AND_NEVIS',
      'SAINT_LUCIA', 'SAINT_VINCENT_AND_THE_GRENADINES', 'SAMOA', 'SAN_MARINO', 'SAO_TOME_AND_PRINCIPE',
      'SAUDI_ARABIA', 'SENEGAL', 'SERBIA', 'SEYCHELLES', 'SIERRA_LEONE',
      'SINGAPORE', 'SLOVAKIA', 'SLOVENIA', 'SOLOMON_ISLANDS', 'SOMALIA',
      'SOUTH_AFRICA', 'SOUTH_KOREA', 'SOUTH_SUDAN', 'SPAIN', 'SRI_LANKA',
      'SUDAN', 'SURINAME', 'SWEDEN', 'SWITZERLAND', 'SYRIA',
      'TAJIKISTAN', 'TANZANIA', 'THAILAND', 'TIMOR_LESTE', 'TOGO',
      'TONGA', 'TRINIDAD_AND_TOBAGO', 'TUNISIA', 'TURKEY', 'TURKMENISTAN',
      'TUVALU', 'UGANDA', 'UKRAINE', 'UNITED_ARAB_EMIRATES', 'UNITED_KINGDOM',
      'UNITED_STATES', 'URUGUAY', 'UZBEKISTAN', 'VANUATU', 'VENEZUELA',
      'VIETNAM', 'YEMEN', 'ZAMBIA', 'ZIMBABWE', 'NULL',
    ],
  },
  {
    name: 'TimeOfDay',
    options: ['Sunrise', 'Daytime', 'Sunset', 'Dusk', 'Night', 'Null'],
  },
  {
    name: 'Lighting',
    options: ['Natural', 'Studio', 'Mixed', 'Null'],
  },
  {
    name: 'ShotType',
    options: ['Wide', 'Full_Body', 'Medium', 'Close_Up', 'Macro', 'Over_the_Shoulder', 'POV', 'Aerial', 'Null'],
  },
  {
    name: 'DepthOfField',
    options: ['Shallow', 'Medium', 'Deep', 'Null'],
  },
  {
    name: 'Weather',
    options: ['Sunny', 'Blue_Sky', 'Cloudy', 'Overcast', 'Rainy', 'Snowy', 'Foggy', 'Null'],
  },
  {
    name: 'People',
    options: ['Solo_Visitor', 'Couple', 'Duo', 'Family', 'Small_Group', 'Crowd', 'Queue', 'Null'],
  },
  {
    name: 'Guide',
    options: ['Yes', 'No', 'Unclear'],
  },
  {
    name: 'PeopleActivity',
    options: [
      'Observing', 'Climbing', 'Ascending', 'Descending', 'Swimming', 'Floating',
      'Snorkeling', 'Diving', 'Rowing', 'Sailing', 'Speedboat_Riding', 'Cycling',
      'Mountain_Biking', 'Horse_Riding', 'ATV Riding', 'Go-Karting', 'Snowmobiling',
      'Ziplining', 'Paragliding', 'Sky_Diving', 'Hiking', 'Trekking', 'Rock Climbing',
      'Cooking', 'Wine Tasting', 'Crafting', 'Dancing', 'Yoga', 'Meditation',
      'Performing', 'Spectating_Show', 'Eating', 'Drinking', 'Riding', 'Null',
    ],
  },
  {
    name: 'Clothing',
    options: ['Casual', 'Formal', 'Summer', 'Winter', 'Sportswear', 'Outdoor_Gear', 'Swimwear', 'Traditional', 'Uniform', 'Costume', 'Safety_Gear', 'Null'],
  },
  {
    name: 'Objects',
    options: ['Wheelchair', 'Headphones', 'Audio_Device', 'Phone', 'Laptop', 'Camera', 'Null'],
  },
  {
    name: 'Transport',
    options: [
      'Car', 'Bus', 'Van', 'Bicycle', 'Motorcycle', 'Scooter', 'Train', 'Tram',
      'Metro', 'Funicular', 'Segway', 'Tuk_Tuk', 'Horse_Carriage', 'Gondola',
      'Traghetto', 'Ferry', 'Yacht', 'Cruise_Ship', 'Speedboat', 'Catamaran',
      'Kayak', 'Canoe', 'SUP', 'Raft', 'Jet_Ski', 'RIB', 'Submarine',
      'Cable_Car', 'Helicopter', 'Hot_Air_Balloon', 'Plane', 'Zipline', 'Null',
    ],
  },
  {
    name: 'OperatorBrand',
    options: [
      'Big_Bus', 'City_Sightseeing', 'Tootbus', 'Golden_Tours', 'Gray_Line',
      'TopView', 'City_Tour_Worldwide', 'Turistik', 'Vienna_Sightseeing',
      'CitySightseeing_Budapest', 'City_Tour', 'City_Circle', 'Stadtrundfahrten',
      'Le_Grand_Tour', 'Colorbus', 'Open_Tour', 'Hop_On_Hop_Off', 'Sights_of_Athens',
      'Frankfurt_Sightseeing', 'Red_Sightseeing', 'DoDublin', 'Bright_Bus_City_Tours',
      'Turibus', 'FunVee', 'Yellow_Balloon_City_Bus', 'HopTour', 'Die_Roten_Doppeldecker',
      'Lisbon_Sightseeing', 'I_Love_Rome', 'Ducktours', 'Hippo_Tours', 'Open_Bus',
      'City_Sights', 'Red_Bus', 'Aerobus', 'Flibco', 'RegioJet', 'ATVO', 'AlpyBus',
      'Terravision', 'Shuttle_Direct', 'SkyBus', 'National_Express', 'SIT_Bus_Shuttle',
      'Autostradale', 'Lufthansa_Express_Bus', 'Dublin_Express', 'Newark_Airport_Express',
      'The_Airline', 'Airport_Limousine_Bus', 'GreenLine_Transfers', 'Arlanda_Express',
      'Flytoget', 'Gardermoen_Express', 'Heathrow_Express', 'Gatwick_Express',
      'Stansted_Express', 'Leonardo_Express', 'KLIA_Ekspres', 'KLIA_Transit',
      'Narita_Express', 'Airport_Express_Hong_Kong', 'Pisamover', 'Eurostar',
      'Trenitalia', 'Italo', 'Frecciarossa', 'Malpensa_Express', 'Bernina_Express',
      'Glacier_Express', 'GoldenPass', 'Gornergrat_Railway', 'Sagano_Romantic_Train',
      'Brightline', 'Campania_Express', 'Trenord', 'Rocky_Mountaineer',
      'West_Coast_Railway', 'Grand_Canyon_Railway', 'JR_East', 'JR_Central', 'JR_West',
    ],
  },
  {
    name: 'travelCardBrandName',
    options: [
      'Headout', 'Turbopass', 'Go_City', 'London_Pass', 'Stockholm_Pass',
      'Prague_CoolPass', 'Vienna_Pass', 'Roma_Pass', 'Omnia_Card',
      'Paris_Museum_Pass', 'Barcelona_Card', 'Berlin_WelcomeCard', 'Lisboa_Card',
      'Oslo_Pass', 'Copenhagen_Card', 'IAmsterdam_City_Card', 'Dubai_Pass',
      'Explorer_Pass', 'All_Inclusive_Pass', 'Go_Explorer_Pass', 'Sightseeing_Pass',
      'New_York_Pass', 'New_York_CityPASS', 'San_Francisco_CityPASS',
      'Seattle_CityPASS', 'Chicago_CityPASS', 'Toronto_CityPASS', 'Go_O_Card',
      'Smart_Destination_Pass', 'iVenture_Card', 'Go_Dubai_Pass',
      'Singapore_Tourist_Pass', 'Hong_Kong_Tourist_Pass', 'Japan_Rail_Pass',
      'Swiss_Travel_Pass', 'Eurail_Pass', 'Interrail_Pass',
    ],
  },
  {
    name: 'TransportAttribute',
    options: ['Luxury', 'Standard', 'Double-decker', 'Twin-hull', 'Single-hull', 'Null'],
  },
  {
    name: 'Design',
    options: [
      'Combo_Split', 'Meeting Point', 'Promo_Banner', 'Show_Poster', 'Menu',
      'Travel_Card', 'Exhibition_Pamphlet', 'Generic_Design', 'AI_Generated', 'Null',
    ],
  },
];

export const FREE_TEXT_TAG_DEFS: FreeTextTagDef[] = [
  { name: 'PoiName' },
  { name: 'Environment' },
  { name: 'City' },
  { name: 'Food' },
  { name: 'Drinks' },
  { name: 'Wildlife' },
  { name: 'Artwork' },
  { name: 'Artist' },
];
