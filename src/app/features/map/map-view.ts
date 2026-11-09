import {
  AfterViewInit, Component, ElementRef, NgZone, OnDestroy, effect, inject, input, model, output, signal, viewChild,
} from '@angular/core';
import {
  AttributionControl, FullscreenControl, GeoJSONSource, LngLatBounds, Map as MapLibre, MapLayerMouseEvent,
  NavigationControl, Popup, ScaleControl, StyleSpecification,
} from 'maplibre-gl';

import { deviceId } from '../../core/format';
import { Row } from '../../core/models';
import { ColourMode, deviceIcon, deviceKind, deviceState, legendLevel, markerColour } from './map-colours';

export type Basemap = 'streets' | 'satellite' | 'terrain' | 'light';

/*
 * Open map layers – no API key. Terrain is the AWS Open Data "Terrain Tiles" elevation model (SRTM and other public
 * sources); imagery is the 2016 Sentinel-2 cloudless mosaic by EOX (CC BY 4.0). Both are visual backdrops only:
 * nothing from them is stored or used in any MRV calculation.
 */
const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const TERRAIN_ATTRIBUTION = 'Terrain: <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank">Terrain Tiles</a> (AWS Open Data)';

export const DEVICE_MIN_ZOOM = 12.5;  // devices sit within a few hundred metres of their plot's point

const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors' },
    satellite: { type: 'raster', tileSize: 256, maxzoom: 14,
      tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg'],
      attribution: '<a href="https://s2maps.eu" target="_blank">Sentinel-2 cloudless</a> by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016)' },
    // Separate elevation sources for the 3D surface and the shading, as MapLibre recommends
    'terrain-dem': { type: 'raster-dem', tiles: [TERRAIN_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 15,
      attribution: TERRAIN_ATTRIBUTION },
    'hillshade-dem': { type: 'raster-dem', tiles: [TERRAIN_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 15 },
    plots: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    columns: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    farm: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    devices: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
  },
  layers: [
    { id: 'osm', type: 'raster', source: 'osm' },
    { id: 'satellite', type: 'raster', source: 'satellite', layout: { visibility: 'none' } },
    { id: 'hillshade', type: 'hillshade', source: 'hillshade-dem', layout: { visibility: 'none' },
      paint: { 'hillshade-exaggeration': 0.45, 'hillshade-shadow-color': '#24331f', 'hillshade-highlight-color': '#ffffff' } },
    // The selected plot's real farm outline (and its blocks) when the source system has one
    { id: 'farm-fill', type: 'fill', source: 'farm', filter: ['==', ['get', 'part'], 'farm'],
      paint: { 'fill-color': ['get', 'colour'], 'fill-opacity': 0.32 } },
    { id: 'farm-blocks', type: 'line', source: 'farm', filter: ['==', ['get', 'part'], 'block'],
      paint: { 'line-color': '#ffffff', 'line-width': 1.2, 'line-opacity': 0.85 } },
    { id: 'farm-casing', type: 'line', source: 'farm', filter: ['==', ['get', 'part'], 'farm'],
      layout: { 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 5 } },
    { id: 'farm-line', type: 'line', source: 'farm', filter: ['==', ['get', 'part'], 'farm'],
      layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'colour'], 'line-width': 2.5 } },
    { id: 'columns', type: 'fill-extrusion', source: 'columns', layout: { visibility: 'none' },
      paint: { 'fill-extrusion-color': ['get', 'colour'], 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.88, 'fill-extrusion-vertical-gradient': true } },
    // Soft glow under every point so plots stand out on busy imagery
    { id: 'plots-glow', type: 'circle', source: 'plots',
      paint: { 'circle-color': ['get', 'colour'], 'circle-blur': 1, 'circle-opacity': 0.55,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 16, 10, 22, 15, 28] } },
    { id: 'plots-halo', type: 'circle', source: 'plots',
      paint: { 'circle-color': ['get', 'colour'], 'circle-radius': 20,
        'circle-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.28, 0],
        'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2, 0],
        'circle-stroke-color': ['get', 'colour'] } },
    { id: 'plots', type: 'circle', source: 'plots',
      paint: { 'circle-color': ['get', 'colour'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2,
        'circle-radius': ['interpolate', ['linear'], ['zoom'],
          4, ['case', ['boolean', ['feature-state', 'hover'], false], 7, 5],
          10, ['case', ['boolean', ['feature-state', 'hover'], false], 11, 8],
          15, ['case', ['boolean', ['feature-state', 'hover'], false], 15, 11]] } },
    // IoT devices: rounded squares (plots are circles) with the type letter on the status colour; farm scale only
    { id: 'devices', type: 'symbol', source: 'devices', minzoom: DEVICE_MIN_ZOOM,
      layout: { 'icon-image': ['get', 'icon'], 'icon-allow-overlap': true, 'icon-ignore-placement': true,
        'icon-size': ['interpolate', ['linear'], ['zoom'], DEVICE_MIN_ZOOM, 0.75, 16, 1.05] } },
  ],
};

