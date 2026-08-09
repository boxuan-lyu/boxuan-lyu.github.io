const menuButton = document.querySelector(".menu-button");
const siteNav = document.querySelector(".site-nav");

menuButton?.addEventListener("click", () => {
  const isOpen = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!isOpen));
  siteNav?.classList.toggle("open", !isOpen);
});

siteNav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    menuButton?.setAttribute("aria-expanded", "false");
    siteNav.classList.remove("open");
  });
});

document.querySelectorAll(".email-link").forEach((link) => {
  const user = link.dataset.user;
  const domain = link.dataset.domain;
  if (user && domain) {
    link.href = `mailto:${user}@${domain}`;
  }
});

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 }
);

document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));

const navLinks = [...document.querySelectorAll(".site-nav a")];
const sections = navLinks
  .map((link) => document.querySelector(link.getAttribute("href")))
  .filter(Boolean);

const sectionObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      navLinks.forEach((link) => {
        link.classList.toggle("active", link.getAttribute("href") === `#${entry.target.id}`);
      });
    });
  },
  { rootMargin: "-25% 0px -65%", threshold: 0 }
);

sections.forEach((section) => sectionObserver.observe(section));

const year = document.querySelector("#year");
if (year) year.textContent = String(new Date().getFullYear());

const visitorSection = document.querySelector("[data-visitor-report]")?.closest(".visitors-section");

