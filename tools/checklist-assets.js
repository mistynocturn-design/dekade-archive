(function(){
  'use strict';
  var BASE='/dekade-archive/',rootHandle=null,folderHandle=null,parts=[],nextNumber=1,kind='checklist';
  function $(id){return document.getElementById(id)}
  function isImage(){return kind==='pair-template'}
  function show(text,ready){$('assetStatus').innerHTML=text;$('assetStatus').style.color=ready?'#4f765c':'#8a6464'}
  function paths(){return $('pdfs').value.split(/\r?\n/).map(function(x){return x.trim()}).filter(Boolean)}
  function appendPath(path){var values=paths();if(values.indexOf(path)<0)values.push(path);$('pdfs').value=values.join('\n');$('pdfs').dispatchEvent(new Event('input',{bubbles:true}))}
  async function scanNextNumber(){var max=0,pattern=isImage()?/^image(\d+)\.[a-z0-9]+$/i:/^sheet(\d+)\.pdf$/i;for await(var entry of folderHandle.values()){if(entry.kind!=='file')continue;var match=entry.name.match(pattern);if(match)max=Math.max(max,Number(match[1]))}nextNumber=max+1}
  function nextName(extension){return(isImage()?'image':'sheet')+nextNumber+'.'+extension}
  function extensionOf(file){if(!isImage())return'pdf';var name=String(file.name||''),match=name.match(/\.([a-z0-9]+)$/i),ext=(match?match[1]:'png').toLowerCase();return ext==='jpeg'?'jpg':ext}
  function refreshPicker(){input.accept=isImage()?'image/*':'application/pdf';button.textContent=isImage()?'이미지 파일 추가':'PDF 파일 추가';$('connectAssets').textContent=isImage()?'이미지 저장 폴더 연결':'PDF 저장 폴더 연결';if(folderHandle)scanNextNumber().then(function(){show('연결 완료: <code>'+parts.join('/')+'/</code> · 다음 파일은 <strong>'+nextName(isImage()?'png':'pdf')+'</strong>부터 저장됩니다.',true)});else show('먼저 '+(isImage()?'이미지':'PDF')+' 저장 폴더를 연결하세요.',false)}
  async function connect(){if(folderHandle)return true;if(!window.showDirectoryPicker){show('폴더 연결은 Chrome 또는 Edge에서 사용할 수 있습니다.',false);return false}try{show('먼저 <strong>dekade-archive</strong> 저장소 폴더를 선택하세요.',false);rootHandle=await window.showDirectoryPicker({id:'dekade-checklist-root',mode:'readwrite'});window.alert('이제 assets/checklists 안의 이 항목 전용 폴더를 선택하세요. 새 폴더를 만들어도 됩니다.');folderHandle=await window.showDirectoryPicker({id:'dekade-checklist-assets',mode:'readwrite',startIn:rootHandle});parts=await rootHandle.resolve(folderHandle);if(!parts||parts.length<3||parts[0].toLowerCase()!=='assets'||parts[1].toLowerCase()!=='checklists'){folderHandle=null;parts=[];throw Error('assets/checklists 안의 항목별 폴더를 선택하세요.')}await scanNextNumber();refreshPicker();return true}catch(error){if(error.name!=='AbortError')show(error.message,false);return false}}
  async function saveAsset(file){var ext=extensionOf(file),targetName=nextName(ext),path=BASE+parts.join('/')+'/'+targetName;show('<strong>'+targetName+'</strong> 저장 중…',true);try{var handle=await folderHandle.getFileHandle(targetName,{create:true}),writable=await handle.createWritable();await writable.write(file);await writable.close();appendPath(path);nextNumber+=1;show('<strong>'+targetName+'</strong> 저장 완료 · '+paths().length+'개 등록됨',true);return true}catch(error){show('파일 저장에 실패했습니다: '+error.message,false);return false}}
  var style=document.createElement('style');style.textContent='.asset-pick{display:inline-flex;margin-top:4px}.asset-pick input{height:1px;opacity:0;position:absolute;width:1px}.asset-pick button{background:#fff;border:1px solid #cbc6ca;border-radius:4px;color:#6c646b;cursor:pointer;font-size:.59rem;font-weight:750;padding:6px 8px}';document.head.appendChild(style);
  var wrap=document.createElement('span');wrap.className='asset-pick';wrap.innerHTML='<input id="checklistAssetFile" type="file" accept="application/pdf" multiple><button type="button">PDF 파일 추가</button>';var input=wrap.querySelector('input'),button=wrap.querySelector('button');$('pdfs').insertAdjacentElement('afterend',wrap);
  button.onclick=function(){if(!folderHandle){show('먼저 파일 저장 폴더 연결을 완료하세요.',false);return}input.click()};
  input.onchange=async function(){var files=Array.prototype.slice.call(this.files);this.value='';for(var i=0;i<files.length;i+=1)await saveAsset(files[i])};
  window.addEventListener('checklist-kind-change',function(event){kind=event.detail&&event.detail.kind||'checklist';refreshPicker()});
  $('connectAssets').onclick=connect;
  kind=$('kind').value||'checklist';refreshPicker();
})();