const COLUMN_RADIUS_DEG = 0.0016;  // ~180 m round pillar – a chart mark, deliberately not shaped like a land parcel
const COLUMN_MAX_M = 2400;
const TILT_3D = 62;
const TERRAIN_EXAGGERATION = 1.3;
const FARM_ZOOM_3D = 15.5;  // farm close-up in 3D
const FARM_TILT_3D = 45;

/** Interactive MapLibre view of located plots: 2D/3D terrain, rotation, basemaps and optional 3D columns. */
@Component({
  selector: 'app-map-view',
  template: `
    <div #mapEl class="map-gl"></div>
    @if (failed()) {
      <div class="map-fallback"><strong>The map could not start.</strong>
        <span>The browser's map graphics (WebGL) are off or stopped – reload the page; if it keeps happening, enable hardware
          acceleration or close other heavy tabs.</span></div>
    }`,
  styles: `
    :host { display: block; position: relative; height: 100%; min-height: 240px; border-radius: inherit; overflow: hidden;
      background: #dfe9df; }
    .map-gl { position: absolute; inset: 0; }
    .map-fallback { position: absolute; inset: 0; display: grid; place-content: center; gap: 4px; text-align: center;
      padding: 24px; color: var(--muted); }`,
})
export class MapView implements AfterViewInit, OnDestroy {
  readonly plots = input<Row[]>([]);
  readonly mode = input<ColourMode>('practice');
  readonly threeD = input(false);
  readonly basemap = input<Basemap>('streets');
  readonly columns = input(false);
  readonly controls = input(true);
  readonly autoRotate = model(false);
  readonly selectedId = input<string | null>(null);
  /** One colour for every point (overview maps) instead of the colour-by scale. */
  readonly pointColour = input<string | null>(null);
  readonly tilt = input(TILT_3D);
  /** Real outline of the selected plot's farm ({boundary, blocks} rings in [lon, lat]) – drawn and framed when set. */
  readonly outline = input<Row | null>(null);
  /** IoT devices with a position ({latitude, longitude, device_type, reporting_state, ...}). */
  readonly devices = input<Row[]>([]);
  readonly showDevices = input(true);
  readonly plotClick = output<Row>();
  readonly deviceClick = output<Row>();

  protected readonly failed = signal(false);
  private readonly zone = inject(NgZone);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapEl');
  private readonly ready = signal(false);
  private map: MapLibre | null = null;
  private popup: Popup | null = null;
  private resize: ResizeObserver | null = null;
  private frame = 0;
  private hovered: number | null = null;
  private selectedFeature: number | null = null;
  private fittedTo: Row[] | null = null;
  private fittedDevices: Row[] | null = null;
  private pendingPoint: [number, number, number] | null = null;