if (visitorSection) {
  const report = visitorSection.querySelector("[data-visitor-report]");
  const mapContainer = visitorSection.querySelector("[data-visitor-map]");
  const tooltip = visitorSection.querySelector("[data-visitor-tooltip]");
  const periodSelect = visitorSection.querySelector("#visitor-period");
  const rangeButtons = [...visitorSection.querySelectorAll("[data-visitor-range]")];
  const totalElement = visitorSection.querySelector("[data-visitor-total]");
  const countriesElement = visitorSection.querySelector("[data-visitor-countries]");
  const periodLabelElement = visitorSection.querySelector("[data-visitor-period-label]");
  const updatedElement = visitorSection.querySelector("[data-visitor-updated]");
  const rankingElement = visitorSection.querySelector("[data-visitor-ranking]");
  const statusElement = visitorSection.querySelector("[data-visitor-status]");
  const endpoint = visitorSection.dataset.statsEndpoint?.trim();
  const trackingStart = visitorSection.dataset.trackingStart || "2026-08-09";
  const numberFormat = new Intl.NumberFormat("en");
  const countryNames = typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;
  const visitorCache = new Map();
  const isDemo = new URLSearchParams(window.location.search).has("visitor-demo");
  let activeRange = "month";
  let activeRequest;

  const getTokyoYearMonth = () => {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(new Date());
    return {
      year: Number(parts.find((part) => part.type === "year")?.value),
      month: Number(parts.find((part) => part.type === "month")?.value),
    };
  };

  const formatMonth = (value) => {
    const [yearValue, monthValue] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" })
      .format(new Date(Date.UTC(yearValue, monthValue - 1, 1)));
  };

  const formatStartDate = () => {
    const [yearValue, monthValue, dayValue] = trackingStart.split("-").map(Number);
    return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
      .format(new Date(Date.UTC(yearValue, monthValue - 1, dayValue)));
  };

  const buildPeriodOptions = () => {
    const [startYear, startMonth] = trackingStart.split("-").map(Number);
    const now = getTokyoYearMonth();
    const options = [];

    if (activeRange === "month") {
      for (let yearValue = now.year; yearValue >= startYear; yearValue -= 1) {
        const firstMonth = yearValue === now.year ? now.month : 12;
        const lastMonth = yearValue === startYear ? startMonth : 1;
        for (let monthValue = firstMonth; monthValue >= lastMonth; monthValue -= 1) {
          const value = `${yearValue}-${String(monthValue).padStart(2, "0")}`;
          options.push({ value, label: formatMonth(value) });
        }
      }
    } else if (activeRange === "year") {
      for (let yearValue = now.year; yearValue >= startYear; yearValue -= 1) {
        options.push({ value: String(yearValue), label: String(yearValue) });
      }
    } else {
      options.push({ value: "all", label: `Since ${formatStartDate()}` });
    }

    periodSelect.replaceChildren(...options.map(({ value, label }) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      return option;
    }));
    periodSelect.disabled = activeRange === "all";
  };

  const loadMap = async () => {
    try {
      const response = await fetch("assets/world-map.svg");
      if (!response.ok) throw new Error(`Map request failed with ${response.status}`);
      const source = await response.text();
      const documentNode = new DOMParser().parseFromString(source, "image/svg+xml");
      const svg = documentNode.documentElement;
      svg.setAttribute("aria-hidden", "true");
      svg.removeAttribute("role");
      svg.removeAttribute("aria-label");
      mapContainer.replaceChildren(document.importNode(svg, true));
      mapContainer.setAttribute("aria-busy", "false");
      bindMapTooltips();
      return true;
    } catch (error) {
      mapContainer.setAttribute("aria-busy", "false");
      mapContainer.innerHTML = '<p class="visitor-map-loading">Map unavailable.</p>';
      return false;
    }
  };

  const bindMapTooltips = () => {
    mapContainer.querySelectorAll("[data-country]").forEach((country) => {
      const updateTooltip = (event) => {
        if (!country.dataset.visits) return;
        const cardRect = country.closest(".visitor-map-card").getBoundingClientRect();
        const tooltipWidth = tooltip.offsetWidth || 150;
        const left = Math.min(event.clientX - cardRect.left + 12, cardRect.width - tooltipWidth - 12);
        tooltip.style.transform = `translate(${Math.max(12, left)}px, ${event.clientY - cardRect.top + 12}px)`;
      };

      country.addEventListener("pointerenter", (event) => {
        if (!country.dataset.visits) return;
        const name = getCountryName(country.dataset.country, country.dataset.name);
        tooltip.replaceChildren();
        const strong = document.createElement("strong");
        strong.textContent = name;
        const count = document.createElement("span");
        count.textContent = `${numberFormat.format(Number(country.dataset.visits))} visits`;
        tooltip.append(strong, count);
        tooltip.hidden = false;
        updateTooltip(event);
      });
      country.addEventListener("pointermove", updateTooltip);
      country.addEventListener("pointerleave", () => {
        tooltip.hidden = true;
      });
    });
  };

  const getCountryName = (code, fallback = code) => {
    try {
      return countryNames?.of(code) || fallback;
    } catch (error) {
      return fallback;
    }
  };

  const getCountryFlag = (code) => {
    if (!/^[A-Z]{2}$/.test(code)) return "";
    return String.fromCodePoint(...[...code].map((character) => character.charCodeAt(0) + 127397));
  };

  const getDemoData = () => ({
    period: {
      type: activeRange,
      value: periodSelect.value,
      label: activeRange === "all" ? `Since ${formatStartDate()}` : periodSelect.selectedOptions[0]?.textContent,
    },
    visits: 487,
    countryCount: 12,
    countries: [
      { code: "JP", visits: 168 },
      { code: "US", visits: 94 },
      { code: "CN", visits: 63 },
      { code: "DE", visits: 38 },
      { code: "GB", visits: 31 },
      { code: "FR", visits: 24 },
      { code: "CA", visits: 19 },
      { code: "SG", visits: 16 },
      { code: "AU", visits: 13 },
      { code: "IN", visits: 9 },
      { code: "BR", visits: 7 },
      { code: "ZA", visits: 5 },
    ],
    updatedAt: new Date().toISOString(),
  });

  const validateVisitorData = (data) => {
    if (!data || !Array.isArray(data.countries)) throw new Error("Invalid visitor response");
    return {
      ...data,
      visits: Number.isFinite(Number(data.visits)) ? Number(data.visits) : 0,
      countryCount: Number.isFinite(Number(data.countryCount)) ? Number(data.countryCount) : 0,
      countries: data.countries
        .map((country) => ({ code: String(country.code || "").toUpperCase(), visits: Number(country.visits) }))
        .filter((country) => /^[A-Z]{2}$/.test(country.code) && Number.isFinite(country.visits) && country.visits > 0)
        .sort((a, b) => b.visits - a.visits),
    };
  };

  const fetchVisitorData = async () => {
    if (isDemo) return getDemoData();
    if (!endpoint) throw new Error("Visitor statistics endpoint is not configured");

    const cacheKey = `${activeRange}:${periodSelect.value}`;
    if (visitorCache.has(cacheKey)) return visitorCache.get(cacheKey);

    activeRequest?.abort();
    activeRequest = new AbortController();
    const url = new URL(endpoint);
    url.searchParams.set("range", activeRange);
    if (activeRange !== "all") url.searchParams.set("value", periodSelect.value);

    const response = await fetch(url, { signal: activeRequest.signal });
    if (!response.ok) throw new Error(`Visitor request failed with ${response.status}`);
    const data = validateVisitorData(await response.json());
    visitorCache.set(cacheKey, data);
    return data;
  };

  const resetMap = () => {
    mapContainer.querySelectorAll("[data-country]").forEach((country) => {
      country.removeAttribute("data-level");
      country.removeAttribute("data-visits");
    });
  };

  const renderMap = (countries) => {
    resetMap();
    const maxVisits = Math.max(0, ...countries.map((country) => country.visits));
    countries.forEach(({ code, visits }) => {
      const country = mapContainer.querySelector(`[data-country="${code}"]`);
      if (!country) return;
      const ratio = maxVisits > 0 ? Math.log1p(visits) / Math.log1p(maxVisits) : 0;
      country.dataset.level = String(Math.max(1, Math.min(5, Math.ceil(ratio * 5))));
      country.dataset.visits = String(visits);
    });
  };

  const renderRanking = (countries) => {
    if (!countries.length) {
      const empty = document.createElement("li");
      empty.className = "visitor-ranking-empty";
      empty.textContent = "No visits recorded for this period yet.";
      rankingElement.replaceChildren(empty);
      return;
    }

    const maxVisits = countries[0].visits;
    const rows = countries.slice(0, 8).map(({ code, visits }) => {
      const item = document.createElement("li");
      item.className = "visitor-ranking-item";

      const name = document.createElement("span");
      name.className = "visitor-ranking-name";
      name.textContent = `${getCountryFlag(code)} ${getCountryName(code)}`;

      const count = document.createElement("span");
      count.className = "visitor-ranking-count";
      count.textContent = numberFormat.format(visits);

      const bar = document.createElement("span");
      bar.className = "visitor-ranking-bar";
      const fill = document.createElement("i");
      fill.style.setProperty("--visitor-share", `${(visits / maxVisits) * 100}%`);
      bar.append(fill);
      item.append(name, count, bar);
      return item;
    });
    rankingElement.replaceChildren(...rows);
  };

  const formatUpdatedAt = (updatedAt) => {
    if (!updatedAt) return "Updated recently";
    const date = new Date(updatedAt);
    if (Number.isNaN(date.valueOf())) return "Updated recently";
    return `Updated ${new Intl.DateTimeFormat("en", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Tokyo",
      timeZoneName: "short",
    }).format(date)}`;
  };

  const loadVisitorReport = async () => {
    report.classList.add("is-loading");
    report.classList.remove("is-error");
    statusElement.textContent = "Loading aggregate visitor statistics…";

    try {
      const data = validateVisitorData(await fetchVisitorData());
      totalElement.textContent = numberFormat.format(data.visits);
      countriesElement.textContent = numberFormat.format(data.countryCount || data.countries.length);
      periodLabelElement.textContent = data.period?.label || periodSelect.selectedOptions[0]?.textContent || "All time";
      updatedElement.textContent = formatUpdatedAt(data.updatedAt);
      renderMap(data.countries);
      renderRanking(data.countries);
      statusElement.textContent = isDemo
        ? "Preview data for layout testing. Live visits are not shown in this preview."
        : "Counts refresh hourly. They are approximate, privacy-aware, and exclude identifiable bots.";
    } catch (error) {
      if (error.name === "AbortError") return;
      report.classList.add("is-error");
      totalElement.textContent = "—";
      countriesElement.textContent = "—";
      periodLabelElement.textContent = periodSelect.selectedOptions[0]?.textContent || "All time";
      updatedElement.textContent = "Awaiting data";
      resetMap();
      renderRanking([]);
      statusElement.textContent = endpoint
        ? "The visitor report is temporarily unavailable. Please try again later."
        : "Visit collection is active. The public geographic report is being connected.";
    } finally {
      report.classList.remove("is-loading");
    }
  };

  rangeButtons.forEach((button) => {
    button.tabIndex = button.getAttribute("aria-selected") === "true" ? 0 : -1;
    button.addEventListener("click", () => {
      activeRange = button.dataset.visitorRange;
      rangeButtons.forEach((candidate) => {
        candidate.setAttribute("aria-selected", String(candidate === button));
        candidate.tabIndex = candidate === button ? 0 : -1;
      });
      buildPeriodOptions();
      loadVisitorReport();
    });
    button.addEventListener("keydown", (event) => {
      const currentIndex = rangeButtons.indexOf(button);
      const offsets = { ArrowLeft: -1, ArrowRight: 1 };
      let nextIndex;
      if (event.key in offsets) {
        nextIndex = (currentIndex + offsets[event.key] + rangeButtons.length) % rangeButtons.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = rangeButtons.length - 1;
      } else {
        return;
      }
      event.preventDefault();
      rangeButtons[nextIndex].focus();
      rangeButtons[nextIndex].click();
    });
  });

  periodSelect.addEventListener("change", loadVisitorReport);

  buildPeriodOptions();
  loadMap().then(loadVisitorReport);
}
