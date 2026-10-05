(function(root) {
  'use strict';
  const METHODS = ['낚시','족대','통발','뜰채','맨손','미상'];
  const IDENTIFICATIONS = ['확정','속 수준','미동정'];
  const DISPOSITIONS = ['현장 방생','어항 투입','관찰 후 방생','미상'];
  const FISHING_TYPES = ['민물','바다 연안','선상'];
  const FISHING_STATUS = ['미확인','허용','조건부','금지'];
  const TABLES = ['spots','trips','attempts','catches'];
  const empty = () => ({version:1, spots:[], trips:[], attempts:[], catches:[]});
  function validate(input) {
    const fail = message => { throw new Error(message); };
    if (!input || input.version !== 1) fail('지원하지 않는 기록 형식입니다 (version 1 필요).');
    const data = empty();
    const ids = {};
    for (const table of TABLES) {
      if (!Array.isArray(input[table]) || input[table].length > 50000) fail(`${table}: 목록 형식을 확인해 주세요.`);
      ids[table] = new Set();
      for (const row of input[table]) {
        if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(row.id)) fail(`${table}: 올바른 ID가 필요합니다.`);
        if (ids[table].has(row.id)) fail(`${table}: 중복 ID ${row.id}`);
        ids[table].add(row.id);
      }
    }
    function text(row, key, required=false) {
      const value = row[key] ?? '';
      if (typeof value !== 'string' || value.length > 4000 || (required && !value.trim())) fail(`${row.id}: ${key} 값을 확인해 주세요.`);
      return value.trim();
    }
    function number(row, key, min=0, integer=false) {
      const value = row[key];
      if (value === null || value === undefined || value === '') return null;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || (integer && !Number.isInteger(value))) fail(`${row.id}: ${key} 값은 ${min} 이상의 숫자여야 합니다.`);
      return value;
    }
    function ref(row, key, table) {
      if (!ids[table].has(row[key])) fail(`${row.id}: 연결된 ${table} 기록이 없습니다.`);
      return row[key];
    }
    function option(row, key, choices) {
      if (!choices.includes(row[key])) fail(`${row.id}: ${key} 값이 잘못되었습니다.`);
      return row[key];
    }
    for (const r of input.spots) {
      if (!Number.isFinite(r.lat) || !Number.isFinite(r.lon) || Math.abs(r.lat)>90 || Math.abs(r.lon)>180) fail(`${r.id}: 좌표를 확인해 주세요.`);
      const spot={id:r.id,name:text(r,'name',true),lat:r.lat,lon:r.lon,coordinate_note:text(r,'coordinate_note')};
      if(r.fishing !== undefined){
        const f=r.fishing;
        if(!f || typeof f!=='object' || Array.isArray(f)) fail(`${r.id}: 낚시 포인트 정보를 확인해 주세요.`);
        const status=option(f,'status',FISHING_STATUS), checked_at=text(f,'checked_at'), source_url=text(f,'source_url');
        if(checked_at && (!/^\d{4}-\d{2}-\d{2}$/.test(checked_at) || !Number.isFinite(Date.parse(checked_at)) || new Date(checked_at).toISOString().slice(0,10)!==checked_at)) fail('포인트 확인일을 확인해 주세요.');
        if(source_url){
          let url;try{url=new URL(source_url);}catch{fail('근거 주소는 HTTPS 주소로 입력해 주세요.');}
          if(url.protocol!=='https:' || !url.hostname || url.username || url.password) fail('근거 주소는 HTTPS 주소로 입력해 주세요.');
        }
        if(status!=='미확인' && (!checked_at || !source_url)) fail('낚시 가능 여부에는 확인일과 HTTPS 근거가 필요합니다.');
        const note=text(f,'note');
        if(status==='조건부'&&!note) fail('조건부 허용의 조건을 메모에 적어 주세요.');
        spot.fishing={type:option(f,'type',FISHING_TYPES),targets:text(f,'targets'),status,checked_at,source_url,note};
      }
      data.spots.push(spot);
    }
    for (const r of input.trips) {
      if (typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !Number.isFinite(Date.parse(r.date)) || new Date(r.date).toISOString().slice(0,10)!==r.date) fail(`${r.id}: 방문 날짜를 확인해 주세요.`);
      data.trips.push({id:r.id,spot_id:ref(r,'spot_id','spots'),date:r.date,summary:text(r,'summary',true),source:text(r,'source')});
    }
    for (const r of input.attempts) {
      data.attempts.push({id:r.id,trip_id:ref(r,'trip_id','trips'),method:option(r,'method',METHODS),detail:text(r,'detail'),minutes:number(r,'minutes'),effort_count:number(r,'effort_count',0,true),outcome:option(r,'outcome',['caught','zero','unknown'])});
    }
    for (const r of input.catches) {
      data.catches.push({id:r.id,attempt_id:ref(r,'attempt_id','attempts'),species:text(r,'species',true),count:number(r,'count',1,true),identification:option(r,'identification',IDENTIFICATIONS),disposition:option(r,'disposition',DISPOSITIONS),note:text(r,'note')});
    }
    for (const trip of data.trips) {
      if (!data.attempts.some(a=>a.trip_id===trip.id)) fail(`${trip.id}: 채집시도가 최소 1개 필요합니다. 미기록이면 방법을 미상으로 남겨 주세요.`);
    }
    for (const attempt of data.attempts) {
      const hasCatch = data.catches.some(c=>c.attempt_id===attempt.id);
      if (hasCatch !== (attempt.outcome==='caught')) fail(`${attempt.id}: 조과 유무와 조과 목록이 일치하지 않습니다.`);
    }
    return data;
  }
  function merge(current, incoming) {
    const a=validate(current), b=validate(incoming), combined=empty();
    for (const table of TABLES) {
      const rows = new Map(a[table].map(r=>[r.id,r]));
      for (const row of b[table]) {
        const old = rows.get(row.id);
        if (old && JSON.stringify(old)!==JSON.stringify(row)) throw new Error(`${table}: ${row.id}가 기존 기록과 다릅니다. ID 충돌을 해결한 뒤 가져와 주세요.`);
        rows.set(row.id,row);
      }
      combined[table]=[...rows.values()];
    }
    return validate(combined);
  }
  function summary(data, spotId) {
    const trips=data.trips.filter(t=>t.spot_id===spotId);
    const tripIds=new Set(trips.map(t=>t.id));
    const attempts=data.attempts.filter(a=>tripIds.has(a.trip_id));
    const attemptsIds=new Set(attempts.map(a=>a.id));
    const catches=data.catches.filter(c=>attemptsIds.has(c.attempt_id));
    const methods=METHODS.map(method=>{
      const rows=attempts.filter(a=>a.method===method), known=rows.filter(a=>a.outcome!=='unknown');
      return {method,total:rows.length,known:known.length,success:known.filter(a=>a.outcome==='caught').length,
        minutes:rows.reduce((n,a)=>n+(a.minutes??0),0),timed:rows.filter(a=>a.minutes!==null).length};
    }).filter(m=>m.total);
    return {trips,attempts,catches,methods};
  }
  function combineSpots(publicSpots, personalSpots){
    const spots=new Map(publicSpots.map(s=>[s.id,{...s}]));
    for(const s of personalSpots){
      const original=spots.get(s.id);
      spots.set(s.id,{rules:[],access:'미확인',parking:'미확인',child_safety:'미확인',facilities:'미확인',...original,...s,source:original?.source||'개인 기록'});
    }
    return [...spots.values()];
  }
  const api={empty,validate,merge,summary,combineSpots,METHODS,IDENTIFICATIONS,DISPOSITIONS,FISHING_TYPES,FISHING_STATUS};
  if(typeof module!=='undefined') module.exports=api; else root.PersonalRecords=api;
})(typeof window!=='undefined'?window:globalThis);