  constructor() {
    effect(() => this.drawPlots(this.plots(), this.mode(), this.ready()));
    effect(() => this.applyView(this.threeD(), this.basemap(), this.columns(), this.ready()));
    effect(() => this.highlight(this.selectedId(), this.plots(), this.ready()));
    effect(() => this.drawOutline(this.outline(), this.selectedId(), this.mode(), this.ready()));
    effect(() => (this.autoRotate() && this.ready() ? this.startRotation() : this.stopRotation()));
    effect(() => this.drawDevices(this.devices(), this.showDevices(), this.ready()));
  }

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      try {
        this.map = new MapLibre({
          container: this.mapEl().nativeElement, style: STYLE, center: [78.5, 17], zoom: 4.3, maxPitch: 80,
          attributionControl: false, cooperativeGestures: !this.controls(),
        });
      } catch {
        this.failed.set(true);
        return;
      }
      const map = this.map;
      map.addControl(new AttributionControl({ compact: true }), 'bottom-right');
      if (this.controls()) {
        map.addControl(new NavigationControl({ visualizePitch: true, showCompass: true, showZoom: true }), 'top-right');
        map.addControl(new FullscreenControl({ container: this.host.nativeElement }), 'top-right');
        map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');
      }
      // The browser can drop map graphics (GPU reset, low memory); say so instead of leaving an empty frame
      map.on('webglcontextlost', () => this.zone.run(() => this.failed.set(true)));
      map.on('webglcontextrestored', () => this.zone.run(() => this.failed.set(false)));
      map.on('load', () => {
        // Credits start folded behind the (i) button rather than covering the bottom of the map
        map.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
        this.zone.run(() => this.ready.set(true));
      });
      map.on('error', (e) => { if (!this.ready() && !map.loaded()) console.warn('Map tile error', e.error?.message); });
      // Any manual pan, tilt or rotation hands the camera back to the user
      for (const ev of ['mousedown', 'touchstart', 'wheel'] as const) {
        map.on(ev, () => { if (this.autoRotate()) this.zone.run(() => this.autoRotate.set(false)); });
      }
      for (const layer of ['plots', 'columns']) {
        map.on('mousemove', layer, (e) => this.hover(e));
        map.on('mouseleave', layer, () => this.unhover());
        map.on('click', layer, (e) => {
          const id = e.features?.[0]?.id;
          const plot = typeof id === 'number' ? this.plots()[id] : undefined;
          if (plot) this.zone.run(() => this.plotClick.emit(plot));
        });
      }
      // Device icons are drawn on demand: one per type letter and status colour
      map.on('styleimagemissing', (e) => this.addDeviceIcon(e.id));
      map.on('mousemove', 'devices', (e) => this.hoverDevice(e));
      map.on('mouseleave', 'devices', () => this.unhover());
      map.on('click', 'devices', (e) => {
        const id = e.features?.[0]?.id;
        const device = typeof id === 'number' ? this.devices()[id] : undefined;
        if (device) this.zone.run(() => this.deviceClick.emit(device));
      });
      this.resize = new ResizeObserver(() => map.resize());
      this.resize.observe(this.host.nativeElement);
    });
  }

  ngOnDestroy(): void {
    this.stopRotation();
    this.resize?.disconnect();
    this.map?.remove();
    this.map = null;
  }

  /** Back to north-up, the default tilt for the current mode, framing every plot. */
  resetView(): void {
    this.fittedTo = null;
    this.drawPlots(this.plots(), this.mode(), this.ready(), 0);
  }

  /** Glide to one plot, tilted when in 3D. */
  flyTo(plot: Row): void {
    this.map?.flyTo({ center: [plot['longitude'], plot['latitude']], zoom: Math.max(this.map.getZoom(), 13.5),
      pitch: this.threeD() ? this.tilt() : 0, speed: 0.9, essential: true });
  }

  private drawPlots(plots: Row[], mode: ColourMode, ready: boolean, bearing?: number): void {
    const map = this.map;
    if (!map || !ready) return;
    const features = plots.map((p, i) => ({
      type: 'Feature' as const, id: i, geometry: { type: 'Point' as const, coordinates: [p['longitude'], p['latitude']] },
      properties: { colour: this.pointColour() ?? markerColour(p, mode) },
    }));
    // Plots with no data on the chosen scale get no pillar at all
    const columns = plots.flatMap((p, i) => {
      const level = legendLevel(p, mode);
      if (!level) return [];
      const lat = p['latitude'], lon = p['longitude'];
      const dLon = COLUMN_RADIUS_DEG / Math.max(Math.cos((lat * Math.PI) / 180), 0.2);
      const ring = Array.from({ length: 21 }, (_, k) => {
        const a = (k % 20) * (Math.PI / 10);
        return [lon + dLon * Math.cos(a), lat + COLUMN_RADIUS_DEG * Math.sin(a)];
      });
      return [{
        type: 'Feature' as const, id: i, geometry: { type: 'Polygon' as const, coordinates: [ring] },
        properties: { colour: markerColour(p, mode), height: level * COLUMN_MAX_M },
      }];
    });
    (map.getSource('plots') as GeoJSONSource).setData({ type: 'FeatureCollection', features });
    (map.getSource('columns') as GeoJSONSource).setData({ type: 'FeatureCollection', features: columns });
    this.selectedFeature = null;
    this.highlight(this.selectedId(), plots, ready);
    if (plots.length && this.fittedTo !== plots) {
      this.fittedTo = plots;
      const bounds = new LngLatBounds();
      for (const p of plots) bounds.extend([p['longitude'], p['latitude']]);
      // Without on-map controls this is an overview card with a title strip across the top
      const padding = this.controls() ? 60 : { top: 90, bottom: 40, left: 50, right: 50 };
      const camera = map.cameraForBounds(bounds, { padding, maxZoom: 12.5 });
      if (camera) map.easeTo({ ...camera, pitch: this.threeD() ? this.tilt() : 0, bearing: bearing ?? map.getBearing(), duration: 1200 });
    } else if (bearing !== undefined) {
      map.easeTo({ bearing, pitch: this.threeD() ? this.tilt() : 0, duration: 800 });
    }
    // A point asked for before the map was ready (e.g. opened from a device link) wins over the overview framing
    if (this.pendingPoint) {
      const [lon, lat, zoom] = this.pendingPoint;
      this.pendingPoint = null;
      this.flyToPoint(lon, lat, zoom);
    }
  }

  /** Glide to a point at farm scale (e.g. one device); waits for the map and its first framing when needed. */
  flyToPoint(longitude: number, latitude: number, zoom = 16): void {
    if (!this.map || !this.ready() || (this.plots().length && this.fittedTo !== this.plots())) {
      this.pendingPoint = [longitude, latitude, zoom];
      return;
    }
    this.map.flyTo({ center: [longitude, latitude], zoom: Math.max(this.map.getZoom(), zoom),
      pitch: this.threeD() ? Math.min(this.tilt(), FARM_TILT_3D) : 0, speed: 0.9, essential: true });
  }

  private drawDevices(devices: Row[], show: boolean, ready: boolean): void {
    const map = this.map;
    if (!map || !ready) return;
    const features = devices.flatMap((d, i) => d['latitude'] == null || d['longitude'] == null ? [] : [{
      type: 'Feature' as const, id: i, geometry: { type: 'Point' as const, coordinates: [d['longitude'], d['latitude']] },
      properties: { icon: deviceIcon(d) },
    }]);
    (map.getSource('devices') as GeoJSONSource).setData({ type: 'FeatureCollection', features });
    map.setLayoutProperty('devices', 'visibility', show ? 'visible' : 'none');
    // A map of devices only (no plots, e.g. the device page) frames the devices itself
    if (!this.plots().length && features.length && this.fittedDevices !== devices) {
      this.fittedDevices = devices;
      const bounds = new LngLatBounds();
      for (const f of features) bounds.extend(f.geometry.coordinates as [number, number]);
      const camera = map.cameraForBounds(bounds, { padding: 80, maxZoom: 16.5 });
      if (camera) map.jumpTo(camera);
    }
  }

  private addDeviceIcon(id: string): void {
    const map = this.map;
    const match = /^dev-(.)-(.+)$/.exec(id);
    if (!map || !match || map.hasImage(id)) return;
    const size = 52, ratio = 2;  // 26 px on screen, sharp on high-density displays
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const square = (inset: number, radius: number, colour: string) => {
      ctx.beginPath();
      ctx.roundRect(inset, inset, size - 2 * inset, size - 2 * inset, radius);
      ctx.fillStyle = colour;
      ctx.fill();
    };
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 4;
    square(4, 12, '#ffffff');
    ctx.shadowBlur = 0;
    square(9, 8, deviceState(match[2]).colour);
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 22px "Lexend Deca", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(match[1], size / 2, size / 2 + 1);
    map.addImage(id, ctx.getImageData(0, 0, size, size), { pixelRatio: ratio });
  }

  private drawOutline(outline: Row | null, selectedId: string | null, mode: ColourMode, ready: boolean): void {
    const map = this.map;
    if (!map || !ready) return;
    const plot = this.plots().find((p) => p['id'] === selectedId);
    const rings: number[][][] = outline?.['boundary'] ? [outline['boundary']] : [];
    const colour = plot ? this.pointColour() ?? markerColour(plot, mode) : '#004225';
    const features = [
      ...rings.map((ring) => ({ type: 'Feature' as const, geometry: { type: 'Polygon' as const, coordinates: [ring] },
        properties: { part: 'farm', colour } })),
      ...(rings.length ? (outline?.['blocks'] ?? []) as number[][][] : []).map((ring) => ({
        type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: ring }, properties: { part: 'block', colour } })),
    ];
    (map.getSource('farm') as GeoJSONSource).setData({ type: 'FeatureCollection', features });
    // The selected plot's own pillar would hide its outline
    const index = plot ? this.plots().indexOf(plot) : -1;
    map.setFilter('columns', rings.length && index >= 0 ? ['!=', ['id'], index] : null);
    if (rings.length) {
      const bounds = new LngLatBounds();
      for (const [lon, lat] of rings[0]) bounds.extend([lon, lat]);
      // Frame the outline as seen from straight above, then tilt: a camera solved for the tilted terrain view can
      // come back unusable at farm scale and leave the map blank.
      const camera = map.cameraForBounds(bounds, { padding: 90, maxZoom: 17, bearing: 0, pitch: 0 });
      const zoom = Number(camera?.zoom);
      if (camera?.center && Number.isFinite(zoom)) {
        // In 3D the camera stays higher and less tilted: on steep estates a low, tilted camera ends up inside the
        // neighbouring hillside and the whole map goes blank.
        map.flyTo({ center: camera.center, zoom: this.threeD() ? Math.min(zoom, FARM_ZOOM_3D) : zoom,
          pitch: this.threeD() ? Math.min(this.tilt(), FARM_TILT_3D) : 0, bearing: map.getBearing(), speed: 0.9 });
      }
    }
  }

  private applyView(threeD: boolean, basemap: Basemap, columns: boolean, ready: boolean): void {
    const map = this.map;
    if (!map || !ready) return;
    const show = (id: string, on: boolean) => map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    show('osm', basemap !== 'satellite');
    show('satellite', basemap === 'satellite');
    show('hillshade', basemap === 'terrain' || (threeD && basemap !== 'satellite'));
    // Relief and light are the street map toned down so the plots and the terrain carry the picture
    const muted = basemap === 'terrain' || basemap === 'light';
    map.setPaintProperty('osm', 'raster-saturation', basemap === 'light' ? -0.85 : basemap === 'terrain' ? -0.55 : 0);
    map.setPaintProperty('osm', 'raster-contrast', basemap === 'light' ? -0.25 : 0);
    map.setPaintProperty('osm', 'raster-brightness-min', basemap === 'light' ? 0.2 : 0);
    map.setPaintProperty('osm', 'raster-opacity', muted ? 0.8 : 1);
    map.setPaintProperty('hillshade', 'hillshade-exaggeration', basemap === 'light' ? 0.3 : 0.45);
    show('columns', threeD && columns);
    if (threeD) {
      map.setTerrain({ source: 'terrain-dem', exaggeration: TERRAIN_EXAGGERATION });
      map.setSky({ 'sky-color': '#9fd0f0', 'horizon-color': '#e8f4ea', 'fog-color': '#eef6ee', 'sky-horizon-blend': 0.6,
        'horizon-fog-blend': 0.4, 'fog-ground-blend': 0.5, 'atmosphere-blend': 0.6 });
      if (Math.abs(map.getPitch() - this.tilt()) > 5) map.easeTo({ pitch: this.tilt(), duration: 1000 });
    } else {
      map.setTerrain(null);
      if (map.getPitch() > 0) map.easeTo({ pitch: 0, duration: 800 });
    }
  }

  private highlight(id: string | null, plots: Row[], ready: boolean): void {
    const map = this.map;
    if (!map || !ready) return;
    if (this.selectedFeature !== null) map.setFeatureState({ source: 'plots', id: this.selectedFeature }, { selected: false });
    const index = id ? plots.findIndex((p) => p['id'] === id) : -1;
    this.selectedFeature = index >= 0 ? index : null;
    if (this.selectedFeature !== null) map.setFeatureState({ source: 'plots', id: this.selectedFeature }, { selected: true });
  }

  private hover(e: MapLayerMouseEvent): void {
    const map = this.map!;
    const id = e.features?.[0]?.id;
    if (typeof id !== 'number') return;
    map.getCanvas().style.cursor = 'pointer';
    if (this.hovered !== null && this.hovered !== id) map.setFeatureState({ source: 'plots', id: this.hovered }, { hover: false });
    this.hovered = id;
    map.setFeatureState({ source: 'plots', id }, { hover: true });
    const plot = this.plots()[id];
    if (!plot) return;
    this.popup ??= new Popup({ closeButton: false, closeOnClick: false, offset: 14, className: 'plot-popup' });
    // setText, not setHTML: plot codes and farmer names are user data
    this.popup.setLngLat([plot['longitude'], plot['latitude']]).setText(`${plot['farm_name'] ? plot['farm_name'] + ' · ' : ''}${plot['plot_code']} – ${plot['farmer_label']}`).addTo(map);
  }

  private hoverDevice(e: MapLayerMouseEvent): void {
    const map = this.map!;
    const id = e.features?.[0]?.id;
    const device = typeof id === 'number' ? this.devices()[id] : undefined;
    if (!device) return;
    map.getCanvas().style.cursor = 'pointer';
    this.popup ??= new Popup({ closeButton: false, closeOnClick: false, offset: 14, className: 'plot-popup' });
    this.popup.setLngLat([device['longitude'], device['latitude']])
      .setText(`${deviceKind(device['device_type']).label} · ${deviceId(device['device_code'])} – ${deviceState(device['reporting_state']).label}`)
      .addTo(map);
  }

  private unhover(): void {
    if (!this.map) return;
    this.map.getCanvas().style.cursor = '';
    if (this.hovered !== null) this.map.setFeatureState({ source: 'plots', id: this.hovered }, { hover: false });
    this.hovered = null;
    this.popup?.remove();
  }

  private startRotation(): void {
    if (this.frame || !this.map) return;
    this.zone.runOutsideAngular(() => {
      const spin = () => {
        if (!this.map) return;
        this.map.setBearing((this.map.getBearing() + 0.08) % 360);
        this.frame = requestAnimationFrame(spin);
      };
      this.frame = requestAnimationFrame(spin);
    });
  }

  private stopRotation(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }
}
