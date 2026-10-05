import { mapCamera } from './camera';
import type { MapProps } from './types';

export function mapUpdate(props: MapProps) {
  return {
    places: (props.places ?? []).map(place => ({ id: place.id, title: place.title, latitude: place.latitude, longitude: place.longitude })),
    camera: mapCamera(props), origin: props.origin ?? null, selected: props.selected ?? null,
    selectedId: props.selectedId ?? null, selectable: !!props.selectable,
    edgeToEdge: !!props.edgeToEdge,
  };
}

/** User text remains JSON data and is inserted with textContent, never as markup. */
function scriptData(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export function mapNativeUpdate(props: MapProps, bridge: string) {
  return `window.derivaMapUpdate&&window.derivaMapUpdate(${scriptData({ derivaMap: bridge, type: 'update', payload: mapUpdate(props) })});true;`;
}

export function mapDocument(props: MapProps, bridge: string, transport: 'browser' | 'native' = 'browser') {
  const data = scriptData({ bridge, ...mapUpdate(props) });
  return `<!doctype html><html lang="es"><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<meta name="referrer" content="strict-origin-when-cross-origin">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<style>
html,body,#map{height:100%;width:100%;margin:0;background:#171D1B;font-family:system-ui,sans-serif}
.leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) saturate(.22) brightness(.85) contrast(.85)}
.leaflet-control-attribution{font-size:9px!important;background:rgba(21,24,26,.94)!important;color:#ACB5B1!important}
.leaflet-control-attribution a{color:#C5ED95}
.pin{display:flex;align-items:center;justify-content:center;height:30px;width:30px;border-radius:50% 50% 50% 5px;transform:rotate(-45deg);background:#C5ED95;border:3px solid #15181A;box-shadow:0 2px 8px #0008}
.pin span{transform:rotate(45deg);color:#142015;font-size:19px;font-weight:800;line-height:1}
.pin.selected{background:#F1F4F2;border-color:#C5ED95;transform:rotate(-45deg) scale(1.16)}
.origin{height:14px;width:14px;background:#669EFA;border:3px solid #F1F4F2;border-radius:50%;box-shadow:0 0 0 7px #669EFA25}
.target{height:22px;width:22px;background:#15181A;border:3px solid #C5ED95;border-radius:50%;box-shadow:0 0 0 7px #C5ED9525}
.leaflet-tooltip{background:#15181A;color:#F1F4F2;border:1px solid #303735;box-shadow:none;font-size:12px;padding:7px 10px}
</style></head><body><div id="map" role="application" aria-label="Mapa de lugares"></div>
<script>
const data=${data};
function send(payload){const message=JSON.stringify(Object.assign({derivaMap:data.bridge},payload));${transport === 'native' ? "window.ReactNativeWebView.postMessage(message);" : "window.parent.postMessage(message,'*');"}}
let ready=false;const timeout=setTimeout(()=>{if(!ready)send({type:'error'});},12000);
function valid(c){return c&&Number.isFinite(c.latitude)&&Number.isFinite(c.longitude)&&Math.abs(c.latitude)<=90&&Math.abs(c.longitude)<=180;}
function init(){try{
if(!window.L){send({type:'error'});return;}
const map=L.map('map',{zoomControl:false,attributionControl:true}).setView([data.camera.center.latitude,data.camera.center.longitude],data.camera.zoom);
const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'}).addTo(map);
let failures=0,loadedTiles=0;
tiles.on('loading',()=>{failures=0;loadedTiles=0;});
tiles.on('tileerror',()=>{if(++failures===6)send({type:'error'});});
tiles.on('tileload',()=>{loadedTiles++;});
tiles.on('load',()=>{if(loadedTiles>0){ready=true;clearTimeout(timeout);send({type:'ready'});}else send({type:'error'});});
let current=data,lastCameraKey=null,origin=null,target=null;const markers=new Map();
function update(next){
current=next;
const attribution=document.querySelector('.leaflet-control-attribution');if(attribution)attribution.style.marginBottom=next.edgeToEdge?'1px':'0';
const active=new Set(next.places.map(p=>p.id));
markers.forEach((marker,id)=>{if(!active.has(id)){marker.remove();markers.delete(id);}});
next.places.forEach(p=>{
if(!valid(p))return;
const icon=L.divIcon({className:'',html:'<div class="pin '+(p.id===next.selectedId?'selected':'')+'"><span>?</span></div>',iconSize:[36,36],iconAnchor:[18,34]});
let marker=markers.get(p.id);
if(!marker){marker=L.marker([p.latitude,p.longitude],{icon,title:p.title,keyboard:true}).addTo(map);marker.on('click',()=>send({type:'place',id:p.id}));markers.set(p.id,marker);}else{marker.setLatLng([p.latitude,p.longitude]);marker.setIcon(icon);}
const label=document.createElement('span');label.textContent=p.title;marker.unbindTooltip().bindTooltip(label,{direction:'top',offset:[0,-24]});
});
if(valid(next.origin)){
if(origin)origin.setLatLng([next.origin.latitude,next.origin.longitude]);else origin=L.marker([next.origin.latitude,next.origin.longitude],{icon:L.divIcon({className:'',html:'<div class="origin"></div>',iconSize:[20,20],iconAnchor:[10,10]}),title:'Tu ubicación',zIndexOffset:1000}).addTo(map);
}else if(origin){origin.remove();origin=null;}
if(valid(next.selected)){
if(target)target.setLatLng([next.selected.latitude,next.selected.longitude]);else target=L.marker([next.selected.latitude,next.selected.longitude],{icon:L.divIcon({className:'',html:'<div class="target"></div>',iconSize:[26,26],iconAnchor:[13,13]}),title:'Punto elegido'}).addTo(map);
}else if(target){target.remove();target=null;}
if(next.camera&&valid(next.camera.center)&&next.camera.key!==lastCameraKey){map.setView([next.camera.center.latitude,next.camera.center.longitude],next.camera.zoom,{animate:false});lastCameraKey=next.camera.key;}
}
map.on('click',e=>{if(!current.selectable)return;send({type:'coordinate',latitude:e.latlng.lat,longitude:((e.latlng.lng+180)%360+360)%360-180});});
function receive(message){
if(!message||message.derivaMap!==data.bridge||message.type!=='update'||!message.payload||!Array.isArray(message.payload.places))return;
update(message.payload);
}
${transport === 'native' ? 'window.derivaMapUpdate=receive;' : "window.addEventListener('message',event=>{if(event.source===window.parent)receive(event.data);});"}
new ResizeObserver(()=>map.invalidateSize()).observe(document.getElementById('map'));
update(data);send({type:'initialized'});
}catch(e){send({type:'error'});}}
</script>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin="" onload="init()" onerror="send({type:'error'})"></script>
</body></html>`;
}
