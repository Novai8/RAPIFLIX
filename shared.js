/* Small browser-safe helpers shared by the catalogue and route shell. */
(() => {
  'use strict';

  function stripAccents(value) {
    return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  }

  function slugify(value) {
    return stripAccents(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'title';
  }

  function recordName(record) {
    return record && (record.name || record.title || record.original_title || record.original_name) || 'title';
  }

  // A title slug is stable for one record. If the catalogue contains two records
  // with the same name, the year disambiguates it; an id is the final tie-breaker.
  function slugForRecord(record, records = []) {
    const base = slugify(recordName(record));
    const peers = records.filter(candidate => candidate && slugify(recordName(candidate)) === base);
    if (peers.length < 2) return base;

    const year = Number(record.year || record.releaseYear || String(record.release_date || record.first_air_date || '').slice(0, 4));
    const sameYear = year > 0 && peers.filter(candidate => {
      const candidateYear = Number(candidate.year || candidate.releaseYear || String(candidate.release_date || candidate.first_air_date || '').slice(0, 4));
      return candidateYear === year;
    });
    if (sameYear.length <= 1 && year > 0) return `${base}-${year}`;

    const id = String(record.id || record.tmdbId || '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
    return id ? `${base}-${year > 0 ? year + '-' : ''}${id}` : `${base}-${year > 0 ? year : 'title'}`;
  }

  function hslToRgb(hue, saturation, lightness) {
    const h = ((Number(hue) || 0) % 360 + 360) % 360;
    const s = Math.max(0, Math.min(100, Number(saturation))) / 100;
    const l = Math.max(0, Math.min(100, Number(lightness))) / 100;
    const a = s * Math.min(l, 1 - l);
    const f = n => {
      const k = (n + h / 30) % 12;
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [f(0), f(8), f(4)].map(value => Math.round(value * 255));
  }

  function rgbToHex(rgb) {
    return '#' + rgb.map(value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  function relativeLuminance(rgb) {
    const channels = rgb.map(value => {
      const channel = Math.max(0, Math.min(255, Number(value))) / 255;
      return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function buttonTextColor(buttonRgb) {
    const k = relativeLuminance(buttonRgb);
    const preferred = 1.05 / (k + 0.05) > (k + 0.05) / 0.055 ? '#FFFFFF' : '#0B0C12';
    // The prototype's threshold chooses the intended polarity. Verify the
    // actual 11/12/18 button text too, then take the other polarity if a
    // rounded edge hue would otherwise fall below WCAG AA.
    const whiteContrast = (Math.max(k, 1) + 0.05) / (Math.min(k, 1) + 0.05);
    const black = relativeLuminance([11, 12, 18]);
    const blackContrast = (Math.max(k, black) + 0.05) / (Math.min(k, black) + 0.05);
    if (preferred === '#FFFFFF' && whiteContrast >= 4.5) return preferred;
    if (preferred === '#0B0C12' && blackContrast >= 4.5) return preferred;
    return whiteContrast >= blackContrast ? '#FFFFFF' : '#0B0C12';
  }

  function accessibleButtonRgb(hue, theme = 'dark') {
    const saturation = theme === 'light' ? 88 : 92;
    const baseLightness = theme === 'light' ? 46 : 62;
    for (let step = 0; step <= 24; step += 1) {
      const rgb = hslToRgb(hue, saturation, baseLightness - step * 0.5);
      const text = buttonTextColor(rgb);
      const textRgb = text === '#FFFFFF' ? [255, 255, 255] : [11, 12, 18];
      const ratio = (Math.max(relativeLuminance(rgb), relativeLuminance(textRgb)) + 0.05) / (Math.min(relativeLuminance(rgb), relativeLuminance(textRgb)) + 0.05);
      if (ratio >= 4.5) return rgb;
    }
    return hslToRgb(hue, saturation, Math.max(30, baseLightness - 12));
  }

  function formatMoney(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return 'Not reported';
    const units = [['B', 1e9], ['M', 1e6], ['K', 1e3]];
    const unit = units.find(([, size]) => amount >= size);
    if (!unit) return '$' + Math.round(amount).toLocaleString('en-US');
    const [label, size] = unit;
    const rounded = amount / size;
    const digits = rounded >= 100 ? 0 : rounded >= 10 ? 1 : 2;
    return '$' + rounded.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1') + label;
  }

  window.RapiflixShared = Object.freeze({
    slugify,
    slugForRecord,
    recordName,
    hslToRgb,
    rgbToHex,
    relativeLuminance,
    buttonTextColor,
    accessibleButtonRgb,
    formatMoney
  });
})();
