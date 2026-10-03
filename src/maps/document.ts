import type { MapProps } from './types';

/** User text remains JSON data and is inserted with textContent, never as markup. */
export function mapDocument(props: MapProps, bridge: string) {
  const data = JSON.stringify({
    bridge,
    places: (props.places ?? []).map(p => ({ id: p.id, title: p.title, latitude: p.latitude, longitude: p.longitude })),
    center: props.center ?? null,
    origin: props.origin ?? null,
    selected: props.selected ?? null,
    selectedId: props.selectedId ?? null,
    selectable: !!props.selectable,
  }).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  return `<!doctype html><html lang="es"><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<meta name="referrer" content="strict-origin-when-cross-origin">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<style>
html,body,#map{height:100%;width:100%;margin:0;background:#E9EDE2;font-family:system-ui,sans-serif}
.leaflet-tile-pane{filter:saturate(.55)}
.leaflet-control-attribution{font-size:9px!important;background:rgba(255,253,247,.85)!important}
.leaflet-control-attribution a{color:#386B50}
.leaflet-bar{border:1px solid #DCDDD2!important;box-shadow:none!important;border-radius:8px!important;overflow:hidden}
.leaflet-bar a{width:40px!important;height:40px!important;line-height:40px!important;color:#183B32!important;background:#FFFDF7!important}
.pin{display:flex;align-items:center;justify-content:center;height:30px;width:30px;border-radius:50% 50% 50% 5px;transform:rotate(-45deg);background:#183B32;border:3px solid #FFFDF7;box-shadow:0 2px 8px #183B3233}
.pin span{transform:rotate(45deg);color:#DFFB72;font-size:12px;font-weight:700}
.pin.selected{background:#DFFB72}.pin.selected span{color:#183B32}
.origin{height:14px;width:14px;background:#386B50;border:3px solid white;border-radius:50%;box-shadow:0 0 0 6px #386B5033}
.target{height:20px;width:20px;background:#DFFB72;border:3px solid #183B32;border-radius:50%;box-shadow:0 0 0 8px #DFFB7233}
.leaflet-tooltip{background:#FFFDF7;color:#183B32;border:1px solid #DCDDD2;box-shadow:none;font-size:12px;padding:7px 10px}
</style></head><body><div id="map" role="application" aria-label="Mapa de lugares"></div>
<script>
const data=${data};
function send(payload){const m=JSON.stringify(Object.assign({derivaMap:data.bridge},payload));if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(m);else window.parent.postMessage(m,'*');}
let ready=false;const timeout=setTimeout(()=>{if(!ready)send({type:'error'});},12000);
function init(){try{
if(!window.L){send({type:'error'});return;}
const center=data.center||data.selected||data.origin||data.places[0]||{latitude:29.072967,longitude:-110.955919};
const map=L.map('map',{zoomControl:false,attributionControl:true}).setView([center.latitude,center.longitude],14);
L.control.zoom({position:'bottomright'}).addTo(map);
const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'}).addTo(map);
let failures=0;tiles.on('tileerror',()=>{if(++failures===6)send({type:'error'});});tiles.on('tileload',()=>{if(failures){failures=0;send({type:'ready'});}});
data.places.forEach((p,i)=>{
const icon=L.divIcon({className:'',html:'<div class="pin '+(p.id===data.selectedId?'selected':'')+'"><span>'+String(i+1)+'</span></div>',iconSize:[36,36],iconAnchor:[18,34]});
const marker=L.marker([p.latitude,p.longitude],{icon,title:p.title}).addTo(map);
const label=document.createElement('span');label.textContent=p.title;marker.bindTooltip(label,{direction:'top',offset:[0,-24]});
marker.on('click',()=>send({type:'place',id:p.id}));
});
if(data.places.length>1&&!data.center&&!data.origin&&!data.selected){map.fitBounds(data.places.map(p=>[p.latitude,p.longitude]),{padding:[48,48],maxZoom:14});}
if(data.origin){L.marker([data.origin.latitude,data.origin.longitude],{icon:L.divIcon({className:'',html:'<div class="origin"></div>',iconSize:[20,20],iconAnchor:[10,10]}),title:'Tu ubicación GPS'}).addTo(map);}
let target=null;
function showTarget(c){if(target)target.remove();target=L.marker([c.latitude,c.longitude],{icon:L.divIcon({className:'',html:'<div class="target"></div>',iconSize:[26,26],iconAnchor:[13,13]}),title:'Ubicación elegida'}).addTo(map);}
if(data.selected)showTarget(data.selected);
if(data.selectable)map.on('click',e=>{const c={latitude:e.latlng.lat,longitude:((e.latlng.lng+180)%360+360)%360-180};showTarget(c);send(Object.assign({type:'coordinate'},c));});
ready=true;clearTimeout(timeout);send({type:'ready'});setTimeout(()=>map.invalidateSize(),100);
}catch(e){send({type:'error'});}}
</script>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin="" onload="init()" onerror="send({type:'error'})"></script>
</body></html>`;
}
