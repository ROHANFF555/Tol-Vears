// Unit conversion data + logic — pure functions, shared by the UI and scripts/smoke.mjs.

export const CONVERSION_CATEGORIES = {
  length: {
    label: 'Length',
    defaults: { from: 'm', to: 'ft' },
    units: {
      mm: { label: 'Millimeter (mm)', factor: 0.001 },
      cm: { label: 'Centimeter (cm)', factor: 0.01 },
      m: { label: 'Meter (m)', factor: 1 },
      km: { label: 'Kilometer (km)', factor: 1000 },
      in: { label: 'Inch (in)', factor: 0.0254 },
      ft: { label: 'Foot (ft)', factor: 0.3048 },
      yd: { label: 'Yard (yd)', factor: 0.9144 },
      mi: { label: 'Mile (mi)', factor: 1609.344 },
    },
  },
  weight: {
    label: 'Weight',
    defaults: { from: 'kg', to: 'lb' },
    units: {
      mg: { label: 'Milligram (mg)', factor: 0.000001 },
      g: { label: 'Gram (g)', factor: 0.001 },
      kg: { label: 'Kilogram (kg)', factor: 1 },
      t: { label: 'Metric ton (t)', factor: 1000 },
      oz: { label: 'Ounce (oz)', factor: 0.028349523125 },
      lb: { label: 'Pound (lb)', factor: 0.45359237 },
      st: { label: 'Stone (st)', factor: 6.35029318 },
    },
  },
  temperature: {
    label: 'Temperature',
    defaults: { from: 'c', to: 'f' },
    units: {
      c: { label: 'Celsius (°C)' },
      f: { label: 'Fahrenheit (°F)' },
      k: { label: 'Kelvin (K)' },
    },
  },
};

const TO_CELSIUS = {
  c: (v) => v,
  f: (v) => ((v - 32) * 5) / 9,
  k: (v) => v - 273.15,
};

const FROM_CELSIUS = {
  c: (v) => v,
  f: (v) => (v * 9) / 5 + 32,
  k: (v) => v + 273.15,
};

export function convertValue(category, from, to, value) {
  if (category === 'temperature') {
    return FROM_CELSIUS[to](TO_CELSIUS[from](value));
  }
  const units = CONVERSION_CATEGORIES[category].units;
  return (value * units[from].factor) / units[to].factor;
}
