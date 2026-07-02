/**
 * <uk-rain-widget> — custom element that calls the Open-Meteo forecast API
 * and renders rain predictions for the location given by its latitude /
 * longitude / place attributes. Re-fetches whenever those attributes change.
 * Lives inside the Coveo Atomic layout and reuses Atomic's CSS custom
 * properties (--atomic-*) so it matches the theme.
 */
class UkRainWidget extends HTMLElement {
  static observedAttributes = ['latitude', 'longitude', 'place'];

  connectedCallback() {
    this.render(`<div class="wx-loading">Loading rain forecast…</div>`);
    this.load();
  }

  attributeChangedCallback() {
    // Fires once per attribute before connection; only reload when live in the DOM.
    if (this.isConnected && !this.#batching) {
      this.#batching = true;
      queueMicrotask(() => {
        this.#batching = false;
        this.connectedCallback();
      });
    }
  }

  #batching = false;

  get apiUrl() {
    const lat = this.getAttribute('latitude');
    const lon = this.getAttribute('longitude');
    const params = new URLSearchParams({
      latitude: lat,
      longitude: lon,
      timezone: 'Europe/London',
      forecast_days: '7',
      hourly: 'precipitation_probability,precipitation',
      daily: 'precipitation_probability_max,precipitation_sum,weathercode',
      current: 'precipitation,weathercode',
    });
    return `https://api.open-meteo.com/v1/forecast?${params}`;
  }

  async load() {
    this.#abort?.abort();
    this.#abort = new AbortController();
    try {
      const res = await fetch(this.apiUrl, { signal: this.#abort.signal });
      if (!res.ok) throw new Error(`Open-Meteo returned HTTP ${res.status}`);
      const data = await res.json();
      this.render(this.template(data));
    } catch (err) {
      if (err.name === 'AbortError') return;
      this.render(
        `<div class="wx-error">Could not load the forecast: ${err.message}
         <button class="wx-retry">Retry</button></div>`
      );
      this.querySelector('.wx-retry')?.addEventListener('click', () => {
        this.connectedCallback();
      });
    }
  }

  #abort = null;

  template(data) {
    const place = this.getAttribute('place') ?? 'United Kingdom';
    const hours = this.nextHours(data.hourly, 12);
    const days = this.dailyRows(data.daily);
    const today = days[0];

    return `
      <section class="wx-card" aria-label="Rain prediction for ${place}">
        <header class="wx-head">
          <div>
            <h2>${place}</h2>
            <span class="wx-sub">7-day rain prediction · Open-Meteo</span>
          </div>
          <div class="wx-today">
            <span class="wx-big">${today.prob}%</span>
            <span class="wx-sub">chance of rain today · ${today.sum} mm expected</span>
          </div>
        </header>

        <h3>Next 12 hours — chance of rain</h3>
        <div class="wx-hours" role="list">
          ${hours
            .map(
              (h) => `
            <div class="wx-hour" role="listitem" title="${h.prob}% · ${h.mm} mm">
              <span class="wx-hour-prob">${h.prob}%</span>
              <div class="wx-bar-track"><div class="wx-bar" style="height:${Math.max(h.prob, 3)}%"></div></div>
              <span class="wx-hour-label">${h.label}</span>
            </div>`
            )
            .join('')}
        </div>

        <h3>Daily outlook</h3>
        <table class="wx-days">
          <thead>
            <tr><th>Day</th><th>Rain chance</th><th>Precipitation</th><th></th></tr>
          </thead>
          <tbody>
            ${days
              .map(
                (d) => `
              <tr>
                <td>${d.label}</td>
                <td><strong>${d.prob}%</strong></td>
                <td>${d.sum} mm</td>
                <td>${d.icon} ${d.desc}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </section>`;
  }

  nextHours(hourly, count) {
    const now = new Date();
    const start = hourly.time.findIndex((t) => new Date(t) >= now);
    const from = start === -1 ? 0 : start;
    return hourly.time.slice(from, from + count).map((t, i) => ({
      label: new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit' }) + 'h',
      prob: hourly.precipitation_probability[from + i] ?? 0,
      mm: hourly.precipitation[from + i] ?? 0,
    }));
  }

  dailyRows(daily) {
    return daily.time.map((t, i) => {
      const date = new Date(t);
      const { icon, desc } = this.describe(daily.weathercode[i]);
      return {
        label:
          i === 0
            ? 'Today'
            : date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
        prob: daily.precipitation_probability_max[i] ?? 0,
        sum: (daily.precipitation_sum[i] ?? 0).toFixed(1),
        icon,
        desc,
      };
    });
  }

  describe(code) {
    if (code === 0) return { icon: '☀️', desc: 'Clear' };
    if (code <= 2) return { icon: '🌤️', desc: 'Partly cloudy' };
    if (code === 3) return { icon: '☁️', desc: 'Overcast' };
    if (code <= 48) return { icon: '🌫️', desc: 'Fog' };
    if (code <= 57) return { icon: '🌦️', desc: 'Drizzle' };
    if (code <= 67) return { icon: '🌧️', desc: 'Rain' };
    if (code <= 77) return { icon: '🌨️', desc: 'Snow' };
    if (code <= 82) return { icon: '🌧️', desc: 'Showers' };
    if (code <= 86) return { icon: '🌨️', desc: 'Snow showers' };
    return { icon: '⛈️', desc: 'Thunderstorm' };
  }

  render(html) {
    this.innerHTML = html;
  }
}

customElements.define('uk-rain-widget', UkRainWidget);
