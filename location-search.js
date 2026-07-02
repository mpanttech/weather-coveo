/**
 * <uk-location-search> — autocomplete search box for UK places, backed by the
 * Open-Meteo geocoding API (free, no key). Results are filtered to the United
 * Kingdom (country_code GB). Selecting a place updates the <uk-rain-widget>
 * referenced by the `for` attribute (a CSS selector) and also dispatches a
 * bubbling `location-selected` event with {name, admin, latitude, longitude}.
 *
 * Supports mouse and keyboard (Up/Down to navigate, Enter to select, Escape
 * to close).
 */
class UkLocationSearch extends HTMLElement {
  #abort = null;
  #timer = null;
  #results = [];
  #active = -1;

  connectedCallback() {
    this.innerHTML = `
      <div class="loc-box">
        <input
          class="loc-input"
          type="text"
          role="combobox"
          aria-expanded="false"
          aria-autocomplete="list"
          aria-label="Search for a UK town or city"
          placeholder="${this.getAttribute('placeholder') ?? 'Search any UK town or city…'}"
          autocomplete="off"
          spellcheck="false"
        />
        <ul class="loc-list" role="listbox" hidden></ul>
        <span class="loc-status" role="status" aria-live="polite"></span>
      </div>`;

    this.input = this.querySelector('.loc-input');
    this.list = this.querySelector('.loc-list');
    this.status = this.querySelector('.loc-status');

    this.input.addEventListener('input', () => this.onInput());
    this.input.addEventListener('keydown', (e) => this.onKeydown(e));
    this.input.addEventListener('blur', () => setTimeout(() => this.close(), 150));
    // preventDefault on mousedown keeps the input from blurring (which would
    // close the list) before the click lands on the option.
    this.list.addEventListener('mousedown', (e) => e.preventDefault());
    this.list.addEventListener('click', (e) => {
      const li = e.target.closest('[data-index]');
      if (li) this.select(Number(li.dataset.index));
    });
  }

  onInput() {
    clearTimeout(this.#timer);
    const query = this.input.value.trim();
    if (query.length < 2) {
      this.close();
      return;
    }
    this.#timer = setTimeout(() => this.search(query), 250);
  }

  async search(query) {
    this.#abort?.abort();
    this.#abort = new AbortController();
    const url =
      'https://geocoding-api.open-meteo.com/v1/search?' +
      new URLSearchParams({ name: query, count: '20', language: 'en', format: 'json' });
    try {
      const res = await fetch(url, { signal: this.#abort.signal });
      if (!res.ok) throw new Error(`geocoding HTTP ${res.status}`);
      const data = await res.json();
      // The geocoding API has no country filter parameter, so filter client-side.
      this.#results = (data.results ?? [])
        .filter((r) => r.country_code === 'GB')
        .slice(0, 8);
      this.open();
    } catch (err) {
      if (err.name === 'AbortError') return;
      this.#results = [];
      this.open(`Search failed: ${err.message}`);
    }
  }

  open(errorMessage) {
    this.#active = -1;
    if (errorMessage) {
      this.list.innerHTML = `<li class="loc-empty">${errorMessage}</li>`;
    } else if (this.#results.length === 0) {
      this.list.innerHTML = `<li class="loc-empty">No UK places found</li>`;
    } else {
      this.list.innerHTML = this.#results
        .map(
          (r, i) => `
        <li role="option" data-index="${i}" id="loc-opt-${i}">
          <span class="loc-name">${r.name}</span>
          <span class="loc-admin">${this.adminLabel(r)}</span>
        </li>`
        )
        .join('');
    }
    this.list.hidden = false;
    this.input.setAttribute('aria-expanded', 'true');
    this.status.textContent = errorMessage
      ? ''
      : `${this.#results.length} UK location${this.#results.length === 1 ? '' : 's'} found`;
  }

  close() {
    this.list.hidden = true;
    this.input.setAttribute('aria-expanded', 'false');
    this.input.removeAttribute('aria-activedescendant');
    this.#active = -1;
  }

  onKeydown(e) {
    if (this.list.hidden && e.key === 'ArrowDown' && this.#results.length) {
      this.open();
      return;
    }
    if (this.list.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      const count = this.#results.length;
      if (!count) return;
      this.#active = (this.#active + delta + count) % count;
      this.highlight();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.#active >= 0) this.select(this.#active);
      else if (this.#results.length) this.select(0);
    } else if (e.key === 'Escape') {
      this.close();
    }
  }

  highlight() {
    this.list.querySelectorAll('[data-index]').forEach((li) => {
      const on = Number(li.dataset.index) === this.#active;
      li.classList.toggle('loc-active', on);
      if (on) {
        li.scrollIntoView({ block: 'nearest' });
        this.input.setAttribute('aria-activedescendant', li.id);
      }
    });
  }

  select(index) {
    const r = this.#results[index];
    if (!r) return;
    const admin = this.adminLabel(r);
    const place = admin ? `${r.name}, ${admin}, UK` : `${r.name}, UK`;
    this.input.value = `${r.name}${admin ? ', ' + admin : ''}`;
    this.close();

    const target = document.querySelector(this.getAttribute('for') ?? 'uk-rain-widget');
    if (target) {
      target.setAttribute('latitude', r.latitude);
      target.setAttribute('longitude', r.longitude);
      target.setAttribute('place', place);
    }

    this.dispatchEvent(
      new CustomEvent('location-selected', {
        bubbles: true,
        detail: { name: r.name, admin, latitude: r.latitude, longitude: r.longitude },
      })
    );
  }

  adminLabel(r) {
    // e.g. "Crawley, West Sussex, England" -> "West Sussex, England"
    return [r.admin2, r.admin1].filter(Boolean).join(', ');
  }
}

customElements.define('uk-location-search', UkLocationSearch);
