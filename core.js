(function(root) {
  'use strict';

  function detectDelimiter(text) {
    const sample = text.split(/\r?\n/).find(s => s.trim()) || '';
    const counts = { ',': 0, '\t': 0, ';': 0 };
    let quoted = false;
    for (let i=0; i<sample.length; i++) {
      const ch = sample[i];
      if (ch === '"') {
        if (quoted && sample[i+1] === '"') i++;
        else quoted = !quoted;
      } else if (!quoted && Object.prototype.hasOwnProperty.call(counts,ch)) counts[ch]++;
    }
    return Object.keys(counts).sort((a,b) => counts[b]-counts[a])[0] || ',';
  }

  function parseCSV(text) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('Empty file. Upload a CSV or TSV export.');
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const delim = detectDelimiter(text);
    const rows=[];
    let field='', cells=[], quoted=false;
    for(let i=0;i<text.length;i++) {
      const ch=text[i];
      if(ch==='"') {
        if(quoted && text[i+1]==='"') { field+='"'; i++; }
        else if(!quoted && field==='') quoted=true;
        else if(quoted) quoted=false;
        else field+=ch;
      } else if(ch===delim && !quoted) { cells.push(field); field=''; }
      else if((ch==='\r'||ch==='\n')&&!quoted) {
        if(ch==='\r'&&text[i+1]==='\n') i++;
        cells.push(field); field='';
        if(cells.some(v => v.trim()!=='')) rows.push(cells);
        cells=[];
      } else field+=ch;
    }
    if(quoted) throw new Error('Unclosed quoted cell in the CSV/TSV file.');
    cells.push(field);
    if(cells.some(v=>v.trim()!=='')) rows.push(cells);
    if(rows.length<2) throw new Error('The file needs a header and at least one product row.');
    const headers=rows[0].map(x => x.trim());
    if(headers.some(h=>!h)) throw new Error('One or more header names are empty.');
    const values=rows.slice(1).map((row,idx)=>{
      const obj={};
      headers.forEach((header,i)=>obj[header] = (row[i] ?? '').trim());
      return {data:obj, rowNumber: idx+2};
    });
    return {headers, rows:values, delimiter:delim};
  }
  function norm(s) { return String(s||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,''); }
  function findField(headers, choices) {
    const normalized=choices.map(norm);
    return headers.find(h=>normalized.includes(norm(h))) || null;
  }
  const ID_FIELDS=['sku','variant sku','variant_sku','item_id','product_id','id','product id'];
  const PRICE_FIELDS=['price','regular_price','variant price','variant_price','unit_price'];
  const STOCK_FIELDS=['stock','quantity','stock_qty','inventory','inventory_qty','inventory_quantity','variant inventory qty','variant_inventory_qty','stock_quantity'];
  const STATUS_FIELDS=['availability','stock_status','in_stock','status'];
  function parseNumber(s) {
    if(s==null || String(s).trim()==='') return null;
    let v=String(s).trim().replace(/\s/g,'');
    // Currency codes are tolerated only when number is otherwise unambiguous.
    v = v.replace(/^(USD|EUR|GBP|CZK|PLN|AUD|CAD|\$|€|£)/i,'').replace(/(USD|EUR|GBP|CZK|PLN|AUD|CAD)$/i,'');
    if (/^-?\d+,\d{1,2}$/.test(v)) v=v.replace(',','.');
    if(!/^-?\d+(\.\d+)?$/.test(v)) return null;
    return Number(v);
  }
  function parseStockStatus(s) {
    const n=norm(s);
    if(['out_of_stock','outofstock','out','false','0','unavailable','sold_out','discontinued'].includes(n)) return 'out';
    if(['in_stock','instock','in','true','1','available','on_sale'].includes(n)) return 'in';
    return null;
  }
  function compareFeedFiles(oldText,newText, options={}) {
    const old=parseCSV(oldText), fresh=parseCSV(newText);
    const idOld=findField(old.headers, ID_FIELDS), idNew=findField(fresh.headers, ID_FIELDS);
    if(!idOld || !idNew) throw new Error('Missing product ID column. Add SKU or ID to both files.');
    const fieldChoices=[['Price',PRICE_FIELDS],['Stock quantity',STOCK_FIELDS],['Availability',STATUS_FIELDS],['GTIN / barcode',['gtin','barcode','ean','upc']],['Image URL',['image_link','image_url','image src','image_src']]];
    const oldMap=new Map(), newMap=new Map(), issues=[];
    function addIssue(level,type,sku,before,after,explanation) { issues.push({level,type,sku,before:String(before??''),after:String(after??''),explanation}); }
    function mapRows(parsed,idField,map,side) {
      for(const item of parsed.rows) {
        const id=item.data[idField];
        if(!id) { addIssue('High','Missing ID',`Row ${item.rowNumber} (${side})`,'','','Product ID / SKU is blank.'); continue; }
        if(map.has(id)) { addIssue('High','Duplicate ID',id,'','','This ID appears more than once in '+side+' file; later duplicate is ignored.'); continue; }
        map.set(id,item.data);
      }
    }
    mapRows(old,idOld,oldMap,'before'); mapRows(fresh,idNew,newMap,'after');
    let removed=0, added=0, changedItems=new Set(), stockOutSkuSet=new Set(), priceDrops=0;
    const changes=[];
    for(const [sku, prior] of oldMap.entries()) {
      if(!newMap.has(sku)) { removed++; addIssue('High','Product removed',sku,'Present','Missing','Product disappeared from the new supplier file.'); continue; }
      const now=newMap.get(sku);
      for(const [label,aliases] of fieldChoices) {
        const a=findField(old.headers,aliases), b=findField(fresh.headers,aliases);
        if(!a||!b) continue;
        const before=(prior[a]||'').trim(), after=(now[b]||'').trim();
        if(before===after) continue;
        changedItems.add(sku);
        changes.push({sku,field:label,before,after});
        if(before && !after) addIssue('High',`${label} cleared`,sku,before,after,'Previously populated field is now blank.');
        if(label==='Price') {
          const p=parseNumber(before), n=parseNumber(after);
          if(p!==null && n!==null && p>0) {
            const ratio=(n-p)/p;
            if(ratio <= -(options.priceDropFraction??0.4)) { priceDrops++; addIssue('High','Large price drop',sku,before,after,`Price decreased ${(ratio*-100).toFixed(1)}%; check whether it was intentional.`); }
            else if(ratio >= (options.priceRiseFraction??1)) addIssue('Medium','Large price increase',sku,before,after,`Price increased ${(ratio*100).toFixed(1)}%.`);
          } else if(after && n===null) addIssue('Medium','Unrecognized price',sku,before,after,'Could not safely parse the new price.');
        }
        if(label==='Stock quantity') {
          const p=parseNumber(before),n=parseNumber(after);
          if(p!==null && n!==null && p>0 && n<=0) { stockOutSkuSet.add(sku); addIssue('High','Stock dropped to zero',sku,before,after,'Previously available stock is now zero.'); }
        }
        if(label==='Availability' && parseStockStatus(before)==='in'&&parseStockStatus(after)==='out') {
          stockOutSkuSet.add(sku); addIssue('High','Availability flipped',sku,before,after,'Product switched from in stock to out of stock.');
        }
      }
    }
    for (const sku of newMap.keys()) if(!oldMap.has(sku)) added++;
    const stockOutFlips = stockOutSkuSet.size;
    const removedFraction = oldMap.size ? removed/oldMap.size : 0;
    if(removedFraction >= (options.removedFraction??0.3) && removed >= 2) {
      addIssue('Critical','Mass product removal','Whole catalog',oldMap.size,newMap.size,`${(removedFraction*100).toFixed(1)}% of original products vanished. Pause and review the sync before import.`);
    }
    if(oldMap.size && stockOutFlips/oldMap.size >= (options.stockOutFraction??0.3) && stockOutFlips>=2) {
      addIssue('Critical','Mass stock loss','Whole catalog',oldMap.size,stockOutFlips,`${stockOutFlips} products flipped to unavailable/zero stock. Pause and verify the supplier update.`);
    }
    const order={Critical:0,High:1,Medium:2};
    issues.sort((a,b)=>order[a.level]-order[b.level]||a.sku.localeCompare(b.sku));
    return {before:oldMap.size,after:newMap.size,removed,added,changed:changedItems.size,priceDrops,stockOutFlips,issues,changes,hasCritical:issues.some(x=>x.level==='Critical'), scannedFields:fieldChoices.filter(([,aliases])=>findField(old.headers,aliases)&&findField(fresh.headers,aliases)).map(x=>x[0])};
  }
  function csvEscape(v){
    let str=String(v??'');
    if (/^[\s]*[=+@-]/.test(str)) str="'"+str;
    return '"'+str.replace(/"/g,'""')+'"';
  }
  function exportIssuesCSV(issues) {
    const headers=['Severity','Issue','SKU','Before','After','Explanation'];
    return [headers,...issues.map(x=>[x.level,x.type,x.sku,x.before,x.after,x.explanation])].map(r=>r.map(csvEscape).join(',')).join('\r\n');
  }
  const api={parseCSV, compareFeedFiles, exportIssuesCSV};
  if(typeof module !=='undefined' && module.exports) module.exports=api;
  if(root) root.FeedTripwireCore=api;
})(typeof window !=='undefined'?window:null);
