import React, { useEffect } from 'react';
export default function Map({ center=[45,25], markers=[] }){
  useEffect(()=>{ import('leaflet').then(L=>{ const map = L.map('map').setView(center, 13); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map); markers.forEach(m=>L.marker([m.lat,m.lon]).addTo(map)); }); }, []);
  return <div id="map" style={{height: '400px'}}></div>;
}
