const regions = {
  'Metro Manila': [
    ['quezon-city', 'Quezon City', 14.650, 121.045], ['caloocan', 'Caloocan', 14.657, 120.986],
    ['las-pinas', 'Las Piñas', 14.450, 120.982], ['makati', 'Makati', 14.554, 121.024],
    ['malabon', 'Malabon', 14.662, 120.957], ['mandaluyong', 'Mandaluyong', 14.578, 121.040],
    ['manila', 'Manila', 14.600, 120.984], ['marikina', 'Marikina', 14.650, 121.110],
    ['muntinlupa', 'Muntinlupa', 14.408, 121.041], ['navotas', 'Navotas', 14.675, 120.933],
    ['paranaque', 'Parañaque', 14.487, 121.024], ['pasay', 'Pasay', 14.540, 121.003],
    ['pasig', 'Pasig', 14.574, 121.078], ['pateros', 'Pateros', 14.542, 121.069],
    ['san-juan', 'San Juan', 14.603, 121.033], ['taguig', 'Taguig', 14.513, 121.052],
    ['valenzuela', 'Valenzuela', 14.708, 120.979],
  ],
  Rizal: [
    ['cainta', 'Cainta', 14.578, 121.123], ['taytay', 'Taytay', 14.557, 121.132],
    ['antipolo', 'Antipolo', 14.613, 121.170], ['angono', 'Angono', 14.526, 121.153],
    ['san-mateo', 'San Mateo', 14.697, 121.121], ['rodriguez', 'Rodriguez', 14.731, 121.144],
    ['binangonan', 'Binangonan', 14.465, 121.192],
  ],
  Bulacan: [
    ['meycauayan', 'Meycauayan', 14.735, 120.960], ['marilao', 'Marilao', 14.758, 120.950],
    ['bocaue', 'Bocaue', 14.798, 120.926], ['san-jose-del-monte', 'San Jose del Monte', 14.814, 121.045],
  ],
  Cavite: [
    ['bacoor', 'Bacoor', 14.450, 120.955], ['imus', 'Imus', 14.430, 120.936],
    ['dasmarinas', 'Dasmariñas', 14.329, 120.936],
  ],
  Laguna: [
    ['san-pedro', 'San Pedro', 14.359, 121.057], ['binan', 'Biñan', 14.329, 121.077],
    ['santa-rosa', 'Santa Rosa', 14.314, 121.112],
  ],
};

export const buyerLocations = Object.entries(regions).flatMap(([province, places]) =>
  places.map(([id, city, latitude, longitude]) => ({
    id, city, province, latitude, longitude, label: province === 'Metro Manila' ? city : `${city}, ${province}`,
  })));

export const locationsById = new Map(buyerLocations.map(location => [location.id, location]));
export const metroManilaIds = buyerLocations.filter(location => location.province === 'Metro Manila').map(location => location.id);
export const buyerLocationKey = 'sulitstock-buyer-location';

export function fillLocationSelect(select) {
  const groups = Object.keys(regions).map(province => {
    const group = document.createElement('optgroup');
    group.label = province;
    for (const location of buyerLocations.filter(item => item.province === province)) {
      group.append(new Option(location.city, location.id));
    }
    return group;
  });
  select.replaceChildren(...groups);
}
