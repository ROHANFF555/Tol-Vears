import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Privacy from './pages/Privacy.jsx';
import Terms from './pages/Terms.jsx';
import About from './pages/About.jsx';
import Contact from './pages/Contact.jsx';
import Icon from './components/Icons.jsx';

// Code-split every tool page: heavy libraries (pdf-lib, jszip, qrcode) only load
// when their tool is actually visited.
const ImageCompressor = lazy(() => import('./pages/tools/ImageCompressor.jsx'));
const PdfMerger = lazy(() => import('./pages/tools/PdfMerger.jsx'));
const QrGenerator = lazy(() => import('./pages/tools/QrGenerator.jsx'));
const PasswordGenerator = lazy(() => import('./pages/tools/PasswordGenerator.jsx'));
const UnitConverter = lazy(() => import('./pages/tools/UnitConverter.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

function PageLoader() {
  return (
    <div className="py-24 text-center text-slate-400" role="status" aria-label="Loading page">
      <Icon name="loader" className="w-8 h-8 animate-spin mx-auto" />
    </div>
  );
}

export default function App() {
  return (
    <Layout>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/tools/image-compressor" element={<ImageCompressor />} />
          <Route path="/tools/pdf-merger" element={<PdfMerger />} />
          <Route path="/tools/qr-code-generator" element={<QrGenerator />} />
          <Route path="/tools/password-generator" element={<PasswordGenerator />} />
          <Route path="/tools/unit-converter" element={<UnitConverter />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
