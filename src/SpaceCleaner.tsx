import {useEffect, useMemo, useRef, useState} from 'react'
import {
  Archive, ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronDown,
  File, FileAudio, FileImage, FileText, Film, FolderOpen, HardDrive,
  Info, Layers3, LoaderCircle, RefreshCw, ScanSearch, Search, ShieldCheck,
  Sparkles, Trash2, X, type LucideIcon
} from 'lucide-react'
import {open as openDialog} from '@tauri-apps/plugin-dialog'
import {
  basename, formatDate, formatSize, isTauri, openItem, quickLook,
  scanSpace, trashScannedFiles, type ScanReport, type LargeFile
} from './api'

const categoryIcons: Record<string,LucideIcon>={Videos:Film,Archives:Archive,Images:FileImage,Audio:FileAudio,Documents:FileText,Other:File}
const categoryColors:Record<string,string>={Videos:'#786df0',Archives:'#f0a665',Images:'#5cb5da',Audio:'#62bdac',Documents:'#9ea8bc',Other:'#b4a8df'}
const thresholds=[{label:'50 MB+',value:50},{label:'100 MB+',value:100},{label:'500 MB+',value:500},{label:'1 GB+',value:1024}]

interface Props {home:string; onOpenFolder:(path:string)=>void; notify:(message:string,error?:boolean)=>void}
export default function SpaceCleaner({home,onOpenFolder,notify}:Props){
  const [root,setRoot]=useState(home)
  const [threshold,setThreshold]=useState(100)
  const [includeHidden,setIncludeHidden]=useState(false)
  const [report,setReport]=useState<ScanReport|null>(null)
  const [scanning,setScanning]=useState(false)
  const [selected,setSelected]=useState<Set<string>>(new Set())
  const [category,setCategory]=useState('All files')
  const [query,setQuery]=useState('')
  const [sort,setSort]=useState<'size'|'name'|'date'>('size')
  const [confirm,setConfirm]=useState(false)
  const [removing,setRemoving]=useState(false)
  const [lastRun,setLastRun]=useState<number|null>(null)
  const scanSequence=useRef(0)
  useEffect(()=>()=>{scanSequence.current++},[])
  const [viewMore,setViewMore]=useState(false)
  const filtered=useMemo(()=>{
    if(!report)return []
    const lower=query.toLowerCase().trim()
    return report.files.filter(f=>(category==='All files'||f.category===category)&&(!lower||f.name.toLowerCase().includes(lower)||f.path.toLowerCase().includes(lower)))
      .sort((a,b)=>sort==='size'?b.size-a.size:sort==='date'?(b.modified||0)-(a.modified||0):a.name.localeCompare(b.name))
  },[report,category,query,sort])
  const visible=viewMore?filtered:filtered.slice(0,80)
  const selectedFiles=useMemo(()=>report?.files.filter(f=>selected.has(f.path))||[],[report,selected])
  const selectedBytes=selectedFiles.reduce((s,f)=>s+f.size,0)
  const diskUsed=report?.driveTotal!=null&&report.driveAvailable!=null?Math.max(0,report.driveTotal-report.driveAvailable):null
  const diskPct=report?.driveTotal&&diskUsed!==null?Math.min(100,Math.round(diskUsed/report.driveTotal*100)):0

  async function runScan(scanRoot=root,minimum=threshold,hidden=includeHidden){
    if(!scanRoot)return
    const thisScan=++scanSequence.current
    setScanning(true);setSelected(new Set());setCategory('All files');setQuery('');setViewMore(false)
    try {const found=await scanSpace(scanRoot,minimum,hidden);if(thisScan===scanSequence.current){setReport(found);setLastRun(Date.now())}}
    catch(e){if(thisScan===scanSequence.current)notify(String(e),true)} finally{if(thisScan===scanSequence.current)setScanning(false)}
  }
  async function chooseRoot(){
    if(!isTauri){notify('Native folder picker is available in the installed Mac app.');return}
    try{
      const picked=await openDialog({directory:true,multiple:false,title:'Choose folder to analyse'})
      if(typeof picked==='string'){scanSequence.current++;setScanning(false);setRoot(picked);setReport(null);setSelected(new Set())}
    }catch(e){notify(String(e),true)}
  }
  function toggle(path:string){setSelected(prev=>{const n=new Set(prev);if(n.has(path))n.delete(path);else n.add(path);return n})}
  function selectVisible(){
    const paths=filtered.map(f=>f.path)
    const all=paths.every(p=>selected.has(p))
    setSelected(s=>{const next=new Set(s);paths.forEach(p=>all?next.delete(p):next.add(p));return next})
  }
  async function doTrash(){
    if(!selectedFiles.length)return
    if(!isTauri){notify('Preview only — your real files are untouched.');setConfirm(false);return}
    setRemoving(true)
    try{
      const n=await trashScannedFiles(selectedFiles)
      notify(`${n} file${n===1?'':'s'} moved to macOS Trash`)
      setConfirm(false)
      await runScan()
    }catch(e){setConfirm(false);notify(String(e),true);await runScan()}finally{setRemoving(false)}
  }
  async function reveal(file:LargeFile){
    if(!isTauri){notify('Show in Finder works in the installed Mac app.');return}
    try{await openItem(file.path,true)}catch(e){notify(String(e),true)}
  }
  async function preview(file:LargeFile){
    if(!isTauri){notify('Quick Look works in the installed Mac app.');return}
    try{await quickLook(file.path)}catch(e){notify(String(e),true)}
  }
  useEffect(()=>{if(home&&root==='/Users/guest'&&home!=='/Users/guest')setRoot(home)},[home,root])
  return <div className="cleaner-root">
    <div className="cleaner-scroll">
      <header className="cleaner-header">
        <div className="cleaner-eyebrow"><span className="eyebrow-spark"><Sparkles size={13}/></span> YOUR SPACE, RECLAIMED <span className="cleaner-version">SPACE CLEANER</span></div>
        <div className="cleaner-title-row"><div><h1>Find space. <span>Feel lighter.</span></h1>
          <p>See what takes up room on your Mac. Keep what matters, clear what doesn't.</p></div>
          <div className="cleaner-secure"><ShieldCheck size={18}/><span><b>Safe by design</b><small>Nothing deleted automatically</small></span></div>
        </div>
      </header>

      <section className="cleaner-hero">
        <div className="cleaner-orb-wrap" aria-hidden="true"><div className="cleaner-orb-glow"/><div className="cleaner-orb"><span className="orb-inner"><HardDrive size={29}/><span>YOUR MAC</span></span></div><div className="orb-flare"/></div>
        <div className="cleaner-hero-copy"><span className="small-overline">STORAGE INTELLIGENCE</span><h2>A clearer view of<br/>your storage.</h2><p>Locate oversized videos, archives, downloads and more, without digging through folders.</p>
          <div className="scan-controls"><button className="scan-button" disabled={scanning} onClick={()=>void runScan()}>{scanning?<LoaderCircle size={18} className="spin"/>:<ScanSearch size={18}/>} {scanning?'Scanning files…':report?'Scan again':'Scan for large files'} <ArrowRight size={17}/></button><button className="scan-folder-button" onClick={()=>void chooseRoot()} title="Choose a scan folder"><FolderOpen size={17}/><span>Choose folder</span></button></div>
          <div className="scan-target"><span className="tiny-light"/>{scanning?'Analysing safely…':`Scanning ${basename(root)}`} · {threshold>=1024?'1 GB':`${threshold} MB`} and larger</div>
        </div>
        <div className="cleaner-hero-number"><span>AVAILABLE SPACE</span><strong>{report?.driveAvailable!=null?formatSize(report.driveAvailable):'—'}</strong><small>{report?.driveTotal!=null?`of ${formatSize(report.driveTotal)} total`:'Run a scan to see your drive'}</small></div>
      </section>

      <div className="cleaner-settings"><div><span className="setting-title">Find files larger than</span><div className="size-pills">{thresholds.map(t=><button key={t.value} className={threshold===t.value?'active':''} onClick={()=>{scanSequence.current++;setScanning(false);setThreshold(t.value);setReport(null);setSelected(new Set())}}>{t.label}</button>)}</div></div><label className="cleaner-toggle"><input type="checkbox" checked={includeHidden} onChange={e=>{scanSequence.current++;setScanning(false);setIncludeHidden(e.target.checked);setReport(null);setSelected(new Set())}}/><span className="toggle-track"/><span>Include hidden files</span></label></div>
      {report&&<div className="scan-root-path"><span title={root}>{root}</span><button onClick={()=>onOpenFolder(root)}><FolderOpen size={13}/> Open in Explorer <ArrowRight size={13}/></button></div>}
      {!isTauri&&<div className="cleaner-demo-note"><Info size={17}/><span>Interactive preview with fictional files and storage figures. The macOS app scans only folders you select.</span></div>}

      {report?<>
        <section className="cleaner-metrics" aria-label="Scan results">
          <div className="cleaner-metric"><span><Layers3 size={16}/> SCANNED STORAGE</span><strong>{formatSize(report.scannedBytes)}</strong><small>Across {report.scannedFiles.toLocaleString()} files</small></div>
          <div className="cleaner-metric featured"><span><ScanSearch size={16}/> LARGE FILES FOUND</span><strong>{report.matchingFiles.toLocaleString()}</strong><small>{formatSize(report.matchingBytes)} in files above threshold</small></div>
          <div className="cleaner-metric"><span><HardDrive size={16}/> DISK USAGE</span><strong>{diskUsed===null?'—':diskPct+'%'}</strong><div className="disk-progress"><span style={{width:diskPct+'%'}}/></div><small>{diskUsed!==null?`${formatSize(diskUsed)} used`:'Disk data unavailable'}</small></div>
        </section>
        <section className="cleaner-breakdown"><div className="cleaner-card-title"><div><span className="small-overline">THE BIG PICTURE</span><h2>What's taking up space</h2></div><span className="inline-note">Scan contents · by file type</span></div>
          <div className="category-bar">{report.categories.map(cat=><span key={cat.name} title={`${cat.name}: ${formatSize(cat.bytes)}`} style={{width:`${report.scannedBytes?100*cat.bytes/report.scannedBytes:0}%`,background:categoryColors[cat.name]||'#aaa'}}/>)}</div>
          <div className="category-tiles">{report.categories.map(cat=>{const Icon=categoryIcons[cat.name]||File;return <button key={cat.name} className={`category-tile ${category===cat.name?'selected':''}`} onClick={()=>setCategory(category===cat.name?'All files':cat.name)}><span className="cat-icon" style={{color:categoryColors[cat.name]}}><Icon size={18}/></span><span><b>{cat.name}</b><small>{cat.count.toLocaleString()} files</small></span><strong>{formatSize(cat.bytes)}</strong></button>})}</div>
        </section>
        <section className="cleaner-results">
          <div className="cleaner-card-title"><div><span className="small-overline">READY FOR REVIEW</span><h2>Large files <span className="files-count">{report.matchingFiles.toLocaleString()}</span></h2></div><div className="cleaner-list-actions"><button onClick={selectVisible} disabled={!filtered.length}><CheckCheck size={15}/>{filtered.length&&filtered.every(f=>selected.has(f.path))?'Deselect':'Select'} visible</button><button onClick={()=>void runScan()} title="Refresh scan"><RefreshCw size={16}/></button></div></div>
          <div className="cleaner-filter-bar"><div className="cleaner-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a file or path…"/></div><div className="filter-right"><button className={category==='All files'?'filter-active':''} onClick={()=>setCategory('All files')}>All files</button><select aria-label="Filter category" value={category} onChange={e=>setCategory(e.target.value)}><option value="All files">All categories</option>{report.categories.map(c=><option key={c.name} value={c.name}>{c.name}</option>)}</select><select aria-label="Sort files" value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="size">Largest first</option><option value="date">Newest first</option><option value="name">Name A–Z</option></select></div></div>
          <div className="cleaner-table"><div className="cleaner-table-head"><span/><span>NAME & LOCATION</span><span>CATEGORY</span><span>SIZE</span><span/></div>
            {visible.length?visible.map(file=>{const Icon=categoryIcons[file.category]||File;const checked=selected.has(file.path);return <div className={`cleaner-file ${checked?'picked':''}`} key={file.path}>
              <label className="cleaner-check"><input type="checkbox" checked={checked} onChange={()=>toggle(file.path)} aria-label={`Select ${file.name}`}/><span><Check size={13}/></span></label>
              <button className="cleaner-file-identity" onClick={()=>void preview(file)} title="Preview with Quick Look"><span className="cleaner-file-icon" style={{color:categoryColors[file.category]}}><Icon size={21}/></span><span><strong>{file.name}</strong><small>{file.path.replace(root+'/', '')} · {formatDate(file.modified)}</small></span></button>
              <span className="cleaner-kind">{file.category}</span><strong className="cleaner-filesize">{formatSize(file.size)}</strong>
              <button className="cleaner-reveal" onClick={()=>void reveal(file)} title="Reveal in Finder"><ArrowUpRight size={18}/></button>
            </div>}):<div className="cleaner-empty"><Search size={26}/><strong>No files matching these filters</strong><p>Try a smaller size or another category.</p></div>}
          </div>
          {filtered.length>80&&!viewMore&&<button className="cleaner-show-all" onClick={()=>setViewMore(true)}>Show all {filtered.length} results <ChevronDown size={16}/></button>}
          <div className="cleaner-list-footer"><Info size={14}/> {report.files.length<report.matchingFiles?`Showing the ${report.files.length} largest files; ${report.matchingFiles.toLocaleString()} matched in total.`:'Every matching result is listed.'} {report.limited?'The scan reached its safety limit; choose a smaller folder for a complete report.':''} {report.unreadable>0?`${report.unreadable} folders or files could not be read.`:''}</div>
        </section>
      </>:<div className={`cleaner-welcome ${scanning?'scanning':''}`}><div className="welcome-orbit"><ScanSearch size={30}/></div><h2>{scanning?'Looking for large files…':'Your storage story starts here'}</h2><p>{scanning?'Checking file sizes and categorising content. This can take time in large folders.':'Choose a threshold and scan your Home folder, or pick another folder above. No changes will be made to your files.'}</p>{scanning&&<div className="scan-progress-line"/>}</div>}
      <footer className="cleaner-privacy"><ShieldCheck size={16}/> Files stay on your device. The scan is local and read-only. {lastRun&&<span>Last scan: {new Date(lastRun).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>}</footer>
    </div>
    {selectedFiles.length>0&&<div className="cleaner-selection-bar"><div className="selection-count"><span>{selectedFiles.length}</span><div><strong>{selectedFiles.length} selected</strong><small>{formatSize(selectedBytes)} selected for review</small></div></div><button className="selection-clear" onClick={()=>setSelected(new Set())}>Clear selection</button><button className="selection-trash" onClick={()=>setConfirm(true)}><Trash2 size={17}/> Review & move to Trash <ArrowRight size={16}/></button></div>}
    {confirm&&<div className="cleaner-confirm-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setConfirm(false)}}><div className="cleaner-confirm" role="dialog" aria-modal="true" aria-label="Confirm moving selected files to Trash"><span className="confirm-warning"><Trash2 size={22}/></span><button className="confirm-close" onClick={()=>setConfirm(false)} aria-label="Close"><X size={18}/></button><h2>Move files to Trash?</h2><p>You're about to move <strong>{selectedFiles.length} file{selectedFiles.length===1?'':'s'}</strong> ({formatSize(selectedBytes)}) to macOS Trash. Review these carefully before proceeding.</p><div className="confirm-list">{selectedFiles.slice(0,5).map(f=><div key={f.path}><File size={14}/><span title={f.path}>{f.name}</span><strong>{formatSize(f.size)}</strong></div>)}{selectedFiles.length>5&&<small>+ {selectedFiles.length-5} more files</small>}</div><div className="confirm-note"><ShieldCheck size={16}/> Vela never permanently erases these files. You can restore them from macOS Trash, unless Trash is emptied later.</div><div className="confirm-actions"><button onClick={()=>setConfirm(false)}>Keep files</button><button className="confirm-danger" disabled={removing} onClick={()=>void doTrash()}>{removing?'Moving…':`Move ${selectedFiles.length} to Trash`}</button></div></div></div>}
  </div>
}
