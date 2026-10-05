/* Pure data helpers shared by the browser and regression tests. */
(function (root) {
  'use strict';
  function filteredYears(row, year, observationsOnly) {
    return row[4].filter(([y, total, observations]) =>
      (year <= 1980 || (y && y >= year)) && (observationsOnly ? observations : total) > 0);
  }
  function countRow(row, year, observationsOnly) {
    return filteredYears(row, year, observationsOnly).reduce((sum, r) => sum + r[observationsOnly ? 2 : 1], 0);
  }
  function uniqueLocations(rows) {
    return new Set(rows.map(r => `${r[0]},${r[1]}`)).size;
  }
  function searchPlaces(entries, term) {
    const exact = entries.filter(e => e[0] === term);
    return exact.length ? exact : entries.filter(e => e[0].includes(term));
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function speciesVisible(species, category) {
    return category === 'all' || (species[4] || 'freshwater') === category;
  }
  function speciesMatches(species, term) {
    const q=term.trim().toLowerCase();
    return [species[0],species[1],...(species[5]||[])].some(name=>name.toLowerCase().includes(q));
  }
  function collectionDate(value) {
    const date=new Date(value);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date) : '미기록';
  }
  function nearbyPlace(lat,lon,places){
    let nearest=null, distance=Infinity;
    for(const p of places){
      const d=Math.hypot((p.lat-lat)*111,(p.lon-lon)*111*Math.cos(lat*Math.PI/180));
      if(d<distance){distance=d;nearest=p;}
    }
    return nearest&&distance<=30?`가까운 시군: ${nearest.name} (중심 약 ${Math.round(distance)} km · 행정구역 미확인)`:'국내 시군 위치 미확인';
  }
  function encodeView(view) {
    return '#'+new URLSearchParams({lat:view.lat.toFixed(5),lon:view.lon.toFixed(5),z:String(view.zoom),y:String(view.year),obs:view.observations?'1':'0',sp:view.species.join(','),...(view.category?{category:view.category}:{})});
  }
  function parseView(hash, species) {
    if (!hash || hash.length>10000) return null;
    const params=new URLSearchParams(hash.replace(/^#/,''));
    if(!['lat','lon','z','y','obs','sp'].every(k=>params.has(k)))return null;
    const lat=Number(params.get('lat')),lon=Number(params.get('lon')),zoom=Number(params.get('z')),year=Number(params.get('y'));
    if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lon)||Math.abs(lon)>180||!Number.isInteger(zoom)||zoom<3||zoom>18||!Number.isInteger(year)||year<1980||year>2100)return null;
    const category=params.get('category');
    if(category&&!['all','freshwater','marine'].includes(category))return null;
    return {lat,lon,zoom,year,observations:params.get('obs')==='1',species:[...new Set(params.get('sp').split(',').filter(s=>species.includes(s)))],...(category?{category}:{})};
  }
  const api = { filteredYears, countRow, uniqueLocations, searchPlaces, escapeHtml, encodeView, parseView, speciesVisible, speciesMatches, collectionDate, nearbyPlace };
  if (typeof module !== 'undefined') module.exports = api;
  else root.MapCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
