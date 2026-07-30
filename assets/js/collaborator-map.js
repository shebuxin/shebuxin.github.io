// Render a responsive world map from published geographic data.
const WORLD_MAP_URL = "https://esm.sh/@d3-maps/atlas@1.0.0/world/countries/countries-110m";
const TOPOJSON_URL = "https://esm.sh/topojson-client@3.1.0";
const D3_GEO_URL = "https://esm.sh/d3-geo@3.1.1";

const WIDTH = 960;
const HEIGHT = 500;
const numberFormatter = new Intl.NumberFormat("en-US");
const ATLAS_COUNTRY_ALIASES = new Map([
  ["ESH", "SAH"],
  ["PSE", "PSX"],
  ["SSD", "SDS"],
  ["XKX", "KOS"]
]);

function countryCode(feature) {
  return String(feature.properties?.id || feature.id || "").toUpperCase();
}

function visitorLevel(count, maximum) {
  if (maximum <= 1) return 3;
  const level = Math.ceil((Math.log1p(count) / Math.log1p(maximum)) * 5);
  return Math.max(1, Math.min(5, level));
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${numberFormatter.format(count)} ${count === 1 ? singular : plural}`;
}

async function renderCollaboratorMap(root) {
  const isChinese = root.dataset.mapLang === "zh";
  const collaboratorDataElement = root.querySelector("[data-collaborator-data]");
  const visitorDataElement = root.querySelector("[data-visitor-data]");
  const countryNamesElement = root.querySelector("[data-country-names-zh]");
  const svg = root.querySelector(".collaborator-map__svg");
  const mapLayer = root.querySelector("[data-map-layer]");
  const markerLayer = root.querySelector("[data-marker-layer]");
  const status = root.querySelector("[data-map-status]");
  const legend = root.querySelector("[data-map-legend]");
  const controls = root.querySelector("[data-map-controls]");
  const select = root.querySelector("[data-location-select]");

  if (!collaboratorDataElement || !visitorDataElement || !countryNamesElement || !svg || !mapLayer ||
      !markerLayer || !status || !legend || !controls || !select) {
    return;
  }

  const visitorCountLabel = (count) => isChinese
    ? `${numberFormatter.format(count)} 位网站访客`
    : pluralize(count, "website visitor");
  const collaboratorCountLabel = (count) => isChinese
    ? `${numberFormatter.format(count)} 位合作者`
    : pluralize(count, "collaborator");

  try {
    const regions = JSON.parse(collaboratorDataElement.textContent).map((region) => ({
      ...region,
      collaborator_count: Number(region.collaborator_count) || 0
    }));
    const visitorData = JSON.parse(visitorDataElement.textContent);
    const countryNames = isChinese ? JSON.parse(countryNamesElement.textContent) : {};
    const visitorCountries = (visitorData.countries || []).filter((country) =>
      /^[A-Z]{3}$/.test(country.iso3) && Number.isFinite(country.visitors) &&
      country.visitors > 0 && Number.isFinite(country.latitude) &&
      Number.isFinite(country.longitude)
    ).map((country) => ({
      ...country,
      name: countryNames[country.iso3] || country.name
    }));
    const visitorByAtlasCountry = new Map(visitorCountries.map((country) => [
      ATLAS_COUNTRY_ALIASES.get(country.iso3) || country.iso3,
      country
    ]));
    const maximumVisitors = Math.max(0, ...visitorCountries.map((country) => country.visitors));

    const [{ default: world }, { feature }, { geoEqualEarth, geoPath }] = await Promise.all([
      import(WORLD_MAP_URL),
      import(TOPOJSON_URL),
      import(D3_GEO_URL)
    ]);

    const countries = feature(world, world.objects.features).features;
    const collection = { type: "FeatureCollection", features: countries };
    const projection = geoEqualEarth().fitExtent([[8, 8], [WIDTH - 8, HEIGHT - 8]], collection);
    const path = geoPath(projection);
    const namespace = "http://www.w3.org/2000/svg";

    mapLayer.replaceChildren();
    markerLayer.replaceChildren();

    const sphere = document.createElementNS(namespace, "path");
    sphere.setAttribute("class", "collaborator-map__sphere");
    sphere.setAttribute("d", path({ type: "Sphere" }));
    mapLayer.appendChild(sphere);

    const countryPaths = new Map();
    countries.forEach((country) => {
      const iso3 = countryCode(country);
      const visitorCountry = visitorByAtlasCountry.get(iso3);
      const countryPath = document.createElementNS(namespace, "path");
      countryPath.setAttribute("class", "collaborator-map__country");
      countryPath.setAttribute("d", path(country));

      if (visitorCountry) {
        const level = visitorLevel(visitorCountry.visitors, maximumVisitors);
        countryPath.classList.add(
          "collaborator-map__country--visitor",
          `collaborator-map__country--visitor-level-${level}`
        );
        const title = document.createElementNS(namespace, "title");
        title.textContent = `${visitorCountry.name}: ${visitorCountLabel(visitorCountry.visitors)}`;
        countryPath.appendChild(title);
        countryPaths.set(visitorCountry.iso3, countryPath);
      }

      mapLayer.appendChild(countryPath);
    });

    const collaboratorPoints = regions
      .filter((region) => region.collaborator_count > 0)
      .map((region) => projection([region.longitude, region.latitude]))
      .filter(Boolean);
    const visitorMarkers = new Map();
    visitorCountries.forEach((country) => {
      if (countryPaths.has(country.iso3)) return;
      const point = projection([country.longitude, country.latitude]);
      if (!point) return;
      const overlapsCollaborator = collaboratorPoints.some((collaboratorPoint) =>
        Math.hypot(point[0] - collaboratorPoint[0], point[1] - collaboratorPoint[1]) < 18
      );
      const markerX = point[0] + (overlapsCollaborator ? 11 : 0);

      const marker = document.createElementNS(namespace, "g");
      marker.setAttribute("class", "collaborator-map__visitor-marker");
      marker.setAttribute("data-country-id", country.iso3);
      marker.setAttribute("transform", `translate(${markerX},${point[1]})`);

      const title = document.createElementNS(namespace, "title");
      title.textContent = `${country.name}: ${visitorCountLabel(country.visitors)}`;

      const selectionRing = document.createElementNS(namespace, "circle");
      selectionRing.setAttribute("class", "collaborator-map__selection-ring");
      selectionRing.setAttribute("r", "14");

      const halo = document.createElementNS(namespace, "rect");
      halo.setAttribute("class", "collaborator-map__visitor-marker-halo");
      halo.setAttribute("x", "-6.25");
      halo.setAttribute("y", "-6.25");
      halo.setAttribute("width", "12.5");
      halo.setAttribute("height", "12.5");
      halo.setAttribute("transform", "rotate(45)");

      const dot = document.createElementNS(namespace, "rect");
      dot.setAttribute("class", "collaborator-map__visitor-marker-dot");
      dot.setAttribute("x", "-2.75");
      dot.setAttribute("y", "-2.75");
      dot.setAttribute("width", "5.5");
      dot.setAttribute("height", "5.5");
      dot.setAttribute("transform", "rotate(45)");

      marker.append(title, selectionRing, halo, dot);
      markerLayer.appendChild(marker);
      visitorMarkers.set(country.iso3, marker);
    });

    const markers = new Map();
    regions.forEach((region) => {
      const point = projection([region.longitude, region.latitude]);
      if (!point || region.collaborator_count === 0) return;

      const marker = document.createElementNS(namespace, "g");
      marker.setAttribute("class", "collaborator-map__marker");
      marker.setAttribute("data-region-id", region.id);
      marker.setAttribute("transform", `translate(${point[0]},${point[1]})`);

      const title = document.createElementNS(namespace, "title");
      title.textContent = `${region.label}: ${collaboratorCountLabel(region.collaborator_count)}`;

      const selectionRing = document.createElementNS(namespace, "circle");
      selectionRing.setAttribute("class", "collaborator-map__selection-ring");
      selectionRing.setAttribute("r", "15");

      const halo = document.createElementNS(namespace, "circle");
      halo.setAttribute("class", "collaborator-map__marker-halo");
      halo.setAttribute("r", "9");

      const dot = document.createElementNS(namespace, "circle");
      dot.setAttribute("class", "collaborator-map__marker-dot");
      dot.setAttribute("r", "3.75");

      marker.append(title, selectionRing, halo, dot);
      markerLayer.appendChild(marker);
      markers.set(region.id, marker);
    });

    function clearSelection() {
      markers.forEach((marker) => marker.classList.remove("is-selected"));
      countryPaths.forEach((countryPath) => countryPath.classList.remove("is-selected"));
      visitorMarkers.forEach((marker) => marker.classList.remove("is-selected"));
    }

    function selectCollaboratorRegion(regionId) {
      const region = regions.find((item) => item.id === regionId) || regions[0];
      if (!region) return;

      clearSelection();
      select.value = `collaborator:${region.id}`;
      markers.get(region.id)?.classList.add("is-selected");
    }

    function selectVisitorCountry(iso3) {
      const country = visitorCountries.find((item) => item.iso3 === iso3);
      if (!country) return;

      clearSelection();
      select.value = `visitor:${country.iso3}`;
      countryPaths.get(country.iso3)?.classList.add("is-selected");
      visitorMarkers.get(country.iso3)?.classList.add("is-selected");
    }

    select.addEventListener("change", () => {
      const [category, id] = select.value.split(":", 2);
      if (category === "visitor") {
        selectVisitorCountry(id);
      } else {
        selectCollaboratorRegion(id);
      }
    });
    selectCollaboratorRegion(regions[0]?.id);

    svg.removeAttribute("hidden");
    legend.hidden = false;
    controls.hidden = false;
    status.hidden = true;
    root.classList.add("is-ready");
  } catch (error) {
    status.textContent = isChinese
      ? "互动地图暂时无法加载，请稍后重试。"
      : "The interactive map could not be loaded. Please try again later.";
    root.classList.add("has-error");
    console.error("Unable to load the global map.", error);
  }
}

document.querySelectorAll("[data-collaborator-map]").forEach((root) => {
  renderCollaboratorMap(root);
});
