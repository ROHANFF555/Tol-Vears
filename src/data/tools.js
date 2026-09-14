// Central registry of all tools. Adding a new tool = add an entry here + a route in App.jsx.
export const TOOLS = [
  {
    slug: 'image-compressor',
    name: 'Image Compressor',
    tagline: 'Shrink JPG, PNG & WebP files without uploading anything.',
    description:
      'Compress JPG, PNG, WebP, GIF and BMP images locally in your browser. Adjust quality with a live before/after size preview and download individually or as a ZIP.',
    category: 'Image',
    tags: ['image', 'photo', 'compress', 'compression', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'optimize', 'file size', 'zip'],
    icon: 'image',
    accent: 'from-sky-500 to-blue-600',
    howTo: [
      'Drag & drop images onto the box (or click it to browse) — multiple files are welcome.',
      'Move the quality slider (10–100%): every image re-compresses automatically so you can see the new file size instantly.',
      'Optionally pick an output format: keep the original, or force JPEG / WebP / PNG.',
      'Click Download next to an image, or Download all (.zip) to save everything at once.',
    ],
    privacy:
      'Your images are compressed on your device with the Canvas API. Nothing is ever uploaded to a server.',
  },
  {
    slug: 'pdf-merger',
    name: 'PDF Merger',
    tagline: 'Combine multiple PDFs into one, right in your browser.',
    description:
      'Merge PDF documents entirely in your browser. Reorder files by dragging, check per-file and total page counts, and download the combined PDF.',
    category: 'PDF',
    tags: ['pdf', 'merge', 'merger', 'combine', 'join', 'documents', 'pages', 'concat'],
    icon: 'fileText',
    accent: 'from-rose-500 to-red-600',
    howTo: [
      'Drag & drop your PDF files onto the box (or click to browse). Add as many as you like.',
      'Reorder the list by dragging rows, or use the ↑ / ↓ buttons — pages are merged top to bottom in list order.',
      'Check the page count of each file and the total page count shown above the list.',
      'Press Merge PDFs, then click Download merged PDF.',
    ],
    privacy:
      'PDFs are merged on your device with pdf-lib. Your documents never leave your browser.',
  },
  {
    slug: 'qr-code-generator',
    name: 'QR Code Generator',
    tagline: 'Turn any text or URL into a downloadable QR code.',
    description:
      'Generate QR codes from any text or URL, live as you type. Choose a size and download the PNG — no API calls, generated locally in your browser.',
    category: 'Generator',
    tags: ['qr', 'qr code', 'code', 'generator', 'url', 'link', 'barcode', 'scan'],
    icon: 'qr',
    accent: 'from-violet-500 to-purple-600',
    howTo: [
      'Type or paste any text or URL into the box — the QR code updates live as you type.',
      'Pick a download size: Small (256px), Medium (512px) or Large (1024px).',
      'Click Download PNG to save the QR code image.',
      'Tip: test the generated code with your phone camera before printing it.',
    ],
    privacy:
      'QR codes are rendered locally with the open-source qrcode library — no API calls, no tracking.',
  },
  {
    slug: 'password-generator',
    name: 'Password Generator',
    tagline: 'Create strong, random passwords with one click.',
    description:
      'Generate cryptographically secure passwords using your browser’s built-in random number generator. Pick length and character types, check the strength meter, and copy with one click.',
    category: 'Generator',
    tags: ['password', 'generator', 'secure', 'security', 'random', 'strong', 'safety', 'entropy'],
    icon: 'key',
    accent: 'from-emerald-500 to-teal-600',
    howTo: [
      'Choose the password length with the slider (4–64 characters).',
      'Tick the character types to include: uppercase, lowercase, numbers and symbols — at least one must be selected.',
      'The password regenerates automatically whenever you change a setting, or hit Generate for a fresh one.',
      'Click Copy to clipboard, then paste it into your password manager.',
    ],
    privacy:
      'Passwords are generated on your device with crypto.getRandomValues and are never stored or sent anywhere.',
  },
  {
    slug: 'unit-converter',
    name: 'Unit Converter',
    tagline: 'Convert length, weight & temperature instantly.',
    description:
      'Convert between metric and imperial units as you type: length (mm to miles), weight (mg to tons) and temperature (°C, °F, K). Includes a swap button and exact conversion rates.',
    category: 'Converter',
    tags: ['unit', 'units', 'converter', 'conversion', 'length', 'weight', 'temperature', 'metric', 'imperial', 'celsius', 'fahrenheit', 'kelvin', 'km', 'miles', 'kg', 'pounds'],
    icon: 'ruler',
    accent: 'from-amber-500 to-orange-600',
    howTo: [
      'Pick a category: Length, Weight or Temperature.',
      'Type a value and choose the units to convert from and to — the result updates live as you type.',
      'Use the swap button (⇅) to instantly reverse the conversion direction.',
      'The “1 unit = …” line below the result shows the exact conversion rate.',
    ],
    privacy: 'All conversions are calculated in your browser. Nothing is sent or stored.',
  },
];

export const CATEGORIES = ['All', ...new Set(TOOLS.map((t) => t.category))];

export function getTool(slug) {
  return TOOLS.find((t) => t.slug === slug);
}
