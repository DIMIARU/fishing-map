(function () {
  'use strict';
  const R=PersonalRecords, esc=MapCore.escapeHtml, app=FishingMap;
  const KEY='fishing-map-records-v1';
  const $=id=>document.getElementById(id);
  let data=R.empty(), storageBlocked=false;
  function feedback(message,error=false){$('record-feedback').textContent=message;$('record-feedback').className=error?'error':'muted';}
  try {
    const stored=localStorage.getItem(KEY);
    if(stored) data=R.validate(JSON.parse(stored));
  } catch(error) {
    storageBlocked=true;
    feedback('저장된 기록을 읽지 못했습니다. 원본 보호를 위해 저장을 중단했습니다. 내보내기로 원본을 보관해 주세요. '+error.message,true);
  }
  function commit(next){
    if(storageBlocked) throw new Error('기존 기록을 읽지 못해 저장할 수 없습니다. 원본을 내보낸 뒤 파일을 확인해 주세요.');
    const valid=R.validate(next);
    try { localStorage.setItem(KEY,JSON.stringify(valid)); }
    catch { throw new Error('브라우저 저장에 실패했습니다. 저장 공간·브라우저 설정을 확인해 주세요. 기존 기록은 유지됩니다.'); }
    data=valid;render();
  }
  function render(){
    app.setPersonal(data);
    const list=$('record-list');list.replaceChildren();
    if(!data.trips.length){const p=document.createElement('p');p.className='muted';p.textContent='아직 방문 기록이 없습니다. 방문을 추가하거나 기존 기록 파일을 가져오세요.';list.append(p);return;}
    for(const trip of [...data.trips].sort((a,b)=>b.date.localeCompare(a.date))){
      const spot=data.spots.find(s=>s.id===trip.spot_id);
      const attempts=data.attempts.filter(a=>a.trip_id===trip.id);
      const block=document.createElement('article');block.className='trip-entry';
      block.innerHTML=`<h3>${esc(trip.date)} · ${esc(spot.name)}</h3><p>${esc(trip.summary)}</p>`;
      for(const attempt of attempts){
        const catches=data.catches.filter(c=>c.attempt_id===attempt.id);
        const body=document.createElement('p');body.className='muted';
        body.innerHTML=`${esc(attempt.method)} · ${attempt.minutes===null?'시간 미기록':attempt.minutes+'분'} · ${attempt.effort_count===null?'횟수 미기록':attempt.effort_count+'회/개'}<br>${esc(attempt.detail)}<br>${catches.length?catches.map(c=>`${esc(c.species)} (${esc(c.identification)}) · ${c.count===null?'마릿수 미상':c.count+'마리'} · ${esc(c.disposition)}${c.note?'<br>'+esc(c.note):''}`).join('<br>'):attempt.outcome==='zero'?'조과 0':'조과 여부 미상'}`;
        block.append(body);
      }
      if(trip.source){const source=document.createElement('p');source.className='muted';source.textContent='출처: '+trip.source;block.append(source);}
      const button=document.createElement('button');button.type='button';button.textContent='장소 보기';button.onclick=()=>app.showSpot(trip.spot_id);block.append(button);list.append(block);
    }
  }
  function download(content,name){
    const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  $('export-records').onclick=()=>{
    try {
      const content=storageBlocked?localStorage.getItem(KEY):JSON.stringify(data,null,2);
      if(content===null) throw new Error('읽을 수 있는 저장 기록이 없습니다.');
      download(content,storageBlocked?'fishing-map-records-recovery.json':'fishing-map-records.json');
      feedback('기록 파일을 내보냈습니다. 다른 브라우저에서는 가져오기를 사용하세요.');
    } catch(error){feedback(error.message,true);}
  };
  $('import-records').onclick=()=>$('record-file').click();
  $('record-file').onchange=async event=>{
    const file=event.target.files[0];if(!file)return;
    try{
      if(file.size>10*1024*1024) throw new Error('10MB 이하의 기록 파일을 선택해 주세요.');
      const incoming=R.validate(JSON.parse(await file.text()));
      const before=data.trips.length, pointsBefore=data.spots.filter(s=>s.fishing).length;
      commit(R.merge(data,incoming));
      feedback(`방문 ${data.trips.length-before}건, 낚시 포인트 ${data.spots.filter(s=>s.fishing).length-pointsBefore}개를 추가했습니다. 같은 ID의 동일 기록은 중복 저장하지 않습니다.`);
    }catch(error){feedback('가져오기 실패: '+error.message,true);}
    event.target.value='';
  };
  const uid=prefix=>prefix+'-'+crypto.randomUUID();
  const options=(values,selected)=>values.map(v=>`<option${v===selected?' selected':''}>${esc(v)}</option>`).join('');
  const maybeNumber=value=>value.trim()===''?null:Number(value);
  let editingSpot=null;
  app.onEditFishing=spot=>{
    editingSpot=spot;$('fishing-form').reset();$('fishing-error').textContent='';
    $('fishing-title').textContent=spot.fishing?'낚시 포인트 수정':'낚시 포인트 추가';
    $('fishing-name').value=spot.name||'';$('fishing-lat').value=spot.lat;$('fishing-lon').value=spot.lon;
    const f=spot.fishing||{};
    for(const [id,key] of [['type','type'],['targets','targets'],['status','status'],['checked','checked_at'],['source','source_url'],['note','note']]){
      if(f[key])$('fishing-'+id).value=f[key];
    }
    $('remove-fishing').hidden=$('remove-fishing-note').hidden=!spot.fishing;
    $('fishing-dialog').showModal();
  };
  $('close-fishing').onclick=()=>$('fishing-dialog').close();
  $('fishing-form').onsubmit=event=>{
    event.preventDefault();
    try{
      const next=structuredClone(data), id=editingSpot.id||uid('spot');
      const spot={id,name:$('fishing-name').value,lat:maybeNumber($('fishing-lat').value),lon:maybeNumber($('fishing-lon').value),coordinate_note:editingSpot.coordinate_note||'직접 입력 · 현장 위치 미확인',
        fishing:{type:$('fishing-type').value,targets:$('fishing-targets').value,status:$('fishing-status').value,checked_at:$('fishing-checked').value,source_url:$('fishing-source').value,note:$('fishing-note').value}};
      if(spot.lat!==editingSpot.lat||spot.lon!==editingSpot.lon)spot.coordinate_note='좌표 직접 수정 · 현장 위치 미확인';
      const index=next.spots.findIndex(s=>s.id===id);
      if(index<0)next.spots.push(spot);else next.spots[index]=spot;
      commit(next);$('fishing-dialog').close();app.showFishing();app.showSpot(id);
    }catch(error){$('fishing-error').textContent=error.message;}
  };
  $('remove-fishing').onclick=()=>{
    try{
      const next=structuredClone(data),spot=next.spots.find(s=>s.id===editingSpot.id);
      if(spot)delete spot.fishing;
      commit(next);$('fishing-dialog').close();app.setViewTab('fishing');
    }catch(error){$('fishing-error').textContent=error.message;}
  };
  function addCatch(attempt){
    const entry=document.createElement('div');entry.className='catch-entry';
    entry.innerHTML=`<div class="form-grid">
      <label>어종<input name="species" required maxlength="4000" placeholder="예: 밀어 또는 갈문망둑"></label>
      <label>마릿수<input name="count" type="number" min="1" step="1" placeholder="미상"></label>
      <label>동정 확신도<select name="identification">${options(R.IDENTIFICATIONS,'미동정')}</select></label>
      <label>처리<select name="disposition">${options(R.DISPOSITIONS,'미상')}</select></label>
      <label class="wide">조과 메모<input name="note" maxlength="4000"></label>
    </div><button type="button" class="remove-catch">이 조과 제외</button>`;
    entry.querySelector('.remove-catch').onclick=()=>entry.remove();
    attempt.querySelector('.catch-entries').append(entry);
  }
  function addAttempt(){
    const fieldset=document.createElement('fieldset');fieldset.className='attempt-entry';
    fieldset.innerHTML=`<legend>채집시도</legend><div class="form-grid">
      <label>방법<select name="method">${options(R.METHODS,'미상')}</select></label>
      <label>시간 (분)<input name="minutes" type="number" min="0" step="any" placeholder="미상"></label>
      <label>투입 횟수·통발 개수<input name="effort_count" type="number" min="0" step="1" placeholder="미상"></label>
      <label>결과<select name="outcome"><option value="unknown">미기록</option><option value="zero">조과 0</option><option value="caught">조과 있음</option></select></label>
      <label class="wide">채비·미끼·노력량 메모<input name="detail" maxlength="4000" placeholder="예: 통발 2개, 30분 설치"></label>
      </div><div class="catch-section" hidden><div class="catch-entries"></div><button type="button" class="add-catch">어종 추가</button></div>
      <p class="muted">결과가 조과 있음일 때만 아래 조과를 저장합니다.</p><button type="button" class="remove-attempt">이 시도 제외</button>`;
    fieldset.querySelector('.remove-attempt').onclick=()=>fieldset.remove();
    fieldset.querySelector('.add-catch').onclick=()=>addCatch(fieldset);
    fieldset.querySelector('[name=outcome]').onchange=e=>{
      const section=fieldset.querySelector('.catch-section');section.hidden=e.target.value!=='caught';
      if(!section.hidden&&!section.querySelector('.catch-entry')) addCatch(fieldset);
      section.querySelectorAll('input,select').forEach(el=>el.disabled=section.hidden);
    };
    $('attempt-entries').append(fieldset);
  }
  function openTrip(spotId){
    $('trip-form').reset();$('attempt-entries').replaceChildren();$('trip-error').textContent='';
    $('trip-spot').innerHTML=app.allSpots().map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')+'<option value="__new__">새 장소 등록</option>';
    $('new-spot-fields').hidden=true;$('new-spot-fields').querySelectorAll('input').forEach(el=>el.disabled=true);
    if(spotId)$('trip-spot').value=spotId;
    const now=new Date();$('trip-date').value=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
    addAttempt();$('trip-dialog').showModal();
  }
  $('trip-spot').onchange=()=>{
    const isNew=$('trip-spot').value==='__new__';$('new-spot-fields').hidden=!isNew;
    $('new-spot-fields').querySelectorAll('input').forEach(el=>el.disabled=!isNew);
    ['new-spot-name','new-spot-lat','new-spot-lon'].forEach(id=>$(id).required=isNew);
  };
  $('new-trip').onclick=()=>openTrip();app.onNewTrip=openTrip;
  $('add-attempt').onclick=addAttempt;
  $('close-trip').onclick=()=>$('trip-dialog').close();
  $('trip-form').onsubmit=event=>{
    event.preventDefault();
    try{
      const next=JSON.parse(JSON.stringify(data));
      const spot=$('trip-spot').value==='__new__'?{
        id:uid('spot'),name:$('new-spot-name').value,lat:maybeNumber($('new-spot-lat').value),lon:maybeNumber($('new-spot-lon').value),coordinate_note:$('new-spot-note').value||'정확도 미기록'
      }:app.allSpots().find(s=>s.id===$('trip-spot').value);
      if(!spot) throw new Error('장소를 선택해 주세요.');
      if(!next.spots.some(s=>s.id===spot.id)) next.spots.push({id:spot.id,name:spot.name,lat:spot.lat,lon:spot.lon,coordinate_note:spot.coordinate_note||''});
      const tripId=uid('trip');
      next.trips.push({id:tripId,spot_id:spot.id,date:$('trip-date').value,summary:$('trip-summary').value,source:'직접 입력'});
      for(const entry of $('attempt-entries').querySelectorAll('.attempt-entry')){
        const value=name=>entry.querySelector(`[name=${name}]`).value;
        const attemptId=uid('attempt');
        next.attempts.push({id:attemptId,trip_id:tripId,method:value('method'),detail:value('detail'),minutes:maybeNumber(value('minutes')),effort_count:maybeNumber(value('effort_count')),outcome:value('outcome')});
        if(value('outcome')==='caught') for(const catchEntry of entry.querySelectorAll('.catch-entry')){
          const cvalue=name=>catchEntry.querySelector(`[name=${name}]`).value;
          next.catches.push({id:uid('catch'),attempt_id:attemptId,species:cvalue('species'),count:maybeNumber(cvalue('count')),identification:cvalue('identification'),disposition:cvalue('disposition'),note:cvalue('note')});
        }
      }
      commit(next);$('trip-dialog').close();app.setViewTab('records');feedback('방문 기록을 저장했습니다. 내보내기로 백업해 두세요.');
    }catch(error){$('trip-error').textContent=error.message;}
  };
  window.addEventListener('storage',event=>{
    if(event.key!==KEY)return;
    try{data=event.newValue?R.validate(JSON.parse(event.newValue)):R.empty();storageBlocked=false;render();feedback('다른 창에서 변경한 기록을 반영했습니다.');}
    catch{storageBlocked=true;feedback('다른 창의 기록을 읽지 못했습니다. 원본을 내보내 확인해 주세요.',true);}
  });
  render();
})();
